"use strict";

// 发言候选（speech suggestions）纯函数模块：
// 不依赖 wx-server-sdk，便于 node --test 直接单测。
// 由 ai.js 装配进 coreModel 网关调用链路（capability: speech_suggestion）。

const MAX_SUGGESTION_COUNT = 3;
const MAX_SUGGESTION_LENGTH = 120;

// role: 玩家角色（含 team / secretLabel），只用于服务端拼 prompt，不下发客户端
function buildSpeechSuggestionsPrompt(role, scenario, roundNo, transcript, mode) {
  const identity = role.team === "undercover" ? scenario.undercoverSecret : scenario.civilianSecret;
  const transcriptText = (transcript || [])
    .map((t) => `[第${t.roundNo}轮] ${t.roleId === "player" ? "玩家" : t.roleId}: ${t.text}`)
    .join("\n");

  const modeHint = mode === "word_undercover"
    ? "这是词语卧底游戏，玩家拿到的密令是一个护理概念，需要围绕它描述但不能直接说出密令原文。"
    : "这是病例推理卧底游戏，玩家拿到的是一种护理措施，需要围绕护理情境讨论但不能直接暴露自己的措施内容。";

  const systemPrompt = [
    "你是护理教学游戏的辅助教练，帮助人类玩家想出发言。",
    modeHint,
    `玩家的密令是："${identity}"。`,
    "规则：",
    "1. 候选发言绝对不能直接包含密令原文",
    "2. 候选发言之间要有不同角度（如概念描述、临床经验、注意事项）",
    "3. 每条发言自然口语化，像真实的护理人员在讨论",
    `4. 每条控制在${MAX_SUGGESTION_LENGTH}字以内`,
    "5. 返回严格 JSON 格式",
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

// 模板降级：基于场景公开知识点拼装，绝不包含密令原文
function generateTemplateSuggestions(scenario) {
  const points = scenario && Array.isArray(scenario.knowledgePoints) && scenario.knowledgePoints.length > 0
    ? scenario.knowledgePoints
    : ["操作规范", "患者安全"];
  const suggestions = points
    .slice(0, MAX_SUGGESTION_COUNT)
    .map((p) => `我觉得关键在于${String(p).slice(0, 40)}，临床上要格外注意。`);
  while (suggestions.length < MAX_SUGGESTION_COUNT) {
    suggestions.push("这个护理知识点在日常工作中经常用到，值得大家重视。");
  }
  return suggestions;
}

module.exports = {
  MAX_SUGGESTION_COUNT,
  MAX_SUGGESTION_LENGTH,
  buildSpeechSuggestionsPrompt,
  normalizeSuggestions,
  generateTemplateSuggestions,
};
