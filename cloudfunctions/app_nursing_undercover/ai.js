"use strict";

const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 谁是卧底不再直连 CloudBase AI：统一经 coreModel 网关，
// 绑定 nursing_undercover__npc_speech / npc_vote / debrief，模型由 model_providers 配置。
// 绑定缺失或不可用时降级为模板生成（与迁移前行为一致）。
const CORE_MODEL_FUNCTION = "coreModel";
const APP_KEY = "nursing_undercover";
const MAX_SPEECH_LENGTH = 120;

// 配置类错误：说明绑定/provider 未就绪，本实例后续直接走模板，不再重复 RPC
const CONFIG_ERROR_CODES = [
  "MODEL_BINDING_MISSING",
  "MODEL_BINDING_DISABLED",
  "MODEL_CONFIG_MISSING",
  "INTERNAL_SECRET_NOT_CONFIGURED",
  "FORBIDDEN",
];

let aiAvailable = true;

function getInternalToken() {
  return process.env.INTERNAL_API_SECRET || "";
}

function isAIReady() {
  return aiAvailable && Boolean(getInternalToken());
}

function buildNpcSpeechPrompt(role, scenario, roundNo, transcript, mode) {
  const identity = role.team === "undercover" ? scenario.undercoverSecret : scenario.civilianSecret;
  const existingSpeeches = transcript
    .filter((t) => t.roundNo === roundNo)
    .map((t) => `${t.roleId}: ${t.text}`)
    .join("\n");

  let modeHint = "";
  if (mode === "word_undercover") {
    modeHint = "你在玩词语卧底游戏。你拿到的密令是一个护理概念，你需要围绕它描述但不能直接说出密令原文。";
  } else {
    modeHint = "你在玩病例推理卧底游戏。你拿到的是一种护理措施，你需要围绕护理情境讨论但不能直接暴露自己的措施内容。";
  }

  const systemPrompt = [
    `你是护理教学游戏中的 ${role.displayName}。`,
    modeHint,
    `你的密令是："${identity}"。`,
    "规则：",
    "1. 绝对不能直接说出你的密令原文",
    "2. 不能说出'我是卧底'或指认其他人是卧底",
    "3. 围绕你的密令相关的护理知识进行描述",
    "4. 发言要自然，像真实的护理人员在讨论",
    `5. 发言控制在${MAX_SPEECH_LENGTH}字以内`,
    "6. 返回严格 JSON 格式",
  ].join("\n");

  const userPrompt = [
    `当前是第 ${roundNo} 轮发言。`,
    existingSpeeches ? `本轮已有发言：\n${existingSpeeches}` : "你是本轮第一个发言的。",
    '请返回 JSON：{"speech": "你的发言内容", "privateReasoning": "你的内心推理（不会公开）"}',
  ].join("\n");

  return { systemPrompt, userPrompt };
}

function buildNpcVotePrompt(role, transcript, allRoles, scenario, mode) {
  const votableRoles = allRoles
    .filter((r) => r.roleId !== role.roleId)
    .map((r) => r.roleId);

  const transcriptText = transcript
    .map((t) => `[第${t.roundNo}轮] ${t.roleId}: ${t.text}`)
    .join("\n");

  const systemPrompt = [
    `你是 ${role.displayName}，正在参与谁是卧底投票环节。`,
    mode === "word_undercover"
      ? "这是词语卧底游戏，卧底拿到的密令和其他人略有不同。"
      : "这是病例推理卧底游戏，卧底持有的护理措施与其他人不同。",
    "根据所有人的发言记录，分析谁最可能是卧底并投票。",
    "返回严格 JSON 格式。",
  ].join("\n");

  const userPrompt = [
    "发言记录：",
    transcriptText,
    "",
    `可投票目标：${votableRoles.join(", ")}`,
    '请返回 JSON：{"voteTarget": "目标roleId", "reason": "投票理由（30字以内）"}',
  ].join("\n");

  return { systemPrompt, userPrompt };
}

