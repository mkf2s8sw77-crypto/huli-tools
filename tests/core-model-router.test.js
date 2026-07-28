const assert = require("node:assert/strict");
const test = require("node:test");
const {
  TRANSIENT_CODES,
  isTransientError,
  buildProviderChain,
  mergeParams,
  bindingId,
} = require("../cloudfunctions/coreModel/lib/router");

test("bindingId 使用 appKey__capability 固定格式", () => {
  assert.equal(bindingId("maic", "course_generate"), "maic__course_generate");
});

test("buildProviderChain 主 provider 在前，fallback 依次跟上", () => {
  assert.deepEqual(
    buildProviderChain({ providerKey: "a", fallbackProviderKeys: ["b", "c"] }),
    ["a", "b", "c"]
  );
});

test("buildProviderChain 去重并忽略空值", () => {
  assert.deepEqual(
    buildProviderChain({ providerKey: " a ", fallbackProviderKeys: ["a", "", null, "b", "b"] }),
    ["a", "b"]
  );
});

test("buildProviderChain 无 fallback 时只有主 provider", () => {
  assert.deepEqual(buildProviderChain({ providerKey: "a" }), ["a"]);
  assert.deepEqual(buildProviderChain({}), []);
});

test("isTransientError 识别 transient 标记与限流/临时错误码", () => {
  assert.equal(isTransientError({ code: "MODEL_RATE_LIMITED" }), true);
  assert.equal(isTransientError({ code: "MODEL_TRANSIENT_ERROR" }), true);
  assert.equal(isTransientError({ code: "WHATEVER", transient: true }), true);
  assert.equal(isTransientError({ code: "MODEL_REQUEST_FAILED" }), false);
  assert.equal(isTransientError({ code: "MODEL_BINDING_MISSING" }), false);
  assert.equal(isTransientError(null), false);
  for (const code of TRANSIENT_CODES) {
    assert.equal(isTransientError({ code }), true);
  }
});

test("mergeParams 优先级：调用方 > binding > provider", () => {
  const merged = mergeParams(
    { model: "m1", temperature: 0.3, maxTokens: 100, secretEnv: "MINIMAX_API_KEY", baseUrl: "https://a" },
    { temperature: 0.5 },
    { temperature: 0.7, maxTokens: 200 }
  );
  assert.equal(merged.model, "m1");
  assert.equal(merged.temperature, 0.7);
  assert.equal(merged.maxTokens, 200);
  assert.equal(merged.secretEnv, "MINIMAX_API_KEY");
  assert.equal(merged.baseUrl, "https://a");
});

test("mergeParams 白名单外键不可被覆盖", () => {
  const merged = mergeParams(
    { secretEnv: "MINIMAX_API_KEY", baseUrl: "https://provider" },
    { secretEnv: "HACKED", baseUrl: "https://evil" },
    { secretEnv: "HACKED2", driver: "other" }
  );
  assert.equal(merged.secretEnv, "MINIMAX_API_KEY");
  assert.equal(merged.baseUrl, "https://provider");
  assert.equal(merged.driver, undefined);
});

test("mergeParams 数值键做类型归一", () => {
  const merged = mergeParams({ temperature: "0.35", maxTokens: "12000", timeoutMs: "240000" });
  assert.equal(merged.temperature, 0.35);
  assert.equal(merged.maxTokens, 12000);
  assert.equal(merged.timeoutMs, 240000);
});
