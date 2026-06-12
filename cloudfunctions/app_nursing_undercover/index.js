"use strict";

const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const APP_KEY = "nursing_undercover";
const SESSION_COLLECTION = "app_nursing_undercover_sessions";

const scenarios = require("./scenarios");
const ai = require("./ai");

function makeResponse(ok, dataOrError, requestId) {
  if (ok) {
    return { ok: true, data: dataOrError || {}, requestId };
  }
  return { ok: false, error: dataOrError || { code: "UNKNOWN", message: "未知错误" }, requestId };
}

function getInternalToken() {
  return process.env.INTERNAL_API_SECRET || "";
}

function buildUsageActionData(openid, data) {
  const token = getInternalToken();
  if (!token) return data;
  return { ...data, _internalToken: token, userId: openid };
}

async function validateUsage(usageId, openid, requestId, allowedStatuses) {
  let usage;
  try {
    const res = await db.collection("app_usage_records").doc(usageId).get();
    usage = res.data || null;
  } catch (err) {
    return { ok: false, response: makeResponse(false, { code: "DB_ERROR", message: "查询使用记录失败" }, requestId) };
  }
  if (!usage) {
    return { ok: false, response: makeResponse(false, { code: "USAGE_NOT_FOUND", message: "使用记录不存在" }, requestId) };
  }
  if (usage.userId !== openid) {
    return { ok: false, response: makeResponse(false, { code: "FORBIDDEN", message: "无权操作该使用记录" }, requestId) };
  }
  if (usage.appKey !== APP_KEY) {
    return { ok: false, response: makeResponse(false, { code: "APP_MISMATCH", message: "使用记录不属于本应用" }, requestId) };
  }
  const statuses = allowedStatuses || ["frozen", "created"];
  if (!statuses.includes(usage.status)) {
    return { ok: false, response: makeResponse(false, { code: "INVALID_STATUS", message: "使用记录状态不可执行" }, requestId) };
  }
  return { ok: true, usage };
}

async function callFinishUsage(openid, usageId, resultRef, requestId) {
  try {
    const res = await cloud.callFunction({
      name: "coreApp",
      data: buildUsageActionData(openid, { action: "finishUsage", usageId, resultRef }),
    });
    const r = res.result;
    if (!r || !r.ok) {
      const err = r && r.error ? r.error : { code: "FINISH_USAGE_FAILED", message: "结算失败" };
      if (err.code === "USAGE_ALREADY_FINISHED") return { ok: true, alreadyFinished: true };
      return { ok: false, error: err };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: { code: "FINISH_USAGE_FAILED", message: "结算调用失败: " + err.message } };
  }
}

async function callFailUsage(openid, usageId, errorCode, errorMessage) {
  try {
    const res = await cloud.callFunction({
      name: "coreApp",
      data: buildUsageActionData(openid, { action: "failUsage", usageId, errorCode, errorMessage }),
    });
    const r = res.result;
    if (!r || !r.ok) {
      const err = r && r.error ? r.error : { code: "FAIL_USAGE_FAILED", message: "释放积分失败" };
      if (err.code === "USAGE_ALREADY_FAILED") return { ok: true, alreadyFailed: true };
      return { ok: false, error: err };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: { code: "FAIL_USAGE_FAILED", message: "释放积分失败: " + err.message } };
  }
}

function buildRoles(npcCount, scenario) {
  const npcNames = scenarios.getNpcNames(npcCount);
  const totalPlayers = npcCount + 1;
  const undercoverIndex = Math.floor(Math.random() * totalPlayers);

  const roles = [];
  roles.push({
    roleId: "player",
    displayName: "我",
    actorType: "player",
    team: undercoverIndex === 0 ? "undercover" : "civilian",
    secretLabel: undercoverIndex === 0 ? scenario.undercoverSecret : scenario.civilianSecret,
    publicProfile: "玩家",
  });

  for (let i = 0; i < npcCount; i++) {
    const npcId = "npc_" + (i + 1);
    const isUndercover = undercoverIndex === (i + 1);
    roles.push({
      roleId: npcId,
      displayName: npcNames[i],
      actorType: "ai",
      team: isUndercover ? "undercover" : "civilian",
      secretLabel: isUndercover ? scenario.undercoverSecret : scenario.civilianSecret,
      publicProfile: npcNames[i],
    });
  }

  const undercoverRoleId = roles[undercoverIndex].roleId;
  return { roles, undercoverRoleId };
}

