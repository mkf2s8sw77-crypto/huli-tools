const assert = require("node:assert/strict");
const test = require("node:test");
const {
  MAX_INPUT_CHARS,
  SECTION_KEYS,
  detectLanguage,
  normalizeSections,
  validateInput,
  buildMessages,
  parseModelOutput,
} = require("../cloudfunctions/app_paper_polish/lib/prompt-builder");

test("detectLanguage 识别中文草稿为 zh-to-en", () => {
  const zh = "目的 探讨循证护理干预对降低 ICU 患者谵妄发生率的效果。方法 采用随机对照试验。";
  assert.equal(detectLanguage(zh), "zh-to-en");
});

test("detectLanguage 识别英文草稿为 en", () => {
  const en = "Background: Delirium is common in intensive care unit patients and is associated with worse outcomes.";
  assert.equal(detectLanguage(en), "en");
});

test("detectLanguage 对空文本与极少量中文回退 en", () => {
  assert.equal(detectLanguage(""), "en");
  assert.equal(detectLanguage("   "), "en");
  assert.equal(detectLanguage("The PICO framework guides nursing research questions."), "en");
});

test("normalizeSections 过滤白名单、去重并保留顺序", () => {
  assert.deepEqual(normalizeSections(["abstract", " bogus ", "intro", "abstract", 123]), ["abstract", "intro"]);
  assert.deepEqual(normalizeSections([]), []);
  assert.deepEqual(normalizeSections(null), []);
  assert.deepEqual(normalizeSections("abstract"), []);
});

test("normalizeSections 不超过章节上限", () => {
  const many = SECTION_KEYS.concat(["abstract"]);
  assert.ok(normalizeSections(many).length <= 7);
});

test("validateInput 校验空文本与超长文本", () => {
  assert.equal(validateInput("").code, "POLISH_EMPTY_INPUT");
  assert.equal(validateInput("   ").code, "POLISH_EMPTY_INPUT");
  assert.equal(validateInput(null).code, "POLISH_EMPTY_INPUT");
  assert.equal(validateInput("x".repeat(MAX_INPUT_CHARS + 1)).code, "POLISH_INPUT_TOO_LONG");
  assert.equal(validateInput("x".repeat(MAX_INPUT_CHARS)), null);
});

test("buildMessages 中文草稿使用 zh-to-en 片段并携带原文", () => {
  const zh = "目的 探讨集束化护理对呼吸机相关性肺炎的预防效果。".repeat(5);
  const built = buildMessages({ text: zh, sections: ["abstract"] });
  assert.equal(built.language, "zh-to-en");
  assert.equal(built.messages.length, 2);
  assert.equal(built.messages[0].role, "system");
  assert.equal(built.messages[1].role, "user");
  assert.ok(built.messages[0].content.length > 0);
  assert.ok(built.messages[1].content.includes(zh));
  assert.ok(built.messages[1].content.includes("翻译"));
});

test("buildMessages 未选章节时注入全部章节规则并提示自动检测", () => {
  const en = "Results: The intervention group showed a significant reduction in delirium incidence (p < 0.05).";
  const built = buildMessages({ text: en, sections: [] });
  assert.equal(built.language, "en");
  assert.ok(built.messages[0].content.includes("Detect section boundaries"));
});

test("buildMessages 选中章节时声明对应 section", () => {
  const en = "Discussion: These findings suggest that nurse-led interventions are effective.";
  const built = buildMessages({ text: en, sections: ["discussion", "conclusion"] });
  assert.ok(built.messages[0].content.includes("discussion, conclusion"));
});

test("buildMessages 的 system prompt 不超过 coreModel 单条消息上限", () => {
  const en = "Background: test.".repeat(10);
  const built = buildMessages({ text: en, sections: [] });
  assert.ok(built.messages[0].content.length <= 50000, "system prompt 超长: " + built.messages[0].content.length);
});

test("parseModelOutput 解析严格 JSON", () => {
  const raw = JSON.stringify({ polished: "Polished text.", summary: ["要点一", "要点二"] });
  const parsed = parseModelOutput(raw);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.polished, "Polished text.");
  assert.deepEqual(parsed.summary, ["要点一", "要点二"]);
  assert.equal(parsed.degraded, false);
});

test("parseModelOutput 兼容代码围栏 JSON", () => {
  const raw = "```json\n{\"polished\": \"Fenced result.\", \"summary\": [\"a\"]}\n```";
  const parsed = parseModelOutput(raw);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.polished, "Fenced result.");
  assert.equal(parsed.degraded, false);
});

test("parseModelOutput 非 JSON 时降级为纯文本", () => {
  const parsed = parseModelOutput("This is the polished manuscript without any JSON wrapper.");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.polished, "This is the polished manuscript without any JSON wrapper.");
  assert.deepEqual(parsed.summary, []);
  assert.equal(parsed.degraded, true);
});

test("parseModelOutput 空输出报错", () => {
  assert.equal(parseModelOutput("").ok, false);
  assert.equal(parseModelOutput(null).ok, false);
});
