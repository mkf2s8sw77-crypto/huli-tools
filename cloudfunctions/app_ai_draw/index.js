const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

const GPT_IMAGE_API_HOST = "dev.huli.sh.cn";
const GPT_IMAGE_API_BASE = "/gpt-image-2";

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

async function validateUsage(usageId, openid, expectedAppKey, requestId) {
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
  if (expectedAppKey && usage.appKey !== expectedAppKey) {
    return { ok: false, response: makeResponse(false, { code: "FORBIDDEN", message: "使用记录不属于当前应用" }, requestId) };
  }
  if (usage.status !== "frozen" && usage.status !== "created") {
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
      return { ok: false, error: finishResult && finishResult.error ? finishResult.error : { code: "FINISH_FAILED", message: "结算失败" } };
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
      return { ok: false, error: failResult && failResult.error ? failResult.error : { code: "FAIL_USAGE_FAILED", message: "释放积分失败" } };
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

async function generate(event, context) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const requestId = context.requestId || Date.now().toString();
  const { usageId, prompt } = event;

  if (!openid) {
    return makeResponse(false, { code: "UNAUTHORIZED", message: "无法获取用户身份" }, requestId);
  }
  if (!usageId) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "缺少 usageId" }, requestId);
  }
  if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "请输入绘图描述" }, requestId);
  }

  const usageCheck = await validateUsage(usageId, openid, "ai_draw", requestId);
  if (!usageCheck.ok) {
    return usageCheck.response;
  }

  let createResult;
  try {
    createResult = await createGenerationTask(prompt.trim());
  } catch (err) {
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

  let pollResult;
  try {
    pollResult = await pollGenerationStatus(jobId, 15, 2000);
  } catch (err) {
    return makeResponse(true, { status: "processing", jobId }, requestId);
  }

  if (pollResult.status === "succeeded") {
    const imageUrl = pollResult.images && pollResult.images[0] ? pollResult.images[0].public_url : null;
    if (!imageUrl) {
      await callFailUsage(openid, usageId, "API_ERROR", "任务成功但未返回图片 URL", requestId);
      return makeResponse(false, { code: "API_ERROR", message: "任务成功但未返回图片 URL" }, requestId);
    }
    const finishRes = await callFinishUsage(openid, usageId, imageUrl, requestId);
    if (!finishRes.ok) {
      return makeResponse(false, finishRes.error, requestId);
    }
    return makeResponse(true, { imageUrl, status: "succeeded", jobId }, requestId);
  }

  if (pollResult.status === "failed") {
    const errMsg = pollResult.message || "图片生成失败";
    await callFailUsage(openid, usageId, "GENERATION_FAILED", errMsg, requestId);
    return makeResponse(false, { code: "GENERATION_FAILED", message: errMsg }, requestId);
  }

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

  // 如果传了 usageId，强制校验归属
  if (usageId) {
    const usageCheck = await validateUsage(usageId, openid, "ai_draw", requestId);
    if (!usageCheck.ok) {
      return usageCheck.response;
    }
  }

  let queryResult;
  try {
    queryResult = await queryGenerationStatus(jobId);
  } catch (err) {
    return makeResponse(false, { code: "API_ERROR", message: "查询任务状态失败: " + err.message }, requestId);
  }

  if (queryResult.status === "succeeded") {
    const imageUrl = queryResult.images && queryResult.images[0] ? queryResult.images[0].public_url : null;
    if (!imageUrl) {
      if (usageId) {
        await callFailUsage(openid, usageId, "API_ERROR", "任务成功但未返回图片 URL", requestId);
      }
      return makeResponse(false, { code: "API_ERROR", message: "任务成功但未返回图片 URL" }, requestId);
    }
    if (usageId) {
      const finishRes = await callFinishUsage(openid, usageId, imageUrl, requestId);
      if (!finishRes.ok) {
        return makeResponse(false, finishRes.error, requestId);
      }
    }
    return makeResponse(true, { imageUrl, status: "succeeded", jobId }, requestId);
  }

  if (queryResult.status === "failed") {
    const errMsg = queryResult.message || "图片生成失败";
    if (usageId) {
      await callFailUsage(openid, usageId, "GENERATION_FAILED", errMsg, requestId);
    }
    return makeResponse(false, { code: "GENERATION_FAILED", message: errMsg }, requestId);
  }

  return makeResponse(true, { status: "processing", jobId }, requestId);
}

async function fail(event, context) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const requestId = context.requestId || Date.now().toString();
  const { usageId, errorCode, errorMessage } = event;

  if (!openid) {
    return makeResponse(false, { code: "UNAUTHORIZED", message: "无法获取用户身份" }, requestId);
  }
  if (!usageId) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "缺少 usageId" }, requestId);
  }

  const usageCheck = await validateUsage(usageId, openid, "ai_draw", requestId);
  if (!usageCheck.ok) {
    return usageCheck.response;
  }

  const failRes = await callFailUsage(openid, usageId, errorCode || "USER_CANCEL", errorMessage || "用户取消或超时", requestId);
  if (!failRes.ok) {
    return makeResponse(false, failRes.error, requestId);
  }
  return makeResponse(true, { usageId, status: "failed" }, requestId);
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
  if (action === "fail") {
    return fail(event, context);
  }

  return makeResponse(false, { code: "UNKNOWN_ACTION", message: "未知 action: " + action }, requestId);
};
