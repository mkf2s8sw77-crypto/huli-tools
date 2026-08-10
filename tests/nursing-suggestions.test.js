const assert = require("node:assert/strict");
const test = require("node:test");
const { cleanModelJsonText } = require("../cloudfunctions/app_nursing_undercover/lib/json-utils");
const {
  MAX_SUGGESTION_COUNT,
  MAX_SUGGESTION_LENGTH,
  buildSpeechSuggestionsPrompt,
  normalizeSuggestions,
  filterLeakSuggestions,
  generateTemplateSuggestions,
} = require("../cloudfunctions/app_nursing_undercover/lib/speech-suggestions");

const scenario = {
  scenarioKey: "word_student_handwash",
  civilianSecret: "七步洗手法",
  undercoverSecret: "外科手消毒",
  knowledgePoints: ["揉搓时间不少于15秒", "覆盖指缝与腕部"],
};

const civilianRole = { roleId: "player", team: "civilian" };
const undercoverRole = { roleId: "player", team: "undercover" };

test("buildSpeechSuggestionsPrompt 平民身份使用平民密令", () => {
  const { systemPrompt, userPrompt } = buildSpeechSuggestionsPrompt(civilianRole, scenario, 1, [], "word_undercover");
  assert.ok(systemPrompt.includes("七步洗手法"));
  assert.ok(!systemPrompt.includes("外科手消毒"));
  assert.ok(userPrompt.includes("第 1 轮"));
  assert.ok(userPrompt.includes("suggestions"));
});

test("buildSpeechSuggestionsPrompt 卧底身份使用卧底密令", () => {
  const { systemPrompt } = buildSpeechSuggestionsPrompt(undercoverRole, scenario, 2, [], "case_reasoning");
  assert.ok(systemPrompt.includes("外科手消毒"));
  assert.ok(systemPrompt.includes("病例推理"));
});

test("buildSpeechSuggestionsPrompt 携带发言记录且玩家标记为玩家", () => {
  const transcript = [
    { roundNo: 1, roleId: "player", text: "我先说" },
    { roundNo: 1, roleId: "npc_1", text: "我也说" },
  ];
  const { userPrompt } = buildSpeechSuggestionsPrompt(civilianRole, scenario, 1, transcript, "word_undercover");
  assert.ok(userPrompt.includes("玩家: 我先说"));
  assert.ok(userPrompt.includes("npc_1: 我也说"));
});

test("normalizeSuggestions 过滤非字符串、截断并限制条数", () => {
  const raw = ["  甲  ", "", null, 42, "乙", "丙", "丁", "x".repeat(MAX_SUGGESTION_LENGTH + 50)];
  const out = normalizeSuggestions(raw);
  assert.deepEqual(out.slice(0, 3), ["甲", "乙", "丙"]);
  assert.equal(out.length, MAX_SUGGESTION_COUNT);
  assert.ok(out.every((s) => s.length <= MAX_SUGGESTION_LENGTH));
});

test("normalizeSuggestions 对非数组输入返回空数组", () => {
  assert.deepEqual(normalizeSuggestions(null), []);
  assert.deepEqual(normalizeSuggestions("suggestions"), []);
  assert.deepEqual(normalizeSuggestions(undefined), []);
});

test("generateTemplateSuggestions 基于知识点生成且不含密令原文", () => {
  const out = generateTemplateSuggestions(scenario);
  assert.equal(out.length, MAX_SUGGESTION_COUNT);
  assert.ok(out[0].includes("揉搓时间不少于15秒"));
  assert.ok(out.every((s) => !s.includes("七步洗手法") && !s.includes("外科手消毒")));
});

test("cleanModelJsonText 剥离 think 思维链与代码围栏", () => {
  assert.equal(cleanModelJsonText('<think>推理过程...</think>{"a":1}'), '{"a":1}');
  assert.equal(cleanModelJsonText('<think>未闭合的推理'), ""); // 截断只剩思维链
  assert.equal(cleanModelJsonText('```json\n{"a":1}\n```'), '{"a":1}');
  assert.equal(cleanModelJsonText('<think>t</think>```json {"a":1} ```'), '{"a":1}');
  assert.equal(cleanModelJsonText('{"a":1}'), '{"a":1}');
  assert.equal(cleanModelJsonText(null), "");
});

test("generateTemplateSuggestions 无知识点时兜底仍返回满 3 条", () => {
  const out = generateTemplateSuggestions({});
  assert.equal(out.length, MAX_SUGGESTION_COUNT);
  assert.ok(out.every((s) => typeof s === "string" && s.length > 0));
});

test("buildSpeechSuggestionsPrompt 平民与卧底策略不同", () => {
  const civilian = buildSpeechSuggestionsPrompt(civilianRole, scenario, 1, [], "word_undercover");
  const undercover = buildSpeechSuggestionsPrompt(undercoverRole, scenario, 1, [], "word_undercover");
  assert.ok(civilian.systemPrompt.includes("具体特征描述"));
  assert.ok(undercover.systemPrompt.includes("安全模糊"));
});

test("buildSpeechSuggestionsPrompt 明确禁止空话与密令泄露", () => {
  const { systemPrompt } = buildSpeechSuggestionsPrompt(civilianRole, scenario, 1, [], "word_undercover");
  assert.ok(systemPrompt.includes("不得包含密令原文"));
  assert.ok(systemPrompt.includes("空话套话"));
  assert.ok(systemPrompt.includes("好："));
  assert.ok(systemPrompt.includes("坏："));
});

test("filterLeakSuggestions 丢弃含任一密令原文的候选", () => {
  const list = [
    "我觉得七步洗手法很关键", // 含平民密令 → 丢弃
    "外科手消毒适合日常", // 含卧底密令 → 丢弃
    "揉搓这一步很多人会漏掉指缝", // 安全
  ];
  assert.deepEqual(filterLeakSuggestions(list, scenario), ["揉搓这一步很多人会漏掉指缝"]);
  assert.deepEqual(filterLeakSuggestions(null, scenario), []);
  assert.deepEqual(filterLeakSuggestions(list, {}), list); // 无密令信息时不过滤
});

test("generateTemplateSuggestions 知识点含密令时不泄露", () => {
  const leakyScenario = {
    civilianSecret: "七步洗手法",
    undercoverSecret: "快速手消毒液",
    knowledgePoints: [
      "七步洗手法适用于手部有可见污染时", // 含平民密令，应被过滤
      "快速手消毒液适用于手部无明显污染的常规消毒", // 含卧底密令，应被过滤
      "揉搓时间不少于15秒", // 安全
    ],
  };
  const out = generateTemplateSuggestions(leakyScenario);
  assert.equal(out.length, MAX_SUGGESTION_COUNT);
  assert.ok(out.every((s) => !s.includes("七步洗手法") && !s.includes("快速手消毒液")));
  assert.ok(out.some((s) => s.includes("揉搓时间不少于15秒")));
});
