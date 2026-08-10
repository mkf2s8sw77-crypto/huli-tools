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
  // 推理模型（MiniMax-M3）可选：reasoningSplit 把思维链拆到 reasoning_details，
  // content 只留正文；thinkingType="disabled" 直接关闭思考（仅 M3 支持，M2.x 忽略）。
  // 短文本任务（如游戏发言）建议关闭思考以压低时延。
  if (config.reasoningSplit !== undefined) body.reasoning_split = Boolean(config.reasoningSplit);
  if (config.thinkingType) body.thinking = { type: String(config.thinkingType) };

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

// MiniMax 图像生成（/image_generation），同一 minimax driver 下的 image_gen 能力。
async function generateImage({ config, prompt, overrides }) {
  const secretEnv = config.secretEnv || "MINIMAX_API_KEY";
  const apiKey = String(process.env[secretEnv] || "").trim();
  if (!apiKey) throw modelError("MODEL_CONFIG_MISSING", `模型密钥未配置（${secretEnv}）`);
  const baseUrl = String(config.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const parsed = new URL(baseUrl);
  if (parsed.protocol !== "https:") throw modelError("MODEL_CONFIG_INVALID", "MiniMax BaseURL 必须使用 HTTPS");
  const model = String(config.model || "").trim();
  if (!model) throw modelError("MODEL_CONFIG_MISSING", "provider 未配置 model");
  if (!prompt) throw modelError("MODEL_CONFIG_INVALID", "图像生成缺少 prompt");

  const timeoutMs = Number(config.timeoutMs || DEFAULT_TIMEOUT_MS);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const body = { model, prompt, response_format: "url" };
  const aspectRatio = (overrides && overrides.aspectRatio) || config.aspectRatio;
  if (aspectRatio) body.aspect_ratio = String(aspectRatio);
  const count = Number((overrides && overrides.n) || config.n || 1);
  if (count > 1) body.n = count;

  let response;
  try {
    response = await fetch(`${baseUrl}/image_generation`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    const message = err && err.name === "AbortError" ? "MiniMax 图像请求超时" : "MiniMax 图像网络请求失败";
    throw modelError("MODEL_TRANSIENT_ERROR", message, { transient: true, cause: err });
  } finally {
    clearTimeout(timeout);
  }

  let payload;
  try {
    payload = await response.json();
  } catch (err) {
    throw classifyHttpError(response.status, "MiniMax 图像返回了无效响应");
  }
  if (!response.ok) {
    const message = payload && (payload.error && (payload.error.message || payload.error.msg) || payload.base_resp && payload.base_resp.status_msg);
    throw classifyHttpError(response.status, message);
  }
  if (payload.base_resp && payload.base_resp.status_code && payload.base_resp.status_code !== 0) {
    throw modelError("MODEL_REQUEST_FAILED", payload.base_resp.status_msg || "MiniMax 图像生成失败", { transient: false });
  }
  const urls = payload && payload.data && Array.isArray(payload.data.image_urls) ? payload.data.image_urls.filter(Boolean) : [];
  if (!urls.length) throw modelError("MODEL_INVALID_RESPONSE", "MiniMax 未返回图片 URL", { transient: false });
  return { urls, model: payload.model || model, meta: payload.metadata || {} };
}

// MiniMax 语音合成（/t2a_v2）。GroupId 为可选：新版接口仅 Bearer 鉴权即可，
// 若配置了 config.groupId 或 MINIMAX_GROUP_ID 则一并带上（兼容旧账户体系）。
async function generateSpeech({ config, text, overrides }) {
  const secretEnv = config.secretEnv || "MINIMAX_API_KEY";
  const apiKey = String(process.env[secretEnv] || "").trim();
  if (!apiKey) throw modelError("MODEL_CONFIG_MISSING", `模型密钥未配置（${secretEnv}）`);
  const groupId = String(config.groupId || process.env.MINIMAX_GROUP_ID || "").trim();
  const baseUrl = String(config.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const parsed = new URL(baseUrl);
  if (parsed.protocol !== "https:") throw modelError("MODEL_CONFIG_INVALID", "MiniMax BaseURL 必须使用 HTTPS");
  const model = String(config.model || "").trim();
  if (!model) throw modelError("MODEL_CONFIG_MISSING", "provider 未配置 model");
  if (!text) throw modelError("MODEL_CONFIG_INVALID", "语音合成缺少 text");

  const timeoutMs = Number(config.timeoutMs || DEFAULT_TIMEOUT_MS);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const body = {
    model,
    text,
    voice_setting: {
      voice_id: String((overrides && overrides.voiceId) || config.voiceId || "male-qn-qingse"),
    },
    audio_setting: { format: "mp3" },
  };

  const url = `${baseUrl}/t2a_v2${groupId ? `?GroupId=${encodeURIComponent(groupId)}` : ""}`;
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    const message = err && err.name === "AbortError" ? "MiniMax 语音请求超时" : "MiniMax 语音网络请求失败";
    throw modelError("MODEL_TRANSIENT_ERROR", message, { transient: true, cause: err });
  } finally {
    clearTimeout(timeout);
  }

  let payload;
  try {
    payload = await response.json();
  } catch (err) {
    throw classifyHttpError(response.status, "MiniMax 语音返回了无效响应");
  }
  if (!response.ok) {
    const message = payload && (payload.error && (payload.error.message || payload.error.msg) || payload.base_resp && payload.base_resp.status_msg);
    throw classifyHttpError(response.status, message);
  }
  if (payload.base_resp && payload.base_resp.status_code && payload.base_resp.status_code !== 0) {
    throw modelError("MODEL_REQUEST_FAILED", payload.base_resp.status_msg || "MiniMax 语音合成失败", { transient: false });
  }
  const audioHex = payload && payload.data && payload.data.audio;
  if (!audioHex) throw modelError("MODEL_INVALID_RESPONSE", "MiniMax 未返回音频数据", { transient: false });
  return {
    audioBase64: Buffer.from(audioHex, "hex").toString("base64"),
    format: "mp3",
    model,
  };
}

module.exports = { chatComplete, generateImage, generateSpeech };
