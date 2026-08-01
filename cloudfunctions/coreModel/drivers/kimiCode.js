"use strict";

// Kimi Code（Anthropic 兼容 /v1/messages）文本驱动。
// 用于 Kimi Code token plan 模型（如 k3-256k），支持多模态输入、文字输出；
// 密钥只从环境变量读取，env 名由 provider.config.secretEnv 指定（默认 KIMI_API_KEY）。

const DEFAULT_BASE_URL = "https://api.kimi.com/coding";
const DEFAULT_TIMEOUT_MS = 240000;
const DEFAULT_MAX_TOKENS = 8000;
const ANTHROPIC_VERSION = "2023-06-01";

function modelError(code, message, extra) {
  return Object.assign(new Error(message), { code, ...(extra || {}) });
}

function classifyHttpError(status, message) {
  if (status === 408 || status === 409 || status === 425 || status === 429 || status >= 500) {
    return modelError(status === 429 ? "MODEL_RATE_LIMITED" : "MODEL_TRANSIENT_ERROR", message || `Kimi 暂时不可用 (${status})`, { transient: true, status });
  }
  return modelError("MODEL_REQUEST_FAILED", message || `Kimi 请求失败 (${status})`, { transient: false, status });
}

// 将 OpenAI 风格的 messages 拆分为 Anthropic 顶层 system + 用户/助手消息；
// 用户消息内容支持字符串或多模态 part 数组（图片 part 转为 Anthropic image block）。
function toAnthropicPayload(messages, maxTokens, model) {
  const systemParts = [];
  const out = [];
  (messages || []).forEach((m) => {
    if (!m || !m.role) return;
    if (m.role === "system") {
      if (typeof m.content === "string" && m.content.trim()) systemParts.push(m.content);
      return;
    }
    if (m.role !== "user" && m.role !== "assistant") return;
    if (typeof m.content === "string") {
      out.push({ role: m.role, content: m.content });
      return;
    }
    if (Array.isArray(m.content)) {
      const blocks = [];
      m.content.forEach((part) => {
        if (!part) return;
        if (part.type === "text" && typeof part.text === "string") {
          blocks.push({ type: "text", text: part.text });
        } else if (part.type === "image_url" && part.image_url && part.image_url.url) {
          const url = part.image_url.url;
          const match = /^data:([^;]+);base64,(.+)$/.exec(url);
          if (match) {
            blocks.push({ type: "image", source: { type: "base64", media_type: match[1], data: match[2] } });
          } else {
            blocks.push({ type: "image", source: { type: "url", url } });
          }
        }
      });
      if (blocks.length) out.push({ role: m.role, content: blocks });
    }
  });
  const body = { model, messages: out, max_tokens: maxTokens };
  if (systemParts.length) body.system = systemParts.join("\n\n");
  return body;
}

async function chatComplete({ config, messages }) {
  const secretEnv = config.secretEnv || "KIMI_API_KEY";
  const apiKey = String(process.env[secretEnv] || "").trim();
  if (!apiKey) throw modelError("MODEL_CONFIG_MISSING", `模型密钥未配置（${secretEnv}）`);
  const baseUrl = String(config.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const parsed = new URL(baseUrl);
  if (parsed.protocol !== "https:") throw modelError("MODEL_CONFIG_INVALID", "Kimi BaseURL 必须使用 HTTPS");
  const model = String(config.model || "").trim();
  if (!model) throw modelError("MODEL_CONFIG_MISSING", "provider 未配置 model");

  const maxTokens = Number(config.maxTokens || DEFAULT_MAX_TOKENS);
  const timeoutMs = Number(config.timeoutMs || DEFAULT_TIMEOUT_MS);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const body = toAnthropicPayload(messages, maxTokens, model);

  let response;
  try {
    response = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    const message = err && err.name === "AbortError" ? "Kimi 请求超时" : "Kimi 网络请求失败";
    throw modelError("MODEL_TRANSIENT_ERROR", message, { transient: true, cause: err });
  } finally {
    clearTimeout(timeout);
  }

  let payload;
  try {
    payload = await response.json();
  } catch (err) {
    throw classifyHttpError(response.status, "Kimi 返回了无效响应");
  }
  if (!response.ok) {
    const message = payload && payload.error && (payload.error.message || payload.error.msg);
    throw classifyHttpError(response.status, message);
  }
  const blocks = payload && Array.isArray(payload.content) ? payload.content : [];
  const text = blocks
    .filter((b) => b && b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("");
  if (!text) throw modelError("MODEL_INVALID_RESPONSE", "Kimi 未返回内容", { transient: false });
  const usage = payload.usage || {};
  return {
    text,
    usage: {
      promptTokens: Number(usage.input_tokens || 0),
      completionTokens: Number(usage.output_tokens || 0),
      totalTokens: Number(usage.input_tokens || 0) + Number(usage.output_tokens || 0),
    },
    model: payload.model || model,
  };
}

module.exports = { chatComplete };
