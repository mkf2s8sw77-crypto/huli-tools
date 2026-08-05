const cloud = require("wx-server-sdk");
const { SYSTEM_PROMPT, buildCorrectionPrompt, buildUserPrompt } = require("./core/prompt");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// MAIC 不再直连 MiniMax：统一经 coreModel 网关（binding: maic__course_generate），
// provider/模型/密钥由 model_providers + coreModel 环境变量管理。
const CORE_MODEL_FUNCTION = "coreModel";
const APP_KEY = "maic";
const CAPABILITY = "course_generate";
// wx-server-sdk / @cloudbase/node-sdk 的 callFunction 默认 HTTP 超时只有 15s，
// 课程整课生成远超该值，必须显式放大（worker 函数自身超时 300s，留 60s 余量）。
const CALL_TIMEOUT_MS = 240000;

function getInternalToken() {
  return process.env.INTERNAL_API_SECRET || "";
}

async function requestModel(messages) {
  const token = getInternalToken();
  if (!token) {
    throw Object.assign(new Error("内部调用凭据未配置"), { code: "MODEL_CONFIG_MISSING" });
  }
  let res;
  try {
    res = await cloud.callFunction({
      name: CORE_MODEL_FUNCTION,
      data: { action: "generateText", _internalToken: token, appKey: APP_KEY, capability: CAPABILITY, messages },
      timeout: CALL_TIMEOUT_MS,
    });
  } catch (err) {
    throw Object.assign(new Error("coreModel 调用失败: " + err.message), { code: "MODEL_TRANSIENT_ERROR", transient: true, cause: err });
  }
  const result = res.result || {};
  if (!result.ok) {
    const error = result.error || {};
    throw Object.assign(new Error(error.message || "模型调用失败"), {
      code: error.code || "MODEL_REQUEST_FAILED",
      transient: error.transient === true,
      attempts: error.attempts,
    });
  }
  const data = result.data || {};
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
