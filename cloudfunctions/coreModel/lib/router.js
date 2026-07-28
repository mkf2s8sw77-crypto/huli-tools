"use strict";

// 纯函数路由逻辑：绑定解析、fallback 链、transient 判定、参数合并。
// 不依赖 wx-server-sdk，供 tests/core-model-router.test.js 直接引用。

const TRANSIENT_CODES = ["MODEL_RATE_LIMITED", "MODEL_TRANSIENT_ERROR"];

// 允许被 binding.paramOverrides / 调用方 overrides 覆盖的键，其余 provider 配置不可被覆盖
const OVERRIDABLE_KEYS = ["model", "temperature", "maxTokens", "timeoutMs"];

function isTransientError(err) {
  if (!err) return false;
  if (err.transient === true) return true;
  return TRANSIENT_CODES.includes(err.code);
}

// 绑定 → provider 调用链：主 provider 在前，fallback 依次跟上，去重且不含空值
function buildProviderChain(binding) {
  const chain = [];
  if (binding && typeof binding.providerKey === "string" && binding.providerKey.trim()) {
    chain.push(binding.providerKey.trim());
  }
  const fallbacks = binding && Array.isArray(binding.fallbackProviderKeys) ? binding.fallbackProviderKeys : [];
  for (const key of fallbacks) {
    if (typeof key !== "string") continue;
    const trimmed = key.trim();
    if (trimmed && !chain.includes(trimmed)) chain.push(trimmed);
  }
  return chain;
}

// 参数合并优先级：调用方 overrides > binding.paramOverrides > provider.config
// 仅白名单键可被覆盖，secretEnv/baseUrl 等连接配置只能来自 provider 文档
function mergeParams(providerConfig, bindingOverrides, callOverrides) {
  const merged = { ...(providerConfig || {}) };
  for (const layer of [bindingOverrides, callOverrides]) {
    if (!layer || typeof layer !== "object") continue;
    for (const key of OVERRIDABLE_KEYS) {
      if (layer[key] !== undefined) merged[key] = layer[key];
    }
  }
  if (merged.temperature !== undefined) merged.temperature = Number(merged.temperature);
  if (merged.maxTokens !== undefined) merged.maxTokens = Number(merged.maxTokens);
  if (merged.timeoutMs !== undefined) merged.timeoutMs = Number(merged.timeoutMs);
  return merged;
}

function bindingId(appKey, capability) {
  return `${appKey}__${capability}`;
}

module.exports = {
  TRANSIENT_CODES,
  OVERRIDABLE_KEYS,
  isTransientError,
  buildProviderChain,
  mergeParams,
  bindingId,
};