function sanitizeSessionForClient(session, isFinished) {
  const s = { ...session };
  s.roles = s.roles || [];
  s.transcript = s.transcript || [];
  s.votes = s.votes || [];
  s.actionReceipts = s.actionReceipts || [];
  if (!isFinished) {
    s.roles = s.roles.map((r) => {
      if (r.actorType === "player") return r;
      return { ...r, secretLabel: "***", team: "unknown" };
    });
    delete s.undercoverRoleId;
  }
  return s;
}

// ─── listConfig ───
async function listConfig(event, context) {
  const requestId = context.requestId || Date.now().toString();
  const meta = scenarios.getConfigMeta();
  return makeResponse(true, meta, requestId);
}

// ─── startGame ───
async function startGame(event, context) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const requestId = context.requestId || Date.now().toString();

  if (!openid) return makeResponse(false, { code: "UNAUTHORIZED", message: "无法获取用户身份" }, requestId);

  const { usageId, mode, difficulty, npcCount, roundCount, scenarioKey } = event;
  if (!usageId) return makeResponse(false, { code: "INVALID_PARAM", message: "缺少 usageId" }, requestId);

  const validModes = ["word_undercover", "case_reasoning"];
  const validDifficulties = ["student", "new_nurse", "specialist"];
  if (!validModes.includes(mode)) return makeResponse(false, { code: "INVALID_PARAM", message: "无效的模式" }, requestId);
  if (!validDifficulties.includes(difficulty)) return makeResponse(false, { code: "INVALID_PARAM", message: "无效的难度" }, requestId);

  const npc = typeof npcCount === "number" ? npcCount : 4;
  const rounds = typeof roundCount === "number" ? roundCount : 2;
  if (npc < 4 || npc > 6) return makeResponse(false, { code: "INVALID_PARAM", message: "AI NPC 数量需在 4-6 之间" }, requestId);
  if (rounds < 2 || rounds > 3) return makeResponse(false, { code: "INVALID_PARAM", message: "发言轮数需在 2-3 之间" }, requestId);

  const usageCheck = await validateUsage(usageId, openid, requestId);
  if (!usageCheck.ok) return usageCheck.response;

  // idempotent: check existing session for this usageId
  try {
    const existing = await db.collection(SESSION_COLLECTION).where({ usageId, userId: openid }).limit(1).get();
    if (existing.data && existing.data.length > 0) {
      const s = existing.data[0];
      const isFinished = ["finished", "cancelled", "failed"].includes(s.status);
      return makeResponse(true, sanitizeSessionForClient(s, isFinished), requestId);
    }
  } catch (err) {
    return makeResponse(false, { code: "DB_ERROR", message: "查询既有对局失败" }, requestId);
  }

  let scenario;
  if (scenarioKey) {
    scenario = scenarios.getScenarioByKey(scenarioKey);
    if (!scenario || scenario.mode !== mode || scenario.difficulty !== difficulty) {
      scenario = null;
    }
  }
  if (!scenario) {
    scenario = scenarios.pickRandomScenario(mode, difficulty);
  }
  if (!scenario) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "当前模式和难度暂无可用场景" }, requestId);
  }

  const { roles, undercoverRoleId } = buildRoles(npc, scenario);
  const now = new Date();

  const sessionData = {
    userId: openid,
    usageId,
    appKey: APP_KEY,
    mode,
    difficulty,
    scenarioKey: scenario.scenarioKey,
    scenarioTitle: scenario.title,
    npcCount: npc,
    roundCount: rounds,
    currentRound: 1,
    status: "in_progress",
    roles,
    playerRoleId: "player",
    undercoverRoleId,
    transcript: [],
    votes: [],
    result: null,
    debrief: null,
    actionReceipts: [],
    errorCode: "",
    errorMessage: "",
    createdAt: now,
    updatedAt: now,
    finishedAt: null,
  };

  try {
    const addRes = await db.collection(SESSION_COLLECTION).add({ data: sessionData });
    sessionData._id = addRes._id;
  } catch (err) {
    return makeResponse(false, { code: "DB_ERROR", message: "创建对局失败" }, requestId);
  }

  return makeResponse(true, sanitizeSessionForClient(sessionData, false), requestId);
}

