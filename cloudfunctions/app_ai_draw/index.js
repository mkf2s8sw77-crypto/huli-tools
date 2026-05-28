const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

const APP_KEY = "ai_draw";
const TASK_COLLECTION = "app_ai_draw_tasks";
const GPT_IMAGE_API_HOST = "dev.huli.sh.cn";
const GPT_IMAGE_API_BASE = "/gpt-image-2";
const MAX_PROMPT_LENGTH = 500;

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizePrompt(prompt) {
  return typeof prompt === "string" ? prompt.trim() : "";
}

function getImageUrl(result) {
  return result && result.images && result.images[0] ? result.images[0].public_url : null;
}

function httpsRequest(hostname, path, method, postData) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname,
      path,
      method,
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 10000,
    };
    const req = require("https").request(options, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });
    req.on("error", (err) => reject(err));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("请求超时"));
    });
    if (postData) {
      req.write(JSON.stringify(postData));
    }
    req.end();
  });
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
    return { ok: false, response: makeResponse(false, { code: "APP_MISMATCH", message: "使用记录不属于 AI 绘图应用" }, requestId) };
  }
  const statuses = allowedStatuses || ["frozen", "created"];
  if (!statuses.includes(usage.status)) {
    return { ok: false, response: makeResponse(false, { code: "INVALID_STATUS", message: "使用记录状态不可执行" }, requestId) };
  }

  return { ok: true, usage };
}

