"use strict";

// coreModel — 大模型网关（公共底座层）
// 所有应用云函数经 _internalToken 内部调用 generateText（同步，限 60s 内返回）；
// 长耗时文本生成走 createTextJob → runTextJob（后台自调用）→ getTextJob 轮询的异步 Job 模式。
// provider / binding 配置存 model_providers / app_model_bindings，由 adminCore 管理。

const cloud = require("wx-server-sdk");
const registry = require("./lib/registry");
const router = require("./lib/router");
const minimaxDriver = require("./drivers/minimax");
const cloudbaseAiDriver = require("./drivers/cloudbaseAi");
const kimiCodeDriver = require("./drivers/kimiCode");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const DRIVERS = {
  minimax: minimaxDriver,
  cloudbase_ai: cloudbaseAiDriver,
  kimi_code: kimiCodeDriver,
};

const MAX_MESSAGES = 32;
const MAX_MESSAGE_CHARS = 50000;

function makeResponse(ok, dataOrError, requestId) {
  if (ok) {
    return { ok: true, data: dataOrError || {}, requestId };
  }
  return { ok: false, error: dataOrError || { code: "UNKNOWN", message: "未知错误" }, requestId };
}

function getInternalToken() {
  return process.env.INTERNAL_API_SECRET || "";
}

function verifyInternal(event) {
  const token = getInternalToken();
  if (!token) return { code: "INTERNAL_SECRET_NOT_CONFIGURED", message: "内部调用凭据未配置" };
  if (!event || event._internalToken !== token) return { code: "FORBIDDEN", message: "内部接口，禁止直接调用" };
  return null;
}

function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    return `messages 必须为 1-${MAX_MESSAGES} 条`;
  }
  for (const item of messages) {
    if (!item || typeof item.role !== "string" || typeof item.content !== "string") {
      return "messages 元素必须为 { role, content }";
    }
    if (item.content.length > MAX_MESSAGE_CHARS) {
      return `单条消息长度不能超过 ${MAX_MESSAGE_CHARS} 字符`;
    }
  }
  return null;
}

// ─── generateText ───────────────────────────────────────

// 供 generateText 与 runTextJob 共用的文本生成链：返回 { ok, data|error }（不含 requestId 包络）
async function runTextChain({ appKey, capability, messages, overrides }) {
  const binding = await registry.getBinding(appKey, capability);
  if (!binding) {
    return { ok: false, error: { code: "MODEL_BINDING_MISSING", message: `未配置模型绑定：${appKey}__${capability}` } };
  }
  if (binding.enabled === false) {
    return { ok: false, error: { code: "MODEL_BINDING_DISABLED", message: `模型绑定已停用：${appKey}__${capability}` } };
  }

  const chain = router.buildProviderChain(binding);
  if (chain.length === 0) {
    return { ok: false, error: { code: "MODEL_BINDING_INVALID", message: "绑定未配置可用 provider" } };
  }

  const attempts = [];
  for (const providerKey of chain) {
    const provider = await registry.getProvider(providerKey);
    if (!provider) {
      attempts.push({ providerKey, code: "MODEL_PROVIDER_MISSING", message: "provider 不存在" });
      continue;
    }
    if (provider.enabled === false) {
      attempts.push({ providerKey, code: "MODEL_PROVIDER_DISABLED", message: "provider 已停用" });
      continue;
    }
    const driver = DRIVERS[provider.driver];
    if (!driver) {
      attempts.push({ providerKey, code: "MODEL_DRIVER_UNKNOWN", message: `未知驱动：${provider.driver}` });
      continue;
    }
    const config = router.mergeParams(provider.config, binding.paramOverrides, overrides);
    try {
      const output = await driver.chatComplete({ config, messages });
      attempts.push({ providerKey, ok: true });
      return { ok: true, data: { text: output.text, usage: output.usage, model: output.model, providerKey, attempts } };
    } catch (err) {
      const code = err.code || "MODEL_REQUEST_FAILED";
      attempts.push({ providerKey, code, message: err.message });
      if (!router.isTransientError(err)) {
        return { ok: false, error: { code, message: err.message, transient: false, providerKey, attempts } };
      }
      // transient：继续 fallback 链
    }
  }

  const last = attempts[attempts.length - 1] || {};
  return { ok: false, error: {
    code: last.code || "MODEL_ALL_PROVIDERS_FAILED",
    message: `全部模型提供方调用失败（${chain.length} 个）：${last.message || "无可用 provider"}`,
    transient: router.TRANSIENT_CODES.includes(last.code),
    allProvidersFailed: true,
    attempts,
  } };
}

