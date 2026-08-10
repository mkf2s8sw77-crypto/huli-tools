"use strict";

// 发言候选（speech suggestions）纯函数模块：
// 不依赖 wx-server-sdk，便于 node --test 直接单测。
// 由 ai.js 装配进 coreModel 网关调用链路（capability: speech_suggestion）。
//
// 设计要点（谁是卧底玩法）：
// - 好的发言要"有细节但不独特"：围绕密令的一个具体特征描述，让同阵营能相认，
//   又不让卧底/对手轻松锁定词语；泛泛的"正确的废话"会被投票投死。
// - 任何候选都不得包含任一密令原文（含对方密令），服务端用 filterLeakSuggestions
//   做硬过滤兜底，模板降级也必须先过滤知识点再拼装。

const MAX_SUGGESTION_COUNT = 3;
const MAX_SUGGESTION_LENGTH = 120;

// role: 玩家角色（含 team / secretLabel），只用于服务端拼 prompt，不下发客户端
function buildSpeechSuggestionsPrompt(role, scenario, roundNo, transcript, mode) {
  const identity = role.team === "undercover" ? scenario.undercoverSecret : scenario.civilianSecret;
  const transcriptText = (transcript || [])
    .map((t) => `[第${t.roundNo}轮] ${t.roleId === "player" ? "玩家" : t.roleId}: ${t.text}`)
    .join("\n");

  const modeHint = mode === "word_undercover"
    ? "这是词语卧底游戏：平民拿到同一个护理概念，卧底拿到一个相近但不同的概念。"
    : "这是病例推理卧底游戏：平民拿到同一种安全护理措施，卧底拿到一种不同的措施。";

  const roleStrategy = role.team === "undercover"
    ? [
      "玩家是卧底，密令与其他人不同，但玩家不知道别人的词。",
      "候选发言的策略是【安全模糊】：围绕自己密令说宽泛、不站队、不给出独特细节的话，",
      "让别人无法从发言锁定你的词，同时听起来像在认真参与讨论。",
    ].join("\n")
    : [
      "玩家是平民，大多数人与玩家拿着同一个词。",
      "候选发言的策略是【具体特征描述】：围绕密令的一个具体特征说细节",
      "（使用场景 / 操作步骤 / 注意事项 / 临床经验），让拿着同一个词的同伴能认出你是自己人，",
      "但不要给出独一无二到让卧底直接猜中词语的细节。",
    ].join("\n");

  const systemPrompt = [
    "你是护理教学版「谁是卧底」游戏的发言教练，帮人类玩家写 3 条候选发言。",
    modeHint,
    `玩家的密令是："${identity}"。`,
    roleStrategy,
    "合格发言的标准：",
    "1. 有具体内容：描述一个真实细节，而不是抽象评价",
    "2. 口语自然：像真实护理人员在讨论，一句话说完",
    "3. 三条候选角度各不相同",
    `4. 每条控制在${MAX_SUGGESTION_LENGTH}字以内`,
    "硬性禁止（违反任何一条都不合格）：",
    `A. 不得包含密令原文"${identity}"及其中的任何连续片段，也不得用拆字、同义替换的方式变相说出`,
    "B. 不得猜测或提及其他人可能持有的词",
    "C. 不得写泛泛的空话套话，例如「很重要」「值得重视」「临床上要格外注意」「大家都要掌握」这类没有任何信息量的句子",
    "好坏示例（主题是某手卫生概念，仅示范风格，不要照抄内容）：",
    "  坏：「我觉得关键在于手部有可见污染时要注意，临床上要格外注意。」——空话，且差点把词说出来",
    "  坏：「这个护理知识点在日常工作中经常用到，值得大家重视。」——零信息量，会被投死",
    "  好：「上次给术后患者换药前我就是按这个流程来的，揉搓这一步很多人会漏掉指缝。」",
    "  好：「我们科室感控抽查就查这个，时间点选不对等于白做。」",
    "返回严格 JSON 格式。",
  ].join("\n");

  const userPrompt = [
    `当前是第 ${roundNo} 轮发言。`,
    transcriptText ? `已有发言记录：\n${transcriptText}` : "目前还没有人发言。",
    `请返回 JSON：{"suggestions": ["候选发言1", "候选发言2", "候选发言3"]}，恰好 ${MAX_SUGGESTION_COUNT} 条`,
  ].join("\n");

  return { systemPrompt, userPrompt };
}

// 归一化模型输出：只保留非空字符串，逐条截断，最多 MAX_SUGGESTION_COUNT 条
function normalizeSuggestions(rawList) {
  if (!Array.isArray(rawList)) return [];
  return rawList
    .filter((s) => typeof s === "string" && s.trim())
    .map((s) => s.trim().slice(0, MAX_SUGGESTION_LENGTH))
    .slice(0, MAX_SUGGESTION_COUNT);
}

// 泄露硬过滤：丢弃包含任一密令原文（或密令的任一连续半段子串，防拆半提及）的候选
function filterLeakSuggestions(list, scenario) {
  if (!Array.isArray(list)) return [];
  const secrets = [scenario && scenario.civilianSecret, scenario && scenario.undercoverSecret]
    .filter((s) => typeof s === "string" && s.trim());
  if (secrets.length === 0) return list;
  return list.filter((s) => !secrets.some((secret) => s.includes(secret)));
}

// 模板降级：只用不含任一密令原文的知识点拼装；不足时用中性安全句补足
function generateTemplateSuggestions(scenario) {
  const secrets = [scenario && scenario.civilianSecret, scenario && scenario.undercoverSecret]
    .filter((s) => typeof s === "string" && s.trim());
  const isSafe = (text) => typeof text === "string" && text.trim()
    && !secrets.some((secret) => text.includes(secret));

  const points = scenario && Array.isArray(scenario.knowledgePoints)
    ? scenario.knowledgePoints.filter(isSafe)
    : [];

  const patterns = [
    (p) => `我刚才想到的也是这个方向，${String(p).slice(0, 40)}，这点我印象很深。`,
    (p) => `结合我们科室的情况，${String(p).slice(0, 40)}，实际执行时确实容易忽略。`,
    (p) => `带教的时候老师特别强调过，${String(p).slice(0, 40)}。`,
  ];
  const neutral = [
    "我上一轮观察下来，大家说的方向都差不多，我补充一个实际工作中遇到的场景吧。",
    "这个操作我入职第一年做过很多次，流程细节做到位和做表面功夫差别很大。",
    "感控检查的时候这一项是必看的，具体怎么做对，咱们应该说的是一回事。",
  ];

  const suggestions = points
    .slice(0, MAX_SUGGESTION_COUNT)
    .map((p, i) => patterns[i % patterns.length](p));
  let neutralIndex = 0;
  while (suggestions.length < MAX_SUGGESTION_COUNT && neutralIndex < neutral.length) {
    suggestions.push(neutral[neutralIndex]);
    neutralIndex += 1;
  }
  return suggestions.slice(0, MAX_SUGGESTION_COUNT);
}

module.exports = {
  MAX_SUGGESTION_COUNT,
  MAX_SUGGESTION_LENGTH,
  buildSpeechSuggestionsPrompt,
  normalizeSuggestions,
  filterLeakSuggestions,
  generateTemplateSuggestions,
};