function buildDebriefPrompt(scenario, transcript, result, mode) {
  const transcriptText = transcript
    .map((t) => `[第${t.roundNo}轮] ${t.roleId}: ${t.text}`)
    .join("\n");

  const systemPrompt = [
    "你是护理教学复盘专家。请对本局谁是卧底游戏进行教学复盘。",
    "注意：复盘仅用于护理教学训练，不构成医疗建议。",
    "返回严格 JSON 格式。",
  ].join("\n");

  const contextInfo = mode === "case_reasoning"
    ? `安全做法：${scenario.safePractice || ""}\n不安全做法：${scenario.unsafePractice || ""}\n`
    : "";

  const userPrompt = [
    `模式：${mode === "word_undercover" ? "词语卧底" : "病例推理卧底"}`,
    `平民密令：${scenario.civilianSecret}`,
    `卧底密令：${scenario.undercoverSecret}`,
    contextInfo,
    `胜利方：${result.winner === "civilian" ? "平民" : "卧底"}`,
    "",
    "发言记录：",
    transcriptText,
    "",
    "请返回 JSON：",
    '{',
    '  "summary": "教学复盘总结（100字以内，以【本局教学训练复盘：】开头）",',
    '  "keyClues": ["关键线索1", "关键线索2"],',
    '  "knowledgePoints": ["知识点1", "知识点2"],',
    '  "safetyNotes": ["安全提醒1"]',
    '}',
  ].join("\n");

  return { systemPrompt, userPrompt };
}

function parseJSON(text) {
  const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  return JSON.parse(cleaned);
}

async function generateWithModel(systemPrompt, userPrompt, capability) {
  if (!isAIReady()) {
    return { ok: false, code: "AI_NOT_READY", message: "模型绑定未就绪，已切换模板生成" };
  }

  let result;
  try {
    const res = await cloud.callFunction({
      name: CORE_MODEL_FUNCTION,
      data: {
        action: "generateText",
        _internalToken: getInternalToken(),
        appKey: APP_KEY,
        capability,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        overrides: { temperature: 0.7, maxTokens: 500 },
      },
    });
    result = res.result || {};
  } catch (err) {
    return { ok: false, code: "AI_GENERATION_FAILED", message: "AI 调用失败: " + err.message };
  }

  if (!result.ok) {
    const error = result.error || {};
    if (CONFIG_ERROR_CODES.includes(error.code)) {
      aiAvailable = false;
      return { ok: false, code: "AI_NOT_READY", message: error.message || "模型绑定未配置" };
    }
    return { ok: false, code: "AI_GENERATION_FAILED", message: "AI 调用失败: " + (error.message || error.code || "未知错误") };
  }

  const text = result.data && result.data.text ? result.data.text : "";
  if (!text) {
    return { ok: false, code: "AI_RESPONSE_INVALID", message: "AI 返回为空" };
  }
  try {
    const parsed = parseJSON(text);
    return { ok: true, data: parsed, raw: text };
  } catch (parseErr) {
    return { ok: false, code: "AI_RESPONSE_INVALID", message: "AI 返回非 JSON: " + text.slice(0, 200) };
  }
}

async function generateNpcSpeech(role, scenario, roundNo, transcript, mode) {
  const { systemPrompt, userPrompt } = buildNpcSpeechPrompt(role, scenario, roundNo, transcript, mode);
  const result = await generateWithModel(systemPrompt, userPrompt, "npc_speech");
  if (!result.ok) return result;

  const data = result.data;
  if (!data.speech || typeof data.speech !== "string") {
    return { ok: false, code: "AI_RESPONSE_INVALID", message: "AI 返回缺少 speech 字段" };
  }

  const speech = data.speech.slice(0, MAX_SPEECH_LENGTH);
  return { ok: true, speech, privateReasoning: data.privateReasoning || "" };
}