// ─── submitSpeech ───
async function submitSpeech(event, context) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const requestId = context.requestId || Date.now().toString();

  if (!openid) return makeResponse(false, { code: "UNAUTHORIZED", message: "无法获取用户身份" }, requestId);

  const { sessionId, roundNo, text, clientActionId } = event;
  if (!sessionId) return makeResponse(false, { code: "INVALID_PARAM", message: "缺少 sessionId" }, requestId);
  if (!text || typeof text !== "string" || !text.trim()) return makeResponse(false, { code: "INVALID_PARAM", message: "发言内容不能为空" }, requestId);
  if (text.trim().length > 200) return makeResponse(false, { code: "INVALID_PARAM", message: "发言内容过长" }, requestId);

  let session;
  try {
    const res = await db.collection(SESSION_COLLECTION).doc(sessionId).get();
    session = res.data;
  } catch (err) {
    return makeResponse(false, { code: "SESSION_NOT_FOUND", message: "对局不存在" }, requestId);
  }
  if (!session) return makeResponse(false, { code: "SESSION_NOT_FOUND", message: "对局不存在" }, requestId);
  if (session.userId !== openid) return makeResponse(false, { code: "FORBIDDEN", message: "无权操作该对局" }, requestId);
  if (session.status !== "in_progress") return makeResponse(false, { code: "INVALID_STATUS", message: "对局状态不允许发言" }, requestId);

  session.roles = session.roles || [];
  session.transcript = session.transcript || [];
  session.actionReceipts = session.actionReceipts || [];

  const targetRound = typeof roundNo === "number" ? roundNo : session.currentRound;
  if (targetRound !== session.currentRound) return makeResponse(false, { code: "INVALID_PARAM", message: "当前不是该轮次" }, requestId);

  // idempotent check
  if (clientActionId) {
    const existing = session.actionReceipts.find((r) => r.clientActionId === clientActionId);
    if (existing) {
      const isFinished = ["finished", "cancelled", "failed"].includes(session.status);
      return makeResponse(true, sanitizeSessionForClient(session, isFinished), requestId);
    }
  }

  const playerAlreadySpoke = session.transcript.some(
    (t) => t.roundNo === targetRound && t.roleId === "player"
  );
  if (playerAlreadySpoke) {
    return makeResponse(false, { code: "DUPLICATE_ACTION", message: "本轮已发言" }, requestId);
  }

  const now = new Date();
  const playerSpeech = {
    roundNo: targetRound,
    roleId: "player",
    actorType: "player",
    text: text.trim().slice(0, 200),
    createdAt: now,
  };
  session.transcript.push(playerSpeech);

  const scenario = scenarios.getScenarioByKey(session.scenarioKey);
  const npcRoles = session.roles.filter((r) => r.actorType === "ai");
  const useAI = ai.isAIReady();
  let aiFailed = false;

  for (const npcRole of npcRoles) {
    const alreadySpoke = session.transcript.some(
      (t) => t.roundNo === targetRound && t.roleId === npcRole.roleId
    );
    if (alreadySpoke) continue;

    let speechText = "";

    if (useAI && scenario) {
      const result = await ai.generateNpcSpeech(npcRole, scenario, targetRound, session.transcript, session.mode);
      if (result.ok) {
        speechText = result.speech;
      } else {
        console.error("AI speech failed for", npcRole.roleId, result.code, result.message);
        aiFailed = true;
        speechText = ai.generateTemplateSpeech(npcRole, scenario, targetRound);
      }
    } else if (scenario) {
      speechText = ai.generateTemplateSpeech(npcRole, scenario, targetRound);
    } else {
      speechText = "我觉得这个护理知识点很重要，需要大家认真对待。";
    }

    session.transcript.push({
      roundNo: targetRound,
      roleId: npcRole.roleId,
      actorType: "ai",
      text: speechText,
      createdAt: new Date(),
    });
  }

  const nextRound = targetRound + 1;
  const isLastRound = targetRound >= session.roundCount;

  const updateData = {
    transcript: session.transcript,
    updatedAt: new Date(),
  };

  if (isLastRound) {
    updateData.status = "voting";
    session.status = "voting";
  } else {
    updateData.currentRound = nextRound;
    session.currentRound = nextRound;
  }

  if (clientActionId) {
    const receipt = { clientActionId, action: "submitSpeech", resultDigest: "round_" + targetRound, createdAt: now };
    updateData.actionReceipts = _.push(receipt);
    session.actionReceipts.push(receipt);
  }

  try {
    await db.collection(SESSION_COLLECTION).doc(sessionId).update({ data: updateData });
  } catch (err) {
    return makeResponse(false, { code: "DB_ERROR", message: "保存发言失败" }, requestId);
  }

  const responseData = sanitizeSessionForClient(session, false);
  if (aiFailed) responseData.fallback = true;
  return makeResponse(true, responseData, requestId);
}

