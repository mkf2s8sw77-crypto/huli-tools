const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

const APP_KEY = "paper_polish";
const TASK_COLLECTION = "app_paper_polish_tasks";
const TASK_RETENTION_DAYS = 7;
const TASK_TIMEOUT_MS = 10 * 60 * 1000;
const MODEL_CAPABILITY = "polish";
const MODEL_OVERRIDES = { temperature: 0.3, maxTokens: 8192, timeoutMs: 240000 };
const MIN_POLISHED_CHARS = 50;

// 模型配置类错误：服务不可用，提示联系管理员，不自行重试
const MODEL_CONFIG_ERROR_CODES = [
  "MODEL_BINDING_MISSING",
  "MODEL_BINDING_DISABLED",
  "MODEL_PROVIDER_MISSING",
  "MODEL_PROVIDER_DISABLED",
  "INTERNAL_SECRET_NOT_CONFIGURED",
  "FORBIDDEN",
];

const promptBuilder = require("./lib/prompt-builder");

function makeResponse(ok, dataOrError, requestId) {
  if (ok) {
    return { ok: true, data: dataOrError || {}, requestId };
  }
  return { ok: false, error: dataOrError || { code: "UNKNOWN", message: "未知错误" }, requestId };
}

function getInternalToken() {
  return process.env.INTERNAL_API_SECRET || "";
}

function buildUsageActionData(openid, data) {
  const token = getInternalToken();
  if (!token) {
    return data;
  }
  return {
    ...data,
    _internalToken: token,
    userId: openid,
  };
}