async function generateNpcVote(role, transcript, allRoles, scenario, mode) {
  const { systemPrompt, userPrompt } = buildNpcVotePrompt(role, transcript, allRoles, scenario, mode);
  const result = await generateWithModel(systemPrompt, userPrompt, "npc_vote");
  if (!result.ok) return result;

  const data = result.data;
  if (!data.voteTarget || typeof data.voteTarget !== "string") {
    return { ok: false, code: "AI_RESPONSE_INVALID", message: "AI 返回缺少 voteTarget 字段" };
  }

  const validTargets = allRoles
    .filter((r) => r.roleId !== role.roleId)
    .map((r) => r.roleId);
  const target = validTargets.includes(data.voteTarget) ? data.voteTarget : validTargets[0];

  return { ok: true, targetRoleId: target, reason: (data.reason || "").slice(0, 50) };
}

async function generateDebrief(scenario, transcript, result, mode) {
  const { systemPrompt, userPrompt } = buildDebriefPrompt(scenario, transcript, result, mode);
  const genResult = await generateWithModel(systemPrompt, userPrompt, "debrief");
  if (!genResult.ok) return genResult;

  const data = genResult.data;
  return {
    ok: true,
    debrief: {
      summary: (data.summary || "教学训练复盘：本局游戏已结束。").slice(0, 200),
      keyClues: Array.isArray(data.keyClues) ? data.keyClues.slice(0, 5) : [],
      knowledgePoints: Array.isArray(data.knowledgePoints) ? data.knowledgePoints.slice(0, 5) : scenario.knowledgePoints || [],
      safetyNotes: Array.isArray(data.safetyNotes) ? data.safetyNotes.slice(0, 3) : ["仅用于护理教学训练，不构成医疗建议"],
    },
  };
}

function generateTemplateSpeech(role, scenario, roundNo) {
  const identity = role.team === "undercover" ? scenario.undercoverSecret : scenario.civilianSecret;
  const templates = [
    `作为护理人员，我觉得这个概念在日常工作中很重要，需要特别注意操作规范。`,
    `在临床实践中，这种方法对患者安全有直接影响，我们要谨慎对待。`,
    `我认为这个护理操作需要结合患者实际情况来判断最佳方案。`,
    `从教学角度来看，理解这个概念对提升护理质量很有帮助。`,
    `在我的经验中，正确执行这项护理措施可以有效降低不良事件。`,
    `这个护理知识点在考核中经常涉及，临床意义也很大。`,
  ];
  const index = (role.roleId.charCodeAt(role.roleId.length - 1) + roundNo) % templates.length;
  return templates[index];
}

function generateTemplateVote(role, allRoles) {
  const targets = allRoles.filter((r) => r.roleId !== role.roleId);
  const target = targets[Math.floor(Math.random() * targets.length)];
  return { targetRoleId: target.roleId, reason: "发言内容可疑" };
}

function generateTemplateDebrief(scenario, mode) {
  const debrief = {
    summary: "本局教学训练复盘：通过谁是卧底游戏，训练了对护理概念差异的辨识能力。仅用于护理教学训练，不构成医疗建议。",
    keyClues: [`平民密令"${scenario.civilianSecret}"和卧底密令"${scenario.undercoverSecret}"的差异`],
    knowledgePoints: scenario.knowledgePoints || [],
    safetyNotes: ["仅用于护理教学训练，不构成医疗建议"],
  };
  if (mode === "case_reasoning" && scenario.answerExplanation) {
    debrief.summary = "本局教学训练复盘：" + scenario.answerExplanation.slice(0, 150) + " 仅用于护理教学训练。";
  }
  return debrief;
}

module.exports = {
  isAIReady,
  generateNpcSpeech,
  generateNpcVote,
  generateDebrief,
  generateTemplateSpeech,
  generateTemplateVote,
  generateTemplateDebrief,
};