async function callFinishUsage(openid, usageId, resultRef, requestId) {
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

async function callFailUsage(openid, usageId, errorCode, errorMessage, requestId) {
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

async function createGenerationTask(prompt) {
  return httpsRequest(
    GPT_IMAGE_API_HOST,
    GPT_IMAGE_API_BASE + "/api/generations",
    "POST",
    { prompt }
  );
}

async function getTask(usageId) {
  try {
    const res = await db.collection(TASK_COLLECTION).doc(usageId).get();
    return res.data || null;
  } catch (err) {
    return null;
  }
}

async function saveTask(data) {
  const now = new Date();
  await db.collection(TASK_COLLECTION).doc(data.usageId).set({
    data: {
      userId: data.userId,
      usageId: data.usageId,
      jobId: data.jobId,
      prompt: data.prompt,
      status: data.status,
      imageUrl: data.imageUrl || null,
      errorCode: data.errorCode || null,
      errorMessage: data.errorMessage || null,
      createdAt: data.createdAt || now,
      updatedAt: now,
      finishedAt: data.finishedAt || null,
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
    console.error("更新 AI 绘图任务失败:", err.message);
  }
}

async function validateTask(usageId, jobId, openid, requestId) {
  const task = await getTask(usageId);
  if (!task) {
    return { ok: false, response: makeResponse(false, { code: "TASK_NOT_FOUND", message: "AI 绘图任务不存在或未创建成功" }, requestId) };
  }
  if (task.userId !== openid) {
    return { ok: false, response: makeResponse(false, { code: "FORBIDDEN", message: "无权操作该绘图任务" }, requestId) };
  }
  if (task.jobId !== jobId) {
    return { ok: false, response: makeResponse(false, { code: "JOB_MISMATCH", message: "任务编号与使用记录不匹配" }, requestId) };
  }
  return { ok: true, task };
}

async function queryGenerationStatus(jobId) {
  return httpsRequest(
    GPT_IMAGE_API_HOST,
    GPT_IMAGE_API_BASE + "/api/generations/" + jobId,
    "GET"
  );
}

async function pollGenerationStatus(jobId, maxAttempts, intervalMs) {
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(intervalMs);
    const result = await queryGenerationStatus(jobId);
    if (result.status === "succeeded" || result.status === "failed") {
      return result;
    }
  }
  return { status: "processing", jobId };
}

async function finishWithImage(openid, usageId, jobId, imageUrl, requestId) {
  const finishRes = await callFinishUsage(openid, usageId, imageUrl, requestId);
  if (!finishRes.ok) {
    return makeResponse(false, finishRes.error, requestId);
  }
  await updateTask(usageId, {
    status: "succeeded",
    imageUrl,
    errorCode: null,
    errorMessage: null,
    finishedAt: new Date(),
  });
  return makeResponse(true, { imageUrl, status: "succeeded", jobId }, requestId);
}

async function failGeneration(openid, usageId, jobId, errorCode, errorMessage, requestId) {
  const failRes = await callFailUsage(openid, usageId, errorCode, errorMessage, requestId);
  await updateTask(usageId, {
    status: "failed",
    errorCode,
    errorMessage,
    finishedAt: new Date(),
  });
  if (!failRes.ok) {
    return makeResponse(false, failRes.error, requestId);
  }
  return makeResponse(false, { code: errorCode, message: errorMessage }, requestId);
}

async function generate(event, context) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const requestId = context.requestId || Date.now().toString();
  const { usageId, prompt } = event;
  const cleanPrompt = normalizePrompt(prompt);

  if (!openid) {
    return makeResponse(false, { code: "UNAUTHORIZED", message: "无法获取用户身份" }, requestId);
  }
  if (!usageId) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "缺少 usageId" }, requestId);
  }
  if (!cleanPrompt) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "请输入绘图描述" }, requestId);
  }
  if (cleanPrompt.length > MAX_PROMPT_LENGTH) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "绘图描述不能超过 500 字" }, requestId);
  }

  const usageCheck = await validateUsage(usageId, openid, requestId);
  if (!usageCheck.ok) {
    return usageCheck.response;
  }

  const existingTask = await getTask(usageId);
  if (existingTask) {
    if (existingTask.userId !== openid) {
      return makeResponse(false, { code: "FORBIDDEN", message: "无权操作该绘图任务" }, requestId);
    }
    if (existingTask.status === "succeeded" && existingTask.imageUrl) {
      return makeResponse(true, { imageUrl: existingTask.imageUrl, status: "succeeded", jobId: existingTask.jobId }, requestId);
    }
    if (existingTask.status === "processing") {
      return makeResponse(true, { status: "processing", jobId: existingTask.jobId }, requestId);
    }
    if (existingTask.status === "failed" || existingTask.status === "cancelled") {
      return makeResponse(false, { code: "TASK_ALREADY_FAILED", message: existingTask.errorMessage || "任务已失败" }, requestId);
    }
  }

  let createResult;
  try {
    createResult = await createGenerationTask(cleanPrompt);
  } catch (err) {
    await callFailUsage(openid, usageId, "API_ERROR", "创建图片生成任务失败: " + err.message, requestId);
    return makeResponse(false, { code: "API_ERROR", message: "创建图片生成任务失败: " + err.message }, requestId);
  }

  if (!createResult || !createResult.ok) {
    const errMsg = createResult && createResult.message ? createResult.message : "创建任务失败";
    await callFailUsage(openid, usageId, "GENERATION_FAILED", errMsg, requestId);
    return makeResponse(false, { code: "GENERATION_FAILED", message: errMsg }, requestId);
  }

  const jobId = createResult.job_id;
  if (!jobId) {
    await callFailUsage(openid, usageId, "API_ERROR", "任务创建未返回 job_id", requestId);
    return makeResponse(false, { code: "API_ERROR", message: "任务创建未返回 job_id" }, requestId);
  }

  try {
    await saveTask({
      userId: openid,
      usageId,
      jobId,
      prompt: cleanPrompt,
      status: "processing",
    });
  } catch (err) {
    await callFailUsage(openid, usageId, "TASK_RECORD_FAILED", "保存绘图任务失败: " + err.message, requestId);
    return makeResponse(false, { code: "TASK_RECORD_FAILED", message: "保存绘图任务失败，请确认 app_ai_draw_tasks 集合已创建" }, requestId);
  }

  let pollResult;
  try {
    pollResult = await pollGenerationStatus(jobId, 15, 2000);
  } catch (err) {
    await updateTask(usageId, { status: "processing", errorCode: "POLL_ERROR", errorMessage: err.message });
    return makeResponse(true, { status: "processing", jobId }, requestId);
  }

  if (pollResult.status === "succeeded") {
    const imageUrl = getImageUrl(pollResult);
    if (!imageUrl) {
      return failGeneration(openid, usageId, jobId, "API_ERROR", "任务成功但未返回图片 URL", requestId);
    }
    return finishWithImage(openid, usageId, jobId, imageUrl, requestId);
  }

  if (pollResult.status === "failed") {
    const errMsg = pollResult.message || "图片生成失败";
    return failGeneration(openid, usageId, jobId, "GENERATION_FAILED", errMsg, requestId);
  }

  await updateTask(usageId, { status: "processing" });
  return makeResponse(true, { status: "processing", jobId }, requestId);
}