function getTimeValue(value) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function getRetentionExpiresAt() {
  return new Date(Date.now() + TASK_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

// 返回给客户端的任务视图（不回传原始草稿，节省流量）
function presentTask(task) {
  return {
    usageId: task.usageId,
    status: task.status,
    inputChars: task.inputChars || 0,
    sections: task.sections || [],
    language: task.language || "",
    resultText: task.status === "succeeded" ? task.resultText || "" : "",
    summary: task.status === "succeeded" ? task.summary || [] : [],
    degraded: task.status === "succeeded" ? Boolean(task.degraded) : false,
    model: task.model || "",
    errorCode: task.errorCode || "",
    errorMessage: task.errorMessage || "",
    createdAt: task.createdAt || null,
    finishedAt: task.finishedAt || null,
  };
}

async function validateUsage(usageId, openid, requestId, allowedStatuses) {
  let usage;
  try {
    const usageRes = await db.collection("app_usage_records").doc(usageId).get();
    usage = usageRes.data || null;
  } catch (err) {
    return { ok: false, response: makeResponse(false, { code: "DB_ERROR", message: "查询使用记录失败: " + err.message }, requestId) };
  }

  if (!usage) {
    return { ok: false, response: makeResponse(false, { code: "USAGE_NOT_FOUND", message: "使用记录不存在" }, requestId) };
  }
  if (usage.userId !== openid) {
    return { ok: false, response: makeResponse(false, { code: "FORBIDDEN", message: "无权操作该使用记录" }, requestId) };
  }
  if (usage.appKey !== APP_KEY) {
    return { ok: false, response: makeResponse(false, { code: "APP_MISMATCH", message: "使用记录不属于护理论文英文润色应用" }, requestId) };
  }
  const statuses = allowedStatuses || ["created"];
  if (!statuses.includes(usage.status)) {
    return { ok: false, response: makeResponse(false, { code: "INVALID_STATUS", message: "使用记录状态不可执行" }, requestId) };
  }

  return { ok: true, usage };
}

async function callFinishUsage(openid, usageId, resultRef) {
  try {
    const finishRes = await cloud.callFunction({
      name: "coreApp",
      data: buildUsageActionData(openid, {
        action: "finishUsage",
        usageId,
        resultRef,
      }),
    });
    const finishResult = finishRes.result;
    if (!finishResult || !finishResult.ok) {
      const error = finishResult && finishResult.error ? finishResult.error : { code: "FINISH_FAILED", message: "结算失败" };
      if (error.code === "USAGE_ALREADY_FINISHED") {
        return { ok: true, alreadyFinished: true };
      }
      return { ok: false, error };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: { code: "FINISH_FAILED", message: "结算调用失败: " + err.message } };
  }
}

async function callFailUsage(openid, usageId, errorCode, errorMessage) {
  try {
    const failRes = await cloud.callFunction({
      name: "coreApp",
      data: buildUsageActionData(openid, {
        action: "failUsage",
        usageId,
        errorCode: errorCode || "BIZ_ERROR",
        errorMessage: errorMessage || "业务执行失败",
      }),
    });
    const failResult = failRes.result;
    if (!failResult || !failResult.ok) {
      const error = failResult && failResult.error ? failResult.error : { code: "FAIL_USAGE_FAILED", message: "释放积分失败" };
      if (error.code === "USAGE_ALREADY_FAILED") {
        return { ok: true, alreadyFailed: true };
      }
      return { ok: false, error };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: { code: "FAIL_USAGE_FAILED", message: "释放积分调用失败: " + err.message } };
  }
}

async function getTask(usageId) {
  try {
    const res = await db.collection(TASK_COLLECTION).doc(usageId).get();
    return res.data || null;
  } catch (err) {
    return null;
  }
}

async function createTask(task) {
  const now = new Date();
  await db.collection(TASK_COLLECTION).doc(task.usageId).set({
    data: {
      userId: task.userId,
      usageId: task.usageId,
      status: "processing",
      inputText: task.inputText,
      inputChars: task.inputChars,
      sections: task.sections || [],
      language: task.language || "",
      resultText: null,
      summary: [],
      degraded: false,
      model: "",
      providerKey: "",
      usage: null,
      errorCode: null,
      errorMessage: null,
      expiresAt: getRetentionExpiresAt(),
      createdAt: now,
      updatedAt: now,
      finishedAt: null,
    },
  });
}

async function updateTask(usageId, data) {
  try {
    await db.collection(TASK_COLLECTION).doc(usageId).update({
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });
  } catch (err) {
    console.error("更新润色任务失败:", err.message);
  }
}

// 触发后台执行：函数间自调用，不等待其完成
function triggerRunTask(openid, usageId) {
  const token = getInternalToken();
  cloud.callFunction({
    name: "app_paper_polish",
    data: {
      action: "runTask",
      usageId,
      userId: openid,
      _internalToken: token,
    },
  }).catch((err) => {
    console.error("触发润色后台任务失败:", err.message);
  });
}

function classifyModelError(error) {
  const code = error && error.code ? error.code : "";
  const message = error && error.message ? error.message : "润色失败";
  if (MODEL_CONFIG_ERROR_CODES.indexOf(code) !== -1) {
    return { code: "POLISH_SERVICE_UNAVAILABLE", message: "润色服务未配置或暂不可用，请联系管理员" };
  }
  if (code === "MODEL_RATE_LIMITED") {
    return { code: "POLISH_RATE_LIMITED", message: "模型服务繁忙，请稍后重新提交" };
  }
  return { code: "POLISH_FAILED", message: message };
}

// ── submit：客户端提交润色任务 ──
async function submit(event, context) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const requestId = context.requestId || Date.now().toString();
  const { usageId, text } = event;

  if (!openid) {
    return makeResponse(false, { code: "UNAUTHORIZED", message: "无法获取用户身份" }, requestId);
  }
  if (!usageId) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "缺少 usageId" }, requestId);
  }

  const usageCheck = await validateUsage(usageId, openid, requestId, ["created"]);
  if (!usageCheck.ok) {
    return usageCheck.response;
  }

  // 幂等：任务已存在时按当前状态直接返回
  const existing = await getTask(usageId);
  if (existing) {
    if (existing.status === "processing" || existing.status === "succeeded") {
      return makeResponse(true, presentTask(existing), requestId);
    }
    return makeResponse(false, { code: "TASK_ALREADY_FINISHED", message: "该使用记录已执行过，请重新发起" }, requestId);
  }

  const inputError = promptBuilder.validateInput(text);
  if (inputError) {
    await callFailUsage(openid, usageId, inputError.code, inputError.message);
    return makeResponse(false, inputError, requestId);
  }

  const sections = promptBuilder.normalizeSections(event.sections);
  const language = promptBuilder.detectLanguage(text);

  try {
    await createTask({
      userId: openid,
      usageId,
      inputText: text,
      inputChars: text.length,
      sections,
      language,
    });
  } catch (err) {
    await callFailUsage(openid, usageId, "TASK_CREATE_FAILED", "创建润色任务失败: " + err.message);
    return makeResponse(false, { code: "TASK_CREATE_FAILED", message: "创建润色任务失败: " + err.message }, requestId);
  }

  triggerRunTask(openid, usageId);

  return makeResponse(true, { usageId, status: "processing", inputChars: text.length, sections, language }, requestId);
}

