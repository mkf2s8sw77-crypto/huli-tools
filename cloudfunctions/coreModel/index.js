"use strict";

// coreModel — 大模型网关（公共底座层）
// 所有应用云函数经 _internalToken 内部调用 generateText；
// provider / binding 配置存 model_providers / app_model_bindings，由 adminCore 管理。

const registry = require("./lib/registry");
const router = require("./lib/router");
const minimaxDriver = require("./drivers/minimax");
const cloudbaseAiDriver = require("./drivers/cloudbaseAi");

const DRIVERS = {
  minimax: minimaxDriver,
  cloudbase_ai: cloudbaseAiDriver,
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
    const driver = DRIVERS[provider.driver];
    if (!driver) {
      attempts.push({ providerKey, code: "MODEL_DRIVER_UNKNOWN", message: `未知驱动：${provider.driver}` });
      continue;
    }
    const config = router.mergeParams(provider.config, binding.paramOverrides, event.overrides);
    try {
      const output = await driver.chatComplete({ config, messages: event.messages });
      attempts.push({ providerKey, ok: true });
      return makeResponse(true, {
        text: output.text,
        usage: output.usage,
        model: output.model,
        providerKey,
        attempts,
      }, requestId);
    } catch (err) {
      const code = err.code || "MODEL_REQUEST_FAILED";
      attempts.push({ providerKey, code, message: err.message });
      if (!router.isTransientError(err)) {
        return makeResponse(false, { code, message: err.message, transient: false, providerKey, attempts }, requestId);
      }
      // transient：继续 fallback 链
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
  try {
    const output = await driver.chatComplete({
      config: router.mergeParams(provider.config, null, null),
      messages: [
        { role: "system", content: "只返回 JSON：{\"ok\":true}。" },
        { role: "user", content: "连通性测试" },
      ],
    });
    return makeResponse(true, {
      providerKey,
      model: output.model,
      text: output.text.slice(0, 200),
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

  const cloud = require("wx-server-sdk");
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
  const db = cloud.database();
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