// ─── submitVote ───
async function submitVote(event, context) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const requestId = context.requestId || Date.now().toString();

  if (!openid) return makeResponse(false, { code: "UNAUTHORIZED", message: "无法获取用户身份" }, requestId);

  const { sessionId, targetRoleId, clientActionId } = event;
  if (!sessionId) return makeResponse(false, { code: "INVALID_PARAM", message: "缺少 sessionId" }, requestId);
  if (!targetRoleId) return makeResponse(false, { code: "INVALID_PARAM", message: "缺少投票目标" }, requestId);

  let session;
  try {
    const res = await db.collection(SESSION_COLLECTION).doc(sessionId).get();
    session = res.data;
  } catch (err) {
    return makeResponse(false, { code: "SESSION_NOT_FOUND", message: "对局不存在" }, requestId);
  }
  if (!session) return makeResponse(false, { code: "SESSION_NOT_FOUND", message: "对局不存在" }, requestId);
  if (session.userId !== openid) return makeResponse(false, { code: "FORBIDDEN", message: "无权操作该对局" }, requestId);
  if (session.status !== "voting") return makeResponse(false, { code: "INVALID_STATUS", message: "对局状态不允许投票" }, requestId);

  session.roles = session.roles || [];
  session.transcript = session.transcript || [];
  session.votes = session.votes || [];
  session.actionReceipts = session.actionReceipts || [];

  // idempotent check
  if (clientActionId) {
    const existing = session.actionReceipts.find((r) => r.clientActionId === clientActionId);
    if (existing) {
      return makeResponse(true, sanitizeSessionForClient(session, session.status === "finished"), requestId);
    }
  }

  const playerAlreadyVoted = session.votes.some((v) => v.roleId === "player");
  if (playerAlreadyVoted) {
    return makeResponse(false, { code: "DUPLICATE_ACTION", message: "已投票" }, requestId);
  }

  const validTarget = session.roles.find((r) => r.roleId === targetRoleId && r.roleId !== "player");
  if (!validTarget) return makeResponse(false, { code: "INVALID_PARAM", message: "投票目标无效" }, requestId);

  const now = new Date();
  session.votes.push({
    roleId: "player",
    targetRoleId,
    reason: typeof event.reason === "string" ? event.reason.slice(0, 100) : "",
    createdAt: now,
  });

  const scenario = scenarios.getScenarioByKey(session.scenarioKey);
  const npcRoles = session.roles.filter((r) => r.actorType === "ai");
  const useAI = ai.isAIReady();

  for (const npcRole of npcRoles) {
    const alreadyVoted = session.votes.some((v) => v.roleId === npcRole.roleId);
    if (alreadyVoted) continue;

    let voteResult;
    if (useAI && scenario) {
      const result = await ai.generateNpcVote(npcRole, session.transcript, session.roles, scenario, session.mode);
      if (result.ok) {
        voteResult = { targetRoleId: result.targetRoleId, reason: result.reason };
      } else {
        voteResult = ai.generateTemplateVote(npcRole, session.roles);
      }
    } else {
      voteResult = ai.generateTemplateVote(npcRole, session.roles);
    }

    session.votes.push({
      roleId: npcRole.roleId,
      targetRoleId: voteResult.targetRoleId,
      reason: voteResult.reason || "",
      createdAt: new Date(),
    });
  }

  // count votes
  const voteCounts = {};
  for (const v of session.votes) {
    voteCounts[v.targetRoleId] = (voteCounts[v.targetRoleId] || 0) + 1;
  }
  const maxVotes = Math.max(...Object.values(voteCounts));
  let candidates = Object.entries(voteCounts)
    .filter(([, count]) => count === maxVotes)
    .map(([roleId]) => roleId);

  // tie-breaking: prefer player's target, then lexicographic
  if (candidates.length > 1) {
    if (candidates.includes(targetRoleId)) {
      candidates = [targetRoleId];
    } else {
      candidates.sort();
      candidates = [candidates[0]];
    }
  }
  const votedOutRoleId = candidates[0];
  const votedOutRole = session.roles.find((r) => r.roleId === votedOutRoleId);
  const isUndercoverVotedOut = votedOutRole && votedOutRole.team === "undercover";
  const winner = isUndercoverVotedOut ? "civilian" : "undercover";
  const playerRole = session.roles.find((r) => r.roleId === "player");
  const playerWon = (winner === "civilian" && playerRole.team === "civilian")
    || (winner === "undercover" && playerRole.team === "undercover");

  session.result = {
    winner,
    playerWon,
    votedOutRoleId,
    correctUndercoverRoleId: session.undercoverRoleId,
  };

  // generate debrief
  if (useAI && scenario) {
    const debriefResult = await ai.generateDebrief(scenario, session.transcript, session.result, session.mode);
    session.debrief = debriefResult.ok ? debriefResult.debrief : ai.generateTemplateDebrief(scenario, session.mode);
  } else if (scenario) {
    session.debrief = ai.generateTemplateDebrief(scenario, session.mode);
  } else {
    session.debrief = {
      summary: "本局教学训练复盘：游戏已结束。仅用于护理教学训练。",
      keyClues: [],
      knowledgePoints: [],
      safetyNotes: ["仅用于护理教学训练，不构成医疗建议"],
    };
  }

  session.status = "finished";
  session.finishedAt = new Date();

  const updateData = {
    votes: session.votes,
    result: session.result,
    debrief: session.debrief,
    status: "finished",
    updatedAt: new Date(),
    finishedAt: session.finishedAt,
  };

  if (clientActionId) {
    const receipt = { clientActionId, action: "submitVote", resultDigest: "voted_" + votedOutRoleId, createdAt: now };
    updateData.actionReceipts = _.push(receipt);
    session.actionReceipts.push(receipt);
  }

  const resultRef = JSON.stringify({
    sessionId: session._id,
    mode: session.mode,
    difficulty: session.difficulty,
    playerWon,
  });
  const finishRes = await callFinishUsage(openid, session.usageId, resultRef, requestId);
  if (!finishRes.ok) {
    console.error("finishUsage failed:", finishRes.error);
    return makeResponse(false, finishRes.error || { code: "FINISH_USAGE_FAILED", message: "结算使用记录失败" }, requestId);
  }

  try {
    await db.collection(SESSION_COLLECTION).doc(session._id).update({ data: updateData });
  } catch (err) {
    return makeResponse(false, { code: "DB_ERROR", message: "保存投票结果失败" }, requestId);
  }

  return makeResponse(true, sanitizeSessionForClient(session, true), requestId);
}