// ── runTask：内部后台执行，校验 _internalToken ──
async function runTask(event, context) {
  const requestId = context.requestId || Date.now().toString();
  const configuredToken = getInternalToken();
  if (!configuredToken) {
    return makeResponse(false, { code: "INTERNAL_SECRET_NOT_CONFIGURED", message: "内部调用凭据未配置" }, requestId);
  }
  if (event._internalToken !== configuredToken) {
    return makeResponse(false, { code: "FORBIDDEN", message: "无权执行内部任务" }, requestId);
  }

  const { usageId, userId } = event;
  if (!usageId || !userId) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "缺少 usageId 或 userId" }, requestId);
  }

  const task = await getTask(usageId);
  if (!task) {
    return makeResponse(false, { code: "TASK_NOT_FOUND", message: "润色任务不存在" }, requestId);
  }
  if (task.userId !== userId) {
    return makeResponse(false, { code: "FORBIDDEN", message: "任务归属不匹配" }, requestId);
  }
  if (task.status !== "processing") {
    return makeResponse(true, { usageId, status: task.status, note: "任务已处理，跳过重复执行" }, requestId);
  }

  const failTask = async (errorCode, errorMessage) => {
    await updateTask(usageId, {
      status: "failed",
      errorCode,
      errorMessage,
      finishedAt: new Date(),
    });
    await callFailUsage(userId, usageId, errorCode, errorMessage);
  };

  try {
    const built = promptBuilder.buildMessages({ text: task.inputText, sections: task.sections, language: task.language });
    const modelRes = await cloud.callFunction({
      name: "coreModel",
      data: {
        action: "generateText",
        _internalToken: configuredToken,
        appKey: APP_KEY,
        capability: MODEL_CAPABILITY,
        messages: built.messages,
        overrides: MODEL_OVERRIDES,
      },
    });
    const modelResult = modelRes.result;

    if (!modelResult || !modelResult.ok) {
      const modelError = modelResult && modelResult.error ? modelResult.error : { code: "POLISH_FAILED", message: "模型调用失败" };
      const classified = classifyModelError(modelError);
      await failTask(classified.code, classified.message);
      return makeResponse(false, classified, requestId);
    }

    const parsed = promptBuilder.parseModelOutput(modelResult.data && modelResult.data.text);
    if (!parsed.ok) {
      await failTask(parsed.error.code, parsed.error.message);
      return makeResponse(false, parsed.error, requestId);
    }
    if (parsed.polished.length < MIN_POLISHED_CHARS) {
      await failTask("POLISH_OUTPUT_INVALID", "模型返回内容异常短，判定为失败，请重新提交");
      return makeResponse(false, { code: "POLISH_OUTPUT_INVALID", message: "模型返回内容异常" }, requestId);
    }

    const finishedAt = new Date();
    await updateTask(usageId, {
      status: "succeeded",
      resultText: parsed.polished,
      summary: parsed.summary,
      degraded: parsed.degraded,
      model: modelResult.data && modelResult.data.model ? modelResult.data.model : "",
      providerKey: modelResult.data && modelResult.data.providerKey ? modelResult.data.providerKey : "",
      usage: modelResult.data && modelResult.data.usage ? modelResult.data.usage : null,
      finishedAt,
    });

    const finishRes = await callFinishUsage(userId, usageId, JSON.stringify({
      status: "succeeded",
      inputChars: task.inputChars,
      resultChars: parsed.polished.length,
      model: modelResult.data && modelResult.data.model ? modelResult.data.model : "",
    }));
    if (!finishRes.ok) {
      console.error("润色任务结算失败（结果已生成）:", finishRes.error);
    }

    return makeResponse(true, { usageId, status: "succeeded", resultChars: parsed.polished.length }, requestId);
  } catch (err) {
    console.error("润色后台任务异常:", err);
    await failTask("POLISH_FAILED", "润色执行异常: " + (err.message || "未知错误"));
    return makeResponse(false, { code: "POLISH_FAILED", message: "润色执行异常: " + (err.message || "未知错误") }, requestId);
  }
}