async function query(event, context) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const requestId = context.requestId || Date.now().toString();
  const { jobId, usageId } = event;

  if (!openid) {
    return makeResponse(false, { code: "UNAUTHORIZED", message: "无法获取用户身份" }, requestId);
  }
  if (!jobId) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "缺少 jobId" }, requestId);
  }
  if (!usageId) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "缺少 usageId" }, requestId);
  }

  const usageCheck = await validateUsage(usageId, openid, requestId, ["created", "frozen", "succeeded"]);
  if (!usageCheck.ok) {
    return usageCheck.response;
  }

  const taskCheck = await validateTask(usageId, jobId, openid, requestId);
  if (!taskCheck.ok) {
    return taskCheck.response;
  }
  if (taskCheck.task.status === "succeeded" && taskCheck.task.imageUrl) {
    return makeResponse(true, { imageUrl: taskCheck.task.imageUrl, status: "succeeded", jobId }, requestId);
  }
  if (taskCheck.task.status === "failed" || taskCheck.task.status === "cancelled") {
    return makeResponse(false, { code: "TASK_ALREADY_FAILED", message: taskCheck.task.errorMessage || "任务已失败" }, requestId);
  }

  let queryResult;
  try {
    queryResult = await queryGenerationStatus(jobId);
  } catch (err) {
    await updateTask(usageId, { status: "processing", errorCode: "POLL_ERROR", errorMessage: err.message });
    return makeResponse(true, { status: "processing", jobId, lastError: "查询任务状态失败: " + err.message }, requestId);
  }

  if (queryResult.status === "succeeded") {
    const imageUrl = getImageUrl(queryResult);
    if (!imageUrl) {
      return failGeneration(openid, usageId, jobId, "API_ERROR", "任务成功但未返回图片 URL", requestId);
    }
    return finishWithImage(openid, usageId, jobId, imageUrl, requestId);
  }

  if (queryResult.status === "failed") {
    const errMsg = queryResult.message || "图片生成失败";
    return failGeneration(openid, usageId, jobId, "GENERATION_FAILED", errMsg, requestId);
  }

  await updateTask(usageId, { status: "processing" });
  return makeResponse(true, { status: "processing", jobId }, requestId);
}

async function cancel(event, context) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const requestId = context.requestId || Date.now().toString();
  const { jobId, usageId, reason } = event;

  if (!openid) {
    return makeResponse(false, { code: "UNAUTHORIZED", message: "无法获取用户身份" }, requestId);
  }
  if (!usageId || !jobId) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "缺少 usageId 或 jobId" }, requestId);
  }

  const usageCheck = await validateUsage(usageId, openid, requestId, ["created", "frozen"]);
  if (!usageCheck.ok) {
    return usageCheck.response;
  }
  const taskCheck = await validateTask(usageId, jobId, openid, requestId);
  if (!taskCheck.ok) {
    return taskCheck.response;
  }

  const message = reason || "用户取消或等待超时";
  const failRes = await callFailUsage(openid, usageId, "GENERATION_CANCELLED", message, requestId);
  await updateTask(usageId, {
    status: "cancelled",
    errorCode: "GENERATION_CANCELLED",
    errorMessage: message,
    finishedAt: new Date(),
  });
  if (!failRes.ok) {
    return makeResponse(false, failRes.error, requestId);
  }
  return makeResponse(true, { status: "cancelled", jobId }, requestId);
}

exports.main = async (event, context) => {
  const { action } = event;
  const requestId = context.requestId || Date.now().toString();

  if (action === "generate") {
    return generate(event, context);
  }
  if (action === "query") {
    return query(event, context);
  }
  if (action === "cancel") {
    return cancel(event, context);
  }

  return makeResponse(false, { code: "UNKNOWN_ACTION", message: "未知 action: " + action }, requestId);
};