// ─── getGame ───
async function getGame(event, context) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const requestId = context.requestId || Date.now().toString();

  if (!openid) return makeResponse(false, { code: "UNAUTHORIZED", message: "无法获取用户身份" }, requestId);

  const { sessionId } = event;
  if (!sessionId) return makeResponse(false, { code: "INVALID_PARAM", message: "缺少 sessionId" }, requestId);

  let session;
  try {
    const res = await db.collection(SESSION_COLLECTION).doc(sessionId).get();
    session = res.data;
  } catch (err) {
    return makeResponse(false, { code: "SESSION_NOT_FOUND", message: "对局不存在" }, requestId);
  }
  if (!session) return makeResponse(false, { code: "SESSION_NOT_FOUND", message: "对局不存在" }, requestId);
  if (session.userId !== openid) return makeResponse(false, { code: "FORBIDDEN", message: "无权查看该对局" }, requestId);

  const isFinished = ["finished", "cancelled", "failed"].includes(session.status);
  return makeResponse(true, sanitizeSessionForClient(session, isFinished), requestId);
}

// ─── listMyGames ───
async function listMyGames(event, context) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const requestId = context.requestId || Date.now().toString();

  if (!openid) return makeResponse(false, { code: "UNAUTHORIZED", message: "无法获取用户身份" }, requestId);

  const page = typeof event.page === "number" ? Math.max(1, event.page) : 1;
  const pageSize = typeof event.pageSize === "number" ? Math.min(Math.max(1, event.pageSize), 20) : 10;
  const skip = (page - 1) * pageSize;

  try {
    const countRes = await db.collection(SESSION_COLLECTION).where({ userId: openid }).count();
    const total = countRes.total;

    const res = await db.collection(SESSION_COLLECTION)
      .where({ userId: openid })
      .orderBy("createdAt", "desc")
      .skip(skip)
      .limit(pageSize)
      .field({
        _id: true,
        mode: true,
        difficulty: true,
        scenarioTitle: true,
        status: true,
        npcCount: true,
        roundCount: true,
        result: true,
        createdAt: true,
        finishedAt: true,
      })
      .get();

    return makeResponse(true, {
      games: res.data || [],
      total,
      page,
      pageSize,
    }, requestId);
  } catch (err) {
    return makeResponse(false, { code: "DB_ERROR", message: "查询历史记录失败" }, requestId);
  }
}