// ── query：客户端轮询任务状态，带 read-time 超时兜底 ──
async function query(event, context) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const requestId = context.requestId || Date.now().toString();
  const { usageId } = event;

  if (!openid) {
    return makeResponse(false, { code: "UNAUTHORIZED", message: "无法获取用户身份" }, requestId);
  }
  if (!usageId) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "缺少 usageId" }, requestId);
  }

  const usageCheck = await validateUsage(usageId, openid, requestId, ["created", "frozen", "succeeded", "failed", "released"]);
  if (!usageCheck.ok) {
    return usageCheck.response;
  }

  const task = await getTask(usageId);
  if (!task) {
    return makeResponse(false, { code: "TASK_NOT_FOUND", message: "润色任务不存在或未创建成功" }, requestId);
  }
  if (task.userId !== openid) {
    return makeResponse(false, { code: "FORBIDDEN", message: "无权操作该任务" }, requestId);
  }

  // 超时兜底：后台执行异常退出时，由读取方结算
  if (task.status === "processing" && Date.now() - getTimeValue(task.createdAt) > TASK_TIMEOUT_MS) {
    await updateTask(usageId, {
      status: "timed_out",
      errorCode: "POLISH_TIMED_OUT",
      errorMessage: "润色任务超时未完成，请重新提交",
      finishedAt: new Date(),
    });
    await callFailUsage(openid, usageId, "POLISH_TIMED_OUT", "润色任务超时未完成");
    const refreshed = await getTask(usageId);
    return makeResponse(true, presentTask(refreshed || { ...task, status: "timed_out" }), requestId);
  }

  return makeResponse(true, presentTask(task), requestId);
}

// ── latest：页面重新进入时恢复最近任务 ──
async function latest(event, context) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const requestId = context.requestId || Date.now().toString();

  if (!openid) {
    return makeResponse(false, { code: "UNAUTHORIZED", message: "无法获取用户身份" }, requestId);
  }

  let tasks = [];
  try {
    const res = await db.collection(TASK_COLLECTION)
      .where({ userId: openid })
      .limit(20)
      .get();
    tasks = res.data || [];
  } catch (err) {
    return makeResponse(false, { code: "DB_ERROR", message: "查询润色任务失败: " + err.message }, requestId);
  }

  if (!tasks.length) {
    return makeResponse(true, { task: null }, requestId);
  }

  tasks.sort((a, b) => getTimeValue(b.createdAt) - getTimeValue(a.createdAt));
  const processing = tasks.find((task) => task.status === "processing");
  const picked = processing || tasks[0];
  return makeResponse(true, { task: presentTask(picked) }, requestId);
}

const handlers = {
  submit,
  runTask,
  query,
  latest,
};

exports.main = async (event, context) => {
  const action = event && event.action;
  const handler = action && handlers[action];
  const requestId = context.requestId || Date.now().toString();
  if (!handler) {
    return makeResponse(false, { code: "INVALID_ACTION", message: "不支持的操作: " + (action || "未指定") }, requestId);
  }
  return handler(event, context);
};
