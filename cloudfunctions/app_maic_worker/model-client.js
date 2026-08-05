const cloud = require("wx-server-sdk");
const { SYSTEM_PROMPT, buildCorrectionPrompt, buildUserPrompt } = require("./core/prompt");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// MAIC 不再直连 MiniMax：统一经 coreModel 网关（binding: maic__course_generate），
// provider/模型/密钥由 model_providers + coreModel 环境变量管理。
const CORE_MODEL_FUNCTION = "coreModel";
const APP_KEY = "maic";
const CAPABILITY = "course_generate";
// wx-server-sdk / @cloudbase/node-sdk 的 callFunction 默认 HTTP 超时只有 15s，必须显式放大。
const CALL_TIMEOUT_MS = 60000;
// 函数间同步调用经 API 网关约 60s 即被切断，MiniMax M3 整课生成需 90s+，
// 因此走 coreModel 异步 Job：createTextJob 提交 + getTextJob 轮询取结果。
const JOB_POLL_INTERVAL_MS = 5000;
const JOB_WAIT_TIMEOUT_MS = 240000; // worker 函数自身超时 300s，预留提交与导入时间

function getInternalToken() {
  return process.env.INTERNAL_API_SECRET || "";
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function callModel(action, data) {
  const res = await cloud.callFunction({
    name: CORE_MODEL_FUNCTION,
    data: { action, _internalToken: getInternalToken(), ...data },
    timeout: CALL_TIMEOUT_MS,
  });
  return res.result || {};
}

function throwModelError(error) {
  throw Object.assign(new Error(error.message || "模型调用失败"), {
    code: error.code || "MODEL_REQUEST_FAILED",
    transient: error.transient === true,
    attempts: error.attempts,
  });
}

async function requestModel(messages) {
  const token = getInternalToken();
  if (!token) {
    throw Object.assign(new Error("内部调用凭据未配置"), { code: "MODEL_CONFIG_MISSING" });
  }
  let created;
  try {
    created = await callModel("createTextJob", { appKey: APP_KEY, capability: CAPABILITY, messages });
  } catch (err) {
    throw Object.assign(new Error("coreModel 调用失败: " + err.message), { code: "MODEL_TRANSIENT_ERROR", transient: true, cause: err });
  }
  if (!created.ok) {
    throwModelError(created.error || {});
  }
  const jobId = created.data && created.data.jobId;
  if (!jobId) {
    throw Object.assign(new Error("coreModel 未返回任务编号"), { code: "MODEL_REQUEST_FAILED" });
  }

  const deadline = Date.now() + JOB_WAIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(JOB_POLL_INTERVAL_MS);
    let jobRes;
    try {
      jobRes = await callModel("getTextJob", { jobId });
    } catch (err) {
      continue; // 轮询传输失败不致命，等待下一轮
    }
    if (!jobRes.ok) {
      throwModelError(jobRes.error || {});
    }
    const job = jobRes.data || {};
    if (job.status === "succeeded") {
      const data = job.data || {};
      const usage = data.usage || {};
      return {
        text: data.text || "",
        usage: {
          promptTokens: Number(usage.promptTokens || 0),
          completionTokens: Number(usage.completionTokens || 0),
          totalTokens: Number(usage.totalTokens || 0),
        },
        model: data.model || "",
      };
    }
    if (job.status === "failed") {
      throwModelError(job.error || {});
    }
  }
  throw Object.assign(new Error("等待模型任务结果超时"), { code: "MODEL_TRANSIENT_ERROR", transient: true });
}

async function generateCourseText(input, correction) {
  const userContent = correction
    ? buildCorrectionPrompt(input, correction.previousText, correction.errorMessage)
    : buildUserPrompt(input);
  return requestModel([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userContent },
  ]);
}

async function smokeModel() {
  return requestModel([
    { role: "system", content: "只返回 JSON：{\"ok\":true}。" },
    { role: "user", content: "连通性测试" },
  ]);
}

module.exports = { generateCourseText, smokeModel };
