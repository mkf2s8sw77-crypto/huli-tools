"use strict";

// provider / binding 注册表读取，带 60s 内存缓存。
// 两个集合都是管理端低频写、运行时高频读的小集合，全量拉取缓存即可。

const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

const PROVIDERS = "model_providers";
const BINDINGS = "app_model_bindings";
const CACHE_TTL_MS = 60000;

let cache = { loadedAt: 0, providers: new Map(), bindings: new Map() };

async function loadAll(force) {
  if (!force && cache.loadedAt && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache;
  const [providerRes, bindingRes] = await Promise.all([
    db.collection(PROVIDERS).limit(100).get(),
    db.collection(BINDINGS).limit(100).get(),
  ]);
  const providers = new Map();
  for (const item of providerRes.data || []) {
    if (item && item.providerKey) providers.set(item.providerKey, item);
  }
  const bindings = new Map();
  for (const item of bindingRes.data || []) {
    if (item && item._id) bindings.set(item._id, item);
  }
  cache = { loadedAt: Date.now(), providers, bindings };
  return cache;
}

function invalidate() {
  cache = { loadedAt: 0, providers: new Map(), bindings: new Map() };
}

async function getProvider(providerKey) {
  const current = await loadAll(false);
  return current.providers.get(providerKey) || null;
}

async function getBinding(appKey, capability) {
  const current = await loadAll(false);
  return current.bindings.get(`${appKey}__${capability}`) || null;
}

module.exports = { PROVIDERS, BINDINGS, getProvider, getBinding, invalidate, loadAll };