// ─── cancelGame ───
async function cancelGame(event, context) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const requestId = context.requestId || Date.now().toString();

  if (!openid) return makeResponse(false, { code: "UNAUTHORIZED", message: "无法获取用户身份" }, requestId);

  const { sessionId } = event;
  if (!sessionId) return makeResponse(false, { code: "INVALID_PARAM", message: "缺少 sessionId" }, requestId);

  let session;
  try {
    const res = await db.collection(SESSION_COLLECTION).doc(sessionId).get();
    session = res.data;
  } catch (err) {
    return makeResponse(false, { code: "SESSION_NOT_FOUND", message: "对局不存在" }, requestId);
  }
  if (!session) return makeResponse(false, { code: "SESSION_NOT_FOUND", message: "对局不存在" }, requestId);
  if (session.userId !== openid) return makeResponse(false, { code: "FORBIDDEN", message: "无权操作该对局" }, requestId);

  if (["finished", "cancelled", "failed"].includes(session.status)) {
    return makeResponse(true, { status: session.status, sessionId }, requestId);
  }

  const now = new Date();
  const failRes = await callFailUsage(openid, session.usageId, "USER_CANCELLED", "用户取消对局");
  if (!failRes.ok) {
    return makeResponse(false, failRes.error || { code: "FAIL_USAGE_FAILED", message: "取消对局时释放使用记录失败" }, requestId);
  }

  try {
    await db.collection(SESSION_COLLECTION).doc(sessionId).update({
      data: { status: "cancelled", updatedAt: now, finishedAt: now },
    });
  } catch (err) {
    return makeResponse(false, { code: "DB_ERROR", message: "取消对局失败" }, requestId);
  }

  return makeResponse(true, { status: "cancelled", sessionId }, requestId);
}

// ─── entry ───
exports.main = async (event, context) => {
  const { action } = event;
  const requestId = context.requestId || Date.now().toString();

  if (action === "listConfig") return listConfig(event, context);
  if (action === "startGame") return startGame(event, context);
  if (action === "submitSpeech") return submitSpeech(event, context);
  if (action === "submitVote") return submitVote(event, context);
  if (action === "getGame") return getGame(event, context);
  if (action === "listMyGames") return listMyGames(event, context);
  if (action === "cancelGame") return cancelGame(event, context);

  return makeResponse(false, { code: "UNKNOWN_ACTION", message: "未知 action: " + action }, requestId);
};
