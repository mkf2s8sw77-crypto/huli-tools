const { SYSTEM_PROMPT, buildCorrectionPrompt, buildUserPrompt } = require("./core/prompt");

function getConfig() {
  const mode = String(process.env.MAIC_AI_MODE || "direct_minimax").trim();
  if (mode !== "direct_minimax") {
    throw Object.assign(new Error("当前环境仅支持 direct_minimax 模式"), { code: "MODEL_CONFIG_INVALID" });
  }
  const apiKey = String(process.env.MINIMAX_API_KEY || "").trim();
  if (!apiKey) throw Object.assign(new Error("MiniMax API Key 未配置"), { code: "MODEL_CONFIG_MISSING" });
  const baseUrl = String(process.env.MINIMAX_BASE_URL || "https://api.minimaxi.com/v1").replace(/\/+$/, "");
  const parsed = new URL(baseUrl);
  if (parsed.protocol !== "https:") throw Object.assign(new Error("MiniMax BaseURL 必须使用 HTTPS"), { code: "MODEL_CONFIG_INVALID" });
  return { apiKey, baseUrl, model: String(process.env.MAIC_AI_MODEL || "MiniMax-M2.7").trim() };
}

function classifyHttpError(status, message) {
  if (status === 408 || status === 409 || status === 425 || status === 429 || status >= 500) {
    return Object.assign(new Error(message || `MiniMax 暂时不可用 (${status})`), { code: status === 429 ? "MODEL_RATE_LIMITED" : "MODEL_TRANSIENT_ERROR", transient: true, status });
  }
  return Object.assign(new Error(message || `MiniMax 请求失败 (${status})`), { code: "MODEL_REQUEST_FAILED", transient: false, status });
}

async function requestModel(messages) {
  const config = getConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 240000);
  let response;
  try {
    response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: config.model, messages, temperature: 0.35, max_tokens: 12000 }),
      signal: controller.signal,
    });
  } catch (err) {
    const message = err && err.name === "AbortError" ? "MiniMax 请求超时" : "MiniMax 网络请求失败";
    throw Object.assign(new Error(message), { code: "MODEL_TRANSIENT_ERROR", transient: true, cause: err });
  } finally {
    clearTimeout(timeout);
  }
  let payload;
  try {
    payload = await response.json();
  } catch (err) {
    throw classifyHttpError(response.status, "MiniMax 返回了无效响应");
  }
  if (!response.ok) {
    const message = payload && payload.error && (payload.error.message || payload.error.msg);
    throw classifyHttpError(response.status, message);
  }
  const content = payload && payload.choices && payload.choices[0] && payload.choices[0].message && payload.choices[0].message.content;
  if (!content) throw Object.assign(new Error("MiniMax 未返回课程内容"), { code: "MODEL_INVALID_RESPONSE", transient: false });
  const usage = payload.usage || {};
  return {
    text: content,
    usage: {
      promptTokens: Number(usage.prompt_tokens || 0),
      completionTokens: Number(usage.completion_tokens || 0),
      totalTokens: Number(usage.total_tokens || 0),
    },
    model: payload.model || config.model,
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

module.exports = { generateCourseText, getConfig, smokeModel };