async function generateText(event, context) {
  const requestId = context.requestId || Date.now().toString();
  const authError = verifyInternal(event);
  if (authError) return makeResponse(false, authError, requestId);

  const appKey = String(event.appKey || "").trim();
  const capability = String(event.capability || "").trim();
  if (!appKey || !capability) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "appKey 与 capability 不能为空" }, requestId);
  }
  const messagesError = validateMessages(event.messages);
  if (messagesError) {
    return makeResponse(false, { code: "INVALID_PARAM", message: messagesError }, requestId);
  }

  const result = await runTextChain({ appKey, capability, messages: event.messages, overrides: event.overrides });
  if (!result.ok) return makeResponse(false, result.error, requestId);
  return makeResponse(true, result.data, requestId);
}

// ─── 长耗时文本任务（异步 Job 模式） ─────────────────────
// 云函数间同步调用经 API 网关约 60s 即被切断，MiniMax M3 等思考型模型整课生成需 90s+，
// 长任务必须走 createTextJob →（自调用后台执行 runTextJob）→ getTextJob 轮询。
const JOBS = "model_async_jobs";
const JOB_TTL_MS = 24 * 3600 * 1000;

async function createTextJob(event, context) {
  const requestId = context.requestId || Date.now().toString();
  const authError = verifyInternal(event);
  if (authError) return makeResponse(false, authError, requestId);

  const appKey = String(event.appKey || "").trim();
  const capability = String(event.capability || "").trim();
  if (!appKey || !capability) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "appKey 与 capability 不能为空" }, requestId);
  }
  const messagesError = validateMessages(event.messages);
  if (messagesError) {
    return makeResponse(false, { code: "INVALID_PARAM", message: messagesError }, requestId);
  }

  const jobId = `mj_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const now = new Date();
  try {
    // 注意：不要预写 result/error 为 null，NoSQL 会把 null 固化为标量，
    // 后续 update 写入对象会报 "Cannot create field in element {error: null}"
    await db.collection(JOBS).doc(jobId).set({
      data: {
        status: "running",
        appKey,
        capability,
        messages: event.messages,
        overrides: event.overrides || null,
        createdAt: now,
        updatedAt: now,
        expiresAt: new Date(now.getTime() + JOB_TTL_MS),
      },
    });
  } catch (err) {
    return makeResponse(false, { code: "DB_ERROR", message: "创建模型任务失败: " + err.message }, requestId);
  }

  // 后台自调用执行，不等待其完成（与 app_paper_polish triggerRunTask 同模式）
  cloud.callFunction({
    name: "coreModel",
    data: { action: "runTextJob", _internalToken: getInternalToken(), jobId },
  }).catch((err) => {
    console.error(JSON.stringify({ event: "run_text_job_trigger_failed", jobId, error: err.message }));
  });

  return makeResponse(true, { jobId, status: "running" }, requestId);
}

async function runTextJob(event, context) {
  const requestId = context.requestId || Date.now().toString();
  const authError = verifyInternal(event);
  if (authError) return makeResponse(false, authError, requestId);

  const jobId = String(event.jobId || "").trim();
  if (!jobId) return makeResponse(false, { code: "INVALID_PARAM", message: "jobId 不能为空" }, requestId);

  let job = null;
  try {
    const res = await db.collection(JOBS).doc(jobId).get();
    job = res.data || null;
  } catch (err) {
    job = null;
  }
  if (!job) return makeResponse(false, { code: "JOB_NOT_FOUND", message: "模型任务不存在" }, requestId);
  if (job.status !== "running") {
    return makeResponse(true, { jobId, status: job.status, note: "任务已处理，跳过重复执行" }, requestId);
  }

  const finish = async (patch) => {
    await db.collection(JOBS).doc(jobId).update({ data: { ...patch, updatedAt: new Date() } });
  };

  try {
    const result = await runTextChain({
      appKey: job.appKey,
      capability: job.capability,
      messages: job.messages,
      overrides: job.overrides,
    });
    if (result.ok) {
      await finish({ status: "succeeded", result: result.data });
    } else {
      await finish({ status: "failed", error: result.error });
    }
  } catch (err) {
    await finish({ status: "failed", error: { code: err.code || "INTERNAL_ERROR", message: err.message || "模型任务执行失败" } });
  }
  return makeResponse(true, { jobId }, requestId);
}

async function getTextJob(event, context) {
  const requestId = context.requestId || Date.now().toString();
  const authError = verifyInternal(event);
  if (authError) return makeResponse(false, authError, requestId);

  const jobId = String(event.jobId || "").trim();
  if (!jobId) return makeResponse(false, { code: "INVALID_PARAM", message: "jobId 不能为空" }, requestId);

  let job = null;
  try {
    const res = await db.collection(JOBS).doc(jobId).get();
    job = res.data || null;
  } catch (err) {
    job = null;
  }
  if (!job) return makeResponse(false, { code: "JOB_NOT_FOUND", message: "模型任务不存在" }, requestId);
  return makeResponse(true, { jobId, status: job.status, data: job.result || null, error: job.error || null }, requestId);
}

// ─── generateImage / generateSpeech（多模态输出） ─────────

// 与 generateText 相同的绑定解析 + fallback 链（仅 transient 错误切换 provider），
// 但要求 provider.type 与所需能力匹配，且 driver 实现了对应能力函数。
async function invokeProviderChain({ appKey, capability, requiredType, invoke, requestId }) {
  const binding = await registry.getBinding(appKey, capability);
  if (!binding) {
    return makeResponse(false, { code: "MODEL_BINDING_MISSING", message: `未配置模型绑定：${appKey}__${capability}` }, requestId);
  }
  if (binding.enabled === false) {
    return makeResponse(false, { code: "MODEL_BINDING_DISABLED", message: `模型绑定已停用：${appKey}__${capability}` }, requestId);
  }

  const chain = router.buildProviderChain(binding);
  if (chain.length === 0) {
    return makeResponse(false, { code: "MODEL_BINDING_INVALID", message: "绑定未配置可用 provider" }, requestId);
  }

  const attempts = [];
  for (const providerKey of chain) {
    const provider = await registry.getProvider(providerKey);
    if (!provider) {
      attempts.push({ providerKey, code: "MODEL_PROVIDER_MISSING", message: "provider 不存在" });
      continue;
    }
    if (provider.enabled === false) {
      attempts.push({ providerKey, code: "MODEL_PROVIDER_DISABLED", message: "provider 已停用" });
      continue;
    }
    if (provider.type !== requiredType) {
      attempts.push({ providerKey, code: "MODEL_PROVIDER_TYPE_MISMATCH", message: `provider 类型不匹配：期望 ${requiredType}，实际 ${provider.type}` });
      return makeResponse(false, { code: "MODEL_PROVIDER_TYPE_MISMATCH", message: `provider ${providerKey} 类型为 ${provider.type}，不支持 ${requiredType} 能力`, providerKey, attempts }, requestId);
    }
    const driver = DRIVERS[provider.driver];
    if (!driver) {
      attempts.push({ providerKey, code: "MODEL_DRIVER_UNKNOWN", message: `未知驱动：${provider.driver}` });
      continue;
    }
    const config = router.mergeParams(provider.config, binding.paramOverrides, null);
    try {
      const output = await invoke(driver, config);
      attempts.push({ providerKey, ok: true });
      return makeResponse(true, { ...output, providerKey, attempts }, requestId);
    } catch (err) {
      const code = err.code || "MODEL_REQUEST_FAILED";
      attempts.push({ providerKey, code, message: err.message });
      if (!router.isTransientError(err)) {
        return makeResponse(false, { code, message: err.message, transient: false, providerKey, attempts }, requestId);
      }
    }
  }

  const last = attempts[attempts.length - 1] || {};
  return makeResponse(false, {
    code: last.code || "MODEL_ALL_PROVIDERS_FAILED",
    message: `全部模型提供方调用失败（${chain.length} 个）：${last.message || "无可用 provider"}`,
    transient: router.TRANSIENT_CODES.includes(last.code),
    allProvidersFailed: true,
    attempts,
  }, requestId);
}

async function generateImage(event, context) {
  const requestId = context.requestId || Date.now().toString();
  const authError = verifyInternal(event);
  if (authError) return makeResponse(false, authError, requestId);

  const appKey = String(event.appKey || "").trim();
  const capability = String(event.capability || "").trim();
  const prompt = String(event.prompt || "").trim();
  if (!appKey || !capability || !prompt) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "appKey、capability 与 prompt 不能为空" }, requestId);
  }

  return invokeProviderChain({
    appKey,
    capability,
    requiredType: "image_gen",
    requestId,
    invoke: (driver, config) => {
      if (typeof driver.generateImage !== "function") {
        throw Object.assign(new Error(`驱动 ${config.driver || "unknown"} 不支持图像生成`), { code: "MODEL_CAPABILITY_UNSUPPORTED" });
      }
      return driver.generateImage({ config, prompt, overrides: event.overrides });
    },
  });
}

async function generateSpeech(event, context) {
  const requestId = context.requestId || Date.now().toString();
  const authError = verifyInternal(event);
  if (authError) return makeResponse(false, authError, requestId);

  const appKey = String(event.appKey || "").trim();
  const capability = String(event.capability || "").trim();
  const text = String(event.text || "").trim();
  if (!appKey || !capability || !text) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "appKey、capability 与 text 不能为空" }, requestId);
  }

  return invokeProviderChain({
    appKey,
    capability,
    requiredType: "audio_tts",
    requestId,
    invoke: (driver, config) => {
      if (typeof driver.generateSpeech !== "function") {
        throw Object.assign(new Error("当前驱动不支持语音合成"), { code: "MODEL_CAPABILITY_UNSUPPORTED" });
      }
      return driver.generateSpeech({ config, text, overrides: event.overrides });
    },
  });
}

// ─── smokeProvider ──────────────────────────────────────

async function smokeProvider(event, context) {
  const requestId = context.requestId || Date.now().toString();
  const authError = verifyInternal(event);
  if (authError) return makeResponse(false, authError, requestId);

  const providerKey = String(event.providerKey || "").trim();
  if (!providerKey) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "providerKey 不能为空" }, requestId);
  }
  const provider = await registry.getProvider(providerKey);
  if (!provider) {
    return makeResponse(false, { code: "MODEL_PROVIDER_MISSING", message: "provider 不存在" }, requestId);
  }
  const driver = DRIVERS[provider.driver];
  if (!driver) {
    return makeResponse(false, { code: "MODEL_DRIVER_UNKNOWN", message: `未知驱动：${provider.driver}` }, requestId);
  }

  const startedAt = Date.now();
  const type = provider.type || "text_chat";
  try {
    let result;
    if (type === "image_gen") {
      if (typeof driver.generateImage !== "function") {
        throw Object.assign(new Error("当前驱动不支持图像生成"), { code: "MODEL_CAPABILITY_UNSUPPORTED" });
      }
      const output = await driver.generateImage({
        config: router.mergeParams(provider.config, null, null),
        prompt: "一朵紫色的小花，极简插画风格",
      });
      result = { providerKey, model: output.model, imageCount: (output.urls || []).length, sampleUrl: (output.urls || [])[0] || "" };
    } else if (type === "audio_tts") {
      if (typeof driver.generateSpeech !== "function") {
        throw Object.assign(new Error("当前驱动不支持语音合成"), { code: "MODEL_CAPABILITY_UNSUPPORTED" });
      }
      const output = await driver.generateSpeech({
        config: router.mergeParams(provider.config, null, null),
        text: "连通性测试。",
      });
      result = { providerKey, model: output.model, format: output.format, audioBytes: output.audioBase64 ? Math.floor(output.audioBase64.length * 3 / 4) : 0 };
    } else {
      const output = await driver.chatComplete({
        config: router.mergeParams(provider.config, null, null),
        messages: [
          { role: "system", content: "只返回 JSON：{\"ok\":true}。" },
          { role: "user", content: "连通性测试" },
        ],
      });
      result = { providerKey, model: output.model, text: output.text.slice(0, 200) };
    }
    return makeResponse(true, {
      ...result,
      latencyMs: Date.now() - startedAt,
    }, requestId);
  } catch (err) {
    return makeResponse(false, {
      code: err.code || "MODEL_REQUEST_FAILED",
      message: err.message,
      transient: router.isTransientError(err),
      providerKey,
      latencyMs: Date.now() - startedAt,
    }, requestId);
  }
}

// ─── seedDefaults ───────────────────────────────────────

async function seedIfMissing(collection, filter, data, created, skipped) {
  const existing = await collection.where(filter).limit(1).get();
  if (existing.data && existing.data.length > 0) {
    skipped.push(filter.providerKey || filter._id);
    return false;
  }
  await collection.add({ data });
  created.push(filter.providerKey || data._id);
  return true;
}

async function seedDefaults(event, context) {
  const requestId = context.requestId || Date.now().toString();
  const authError = verifyInternal(event);
  if (authError) return makeResponse(false, authError, requestId);

  const now = new Date();
  const createdProviders = [];
  const createdBindings = [];
  const skipped = [];

  try {
    const minimaxKey = "minimax_default";
  await seedIfMissing(
    db.collection(registry.PROVIDERS),
    { providerKey: minimaxKey },
    {
      providerKey: minimaxKey,
      displayName: "MiniMax（默认）",
      type: "text_chat",
      driver: "minimax",
      config: {
        baseUrl: String(process.env.MINIMAX_BASE_URL || "https://api.minimaxi.com/v1"),
        model: String(process.env.MAIC_AI_MODEL || "MiniMax-M2.7"),
        secretEnv: "MINIMAX_API_KEY",
        temperature: 0.35,
        maxTokens: 12000,
        timeoutMs: 240000,
      },
      enabled: true,
      createdAt: now,
      updatedAt: now,
    },
    createdProviders,
    skipped
  );

  const cloudbaseModel = String(process.env.CLOUDBASE_AI_MODEL || "").trim();
  let cloudbaseKey = null;
  if (cloudbaseModel) {
    cloudbaseKey = "cloudbase_ai_default";
    await seedIfMissing(
      db.collection(registry.PROVIDERS),
      { providerKey: cloudbaseKey },
      {
        providerKey: cloudbaseKey,
        displayName: "CloudBase AI（默认）",
        type: "text_chat",
        driver: "cloudbase_ai",
        config: { model: cloudbaseModel },
        enabled: true,
        createdAt: now,
        updatedAt: now,
      },
      createdProviders,
      skipped
    );
  }

  // MiniMax 图像 / 语音条目：与 minimax_default 共用 MINIMAX_API_KEY，
  // 不自动建绑定，由管理端按需绑定到应用 capability。
  const minimaxBaseUrl = String(process.env.MINIMAX_BASE_URL || "https://api.minimaxi.com/v1");
  await seedIfMissing(
    db.collection(registry.PROVIDERS),
    { providerKey: "minimax_image_default" },
    {
      providerKey: "minimax_image_default",
      displayName: "MiniMax 图像（image-01）",
      type: "image_gen",
      driver: "minimax",
      config: {
        baseUrl: minimaxBaseUrl,
        model: "image-01",
        secretEnv: "MINIMAX_API_KEY",
        aspectRatio: "1:1",
        timeoutMs: 240000,
      },
      enabled: true,
      createdAt: now,
      updatedAt: now,
    },
    createdProviders,
    skipped
  );
  await seedIfMissing(
    db.collection(registry.PROVIDERS),
    { providerKey: "minimax_speech_default" },
    {
      providerKey: "minimax_speech_default",
      displayName: "MiniMax 语音（speech-02-hd）",
      type: "audio_tts",
      driver: "minimax",
      config: {
        baseUrl: minimaxBaseUrl,
        model: "speech-02-hd",
        secretEnv: "MINIMAX_API_KEY",
        voiceId: "male-qn-qingse",
        timeoutMs: 240000,
      },
      enabled: true,
      createdAt: now,
      updatedAt: now,
    },
    createdProviders,
    skipped
  );

  // Kimi Code token plan（Anthropic 兼容）：仅在配置了 KIMI_API_KEY 时 seed。
  if (String(process.env.KIMI_API_KEY || "").trim()) {
    await seedIfMissing(
      db.collection(registry.PROVIDERS),
      { providerKey: "kimi_k3_256k" },
      {
        providerKey: "kimi_k3_256k",
        displayName: "Kimi Code（k3-256k）",
        type: "text_chat",
        driver: "kimi_code",
        config: {
          baseUrl: "https://api.kimi.com/coding",
          model: "k3-256k",
          secretEnv: "KIMI_API_KEY",
          maxTokens: 8000,
          timeoutMs: 240000,
        },
        enabled: true,
        createdAt: now,
        updatedAt: now,
      },
      createdProviders,
      skipped
    );
  }

  const bindings = [{ appKey: "maic", capability: "course_generate", providerKey: minimaxKey }];
  if (cloudbaseKey) {
    for (const capability of ["npc_speech", "npc_vote", "debrief"]) {
      bindings.push({ appKey: "nursing_undercover", capability, providerKey: cloudbaseKey });
    }
  }

  for (const item of bindings) {
    const id = router.bindingId(item.appKey, item.capability);
    let exists = null;
    try {
      const res = await db.collection(registry.BINDINGS).doc(id).get();
      exists = res.data || null;
    } catch (err) {
      exists = null;
    }
    if (exists) {
      skipped.push(id);
      continue;
    }
    await db.collection(registry.BINDINGS).doc(id).set({
      data: {
        appKey: item.appKey,
        capability: item.capability,
        providerKey: item.providerKey,
        fallbackProviderKeys: [],
        paramOverrides: {},
        enabled: true,
        updatedAt: now,
      },
    });
    createdBindings.push(id);
  }

    registry.invalidate();
    return makeResponse(true, { createdProviders, createdBindings, skipped }, requestId);
  } catch (err) {
    return makeResponse(false, { code: "DB_ERROR", message: "种子数据写入失败: " + err.message }, requestId);
  }
}

// ─── 主入口 ─────────────────────────────────────────────

exports.main = async (event, context) => {
  const { action } = event;
  const requestId = (context && context.requestId) || Date.now().toString();

  const actionMap = {
    generateText,
    generateImage,
    generateSpeech,
    createTextJob,
    runTextJob,
    getTextJob,
    smokeProvider,
    seedDefaults,
  };

  const handler = actionMap[action];
  if (handler) {
    try {
      return await handler(event, context);
    } catch (err) {
      return makeResponse(false, { code: err.code || "INTERNAL_ERROR", message: err.message || "coreModel 内部错误" }, requestId);
    }
  }

  return makeResponse(false, { code: "UNKNOWN_ACTION", message: "未知 action: " + action }, requestId);
};
