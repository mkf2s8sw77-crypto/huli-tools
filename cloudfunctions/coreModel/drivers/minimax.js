"use strict";

// MiniMax（OpenAI 兼容 /chat/completions）文本驱动。
// 平移自 app_maic_worker/model-client.js，配置来源从环境变量改为 provider 文档；
// 密钥仍只从环境变量读取，env 名由 provider.config.secretEnv 指定。

const DEFAULT_BASE_URL = "https://api.minimaxi.com/v1";
const DEFAULT_TIMEOUT_MS = 240000;

function modelError(code, message, extra) {
  return Object.assign(new Error(message), { code, ...(extra || {}) });
}

function classifyHttpError(status, message) {
  if (status === 408 || status === 409 || status === 425 || status === 429 || status >= 500) {
    return modelError(status === 429 ? "MODEL_RATE_LIMITED" : "MODEL_TRANSIENT_ERROR", message || `MiniMax 暂时不可用 (${status})`, { transient: true, status });
  }
  return modelError("MODEL_REQUEST_FAILED", message || `MiniMax 请求失败 (${status})`, { transient: false, status });
}

async function chatComplete({ config, messages }) {
  const secretEnv = config.secretEnv || "MINIMAX_API_KEY";
  const apiKey = String(process.env[secretEnv] || "").trim();
  if (!apiKey) throw modelError("MODEL_CONFIG_MISSING", `模型密钥未配置（${secretEnv}）`);
  const baseUrl = String(config.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const parsed = new URL(baseUrl);
  if (parsed.protocol !== "https:") throw modelError("MODEL_CONFIG_INVALID", "MiniMax BaseURL 必须使用 HTTPS");
  const model = String(config.model || "").trim();
  if (!model) throw modelError("MODEL_CONFIG_MISSING", "provider 未配置 model");

  const timeoutMs = Number(config.timeoutMs || DEFAULT_TIMEOUT_MS);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const body = { model, messages };
  if (config.temperature !== undefined) body.temperature = Number(config.temperature);
  if (config.maxTokens !== undefined) body.max_tokens = Number(config.maxTokens);

  let response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    const message = err && err.name === "AbortError" ? "MiniMax 请求超时" : "MiniMax 网络请求失败";
    throw modelError("MODEL_TRANSIENT_ERROR", message, { transient: true, cause: err });
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
  if (!content) throw modelError("MODEL_INVALID_RESPONSE", "MiniMax 未返回内容", { transient: false });
  const usage = payload.usage || {};
  return {
    text: content,
    usage: {
      promptTokens: Number(usage.prompt_tokens || 0),
      completionTokens: Number(usage.completion_tokens || 0),
      totalTokens: Number(usage.total_tokens || 0),
    },
    model: payload.model || model,
  };
}

module.exports = { chatComplete };
