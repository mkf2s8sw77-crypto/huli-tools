"use strict";

// CloudBase AI 文本驱动（@cloudbase/node-sdk ai.createModel）。
// 平移自 app_nursing_undercover/ai.js，模型 ID 来自 provider 文档 config.model。

const MODEL_GROUP = "cloudbase";
const DEFAULT_AI_ENV_ID = "cloudbase-3gphz7fk0fe1b760";

let cloudbaseApp = null;
let aiModel = null;

function modelError(code, message, extra) {
  return Object.assign(new Error(message), { code, ...(extra || {}) });
}

function getAiModel() {
  if (aiModel) return aiModel;
  const cloudbase = require("@cloudbase/node-sdk");
  const envId = process.env.CLOUDBASE_AI_ENV_ID
    || process.env.TCB_ENV
    || process.env.SCF_NAMESPACE
    || DEFAULT_AI_ENV_ID;
  cloudbaseApp = cloudbaseApp || cloudbase.init({ env: envId });
  aiModel = cloudbaseApp.ai().createModel(MODEL_GROUP);
  return aiModel;
}

function classifySdkError(err) {
  const message = (err && err.message) || "CloudBase AI 调用失败";
  if (/rate|429|限流/i.test(message)) {
    return modelError("MODEL_RATE_LIMITED", message, { transient: true, cause: err });
  }
  if (/timeout|timed?\s*out|econn|network|socket|503|502|500/i.test(message)) {
    return modelError("MODEL_TRANSIENT_ERROR", message, { transient: true, cause: err });
  }
  return modelError("MODEL_REQUEST_FAILED", message, { transient: false, cause: err });
}

async function chatComplete({ config, messages }) {
  const model = String(config.model || "").trim();
  if (!model) throw modelError("MODEL_CONFIG_MISSING", "provider 未配置 model");

  const request = { model, messages };
  if (config.temperature !== undefined) request.temperature = Number(config.temperature);
  if (config.maxTokens !== undefined) request.max_tokens = Number(config.maxTokens);

  let result;
  try {
    result = await getAiModel().generateText(request);
  } catch (err) {
    throw classifySdkError(err);
  }
  const text = result && result.text ? result.text : "";
  if (!text) throw modelError("MODEL_INVALID_RESPONSE", "CloudBase AI 返回为空", { transient: false });
  const usage = (result && result.usage) || {};
  return {
    text,
    usage: {
      promptTokens: Number(usage.prompt_tokens || usage.promptTokens || 0),
      completionTokens: Number(usage.completion_tokens || usage.completionTokens || 0),
      totalTokens: Number(usage.total_tokens || usage.totalTokens || 0),
    },
    model,
  };
}

module.exports = { chatComplete };
