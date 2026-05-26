const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

function makeResponse(ok, dataOrError, requestId) {
  if (ok) {
    return { ok: true, data: dataOrError || {}, requestId };
  }
  return { ok: false, error: dataOrError || { code: "UNKNOWN", message: "未知错误" }, requestId };
}

function getInternalToken() {
  return process.env.INTERNAL_API_SECRET || "";
}

function getInternalAuthError(event) {
  const token = getInternalToken();
  if (!token) {
    return { code: "INTERNAL_SECRET_NOT_CONFIGURED", message: "内部调用凭据未配置" };
  }
  if (event._internalToken !== token) {
    return { code: "FORBIDDEN", message: "内部接口，禁止直接调用" };
  }
  return null;
}

function resolveUsageActor(event) {
  const wxContext = cloud.getWXContext();
  const wxOpenid = wxContext.OPENID;

  if (event.userId || event._internalToken) {
    const authError = getInternalAuthError(event);
    if (authError) {
      return { ok: false, error: authError };
    }
    const userId = event.userId || wxOpenid;
    if (!userId) {
      return { ok: false, error: { code: "UNAUTHORIZED", message: "无法获取用户身份" } };
    }
    return { ok: true, userId, internal: true };
  }

  if (!wxOpenid) {
    return { ok: false, error: { code: "UNAUTHORIZED", message: "无法获取用户身份" } };
  }
  return { ok: true, userId: wxOpenid, internal: false };
}

async function listApps(event, context) {
  const requestId = context.requestId || Date.now().toString();

  try {
    const res = await db.collection("apps")
      .where({
        status: _.in(["active", "coming_soon"]),
      })
      .orderBy("sortOrder", "asc")
      .get();

    const apps = (res.data || []).map((app) => ({
      appKey: app.appKey,
      name: app.name,
      description: app.description || "",
      entryPage: app.entryPage || "",
      cloudFunctionName: app.cloudFunctionName || "",
      status: app.status,
      pricing: app.pricing || null,
      sortOrder: app.sortOrder || 0,
      icon: app.icon || null,
    }));

    return makeResponse(true, { apps, total: apps.length }, requestId);
  } catch (err) {
    if (err.message && err.message.includes("collection not exists")) {
      return makeResponse(false, { code: "MISSING_COLLECTION", message: "apps 集合不存在，请先创建集合" }, requestId);
    }
    return makeResponse(false, { code: "DB_ERROR", message: "查询应用列表失败: " + err.message }, requestId);
  }
}

async function getAppDetail(event, context) {
  const requestId = context.requestId || Date.now().toString();
  const { appKey } = event;

  if (!appKey) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "缺少 appKey" }, requestId);
  }

  try {
    const res = await db.collection("apps").where({ appKey }).get();
    const app = res.data[0] || null;

    if (!app) {
      return makeResponse(false, { code: "APP_NOT_FOUND", message: "应用不存在" }, requestId);
    }

    return makeResponse(true, {
      app: {
        appKey: app.appKey,
        name: app.name,
        description: app.description || "",
        entryPage: app.entryPage || "",
        cloudFunctionName: app.cloudFunctionName || "",
        status: app.status,
        pricing: app.pricing || null,
        sortOrder: app.sortOrder || 0,
        icon: app.icon || null,
      },
    }, requestId);
  } catch (err) {
    if (err.message && err.message.includes("collection not exists")) {
      return makeResponse(false, { code: "MISSING_COLLECTION", message: "apps 集合不存在，请先创建集合" }, requestId);
    }
    return makeResponse(false, { code: "DB_ERROR", message: "查询应用详情失败: " + err.message }, requestId);
  }
}

async function createUsage(event, context) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const requestId = context.requestId || Date.now().toString();
  const { appKey, inputSummary } = event;

  if (!openid) {
    return makeResponse(false, { code: "UNAUTHORIZED", message: "无法获取用户身份" }, requestId);
  }
  if (!appKey) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "缺少 appKey" }, requestId);
  }

  // 查询应用
  let app;
  try {
    const appRes = await db.collection("apps").where({ appKey }).get();
    app = appRes.data[0] || null;
  } catch (err) {
    return makeResponse(false, { code: "DB_ERROR", message: "查询应用失败: " + err.message }, requestId);
  }

  if (!app) {
    return makeResponse(false, { code: "APP_NOT_FOUND", message: "应用不存在" }, requestId);
  }
  if (app.status !== "active") {
    return makeResponse(false, { code: "APP_NOT_ACTIVE", message: "应用未激活" }, requestId);
  }

  const costPoints = app.pricing && app.pricing.mode === "fixed" ? (app.pricing.costPoints || 0) : 0;

  const now = new Date();

  // 先创建使用记录，再用 usageId 作为幂等键冻结积分，避免冻结成功后记录创建失败。
  let usageId;
  try {
    const usageRes = await db.collection("app_usage_records").add({
      data: {
        userId: openid,
        appKey,
        status: "created",
        costPoints,
        freezeTransactionId: null,
        settleTransactionId: null,
        releaseTransactionId: null,
        inputSummary: inputSummary || null,
        resultRef: null,
        errorCode: null,
        errorMessage: null,
        startedAt: now,
        updatedAt: now,
        finishedAt: null,
      },
    });
    usageId = usageRes._id;
  } catch (err) {
    return makeResponse(false, { code: "DB_ERROR", message: "创建使用记录失败: " + err.message }, requestId);
  }

  // 冻结积分（若需要）
  let freezeTransactionId = null;
  if (costPoints > 0) {
    const token = getInternalToken();
    if (!token) {
      await db.collection("app_usage_records").doc(usageId).update({
        data: {
          status: "failed",
          errorCode: "INTERNAL_SECRET_NOT_CONFIGURED",
          errorMessage: "内部调用凭据未配置",
          updatedAt: new Date(),
          finishedAt: new Date(),
        },
      });
      return makeResponse(false, { code: "INTERNAL_SECRET_NOT_CONFIGURED", message: "内部调用凭据未配置" }, requestId);
    }

    try {
      const freezeRes = await cloud.callFunction({
        name: "corePoints",
        data: {
          action: "freezePoints",
          _internalToken: token,
          userId: openid,
          costPoints,
          relatedAppKey: appKey,
          relatedUsageId: usageId,
          idempotencyKey: `freeze_${usageId}`,
        },
      });
      const freezeResult = freezeRes.result;
      if (!freezeResult || !freezeResult.ok) {
        const errCode = freezeResult && freezeResult.error ? freezeResult.error.code : "FREEZE_FAILED";
        const errMsg = freezeResult && freezeResult.error ? freezeResult.error.message : "冻结积分失败";
        await db.collection("app_usage_records").doc(usageId).update({
          data: {
            status: "failed",
            errorCode: errCode,
            errorMessage: errMsg,
            updatedAt: new Date(),
            finishedAt: new Date(),
          },
        });
        return makeResponse(false, { code: errCode, message: errMsg }, requestId);
      }
      freezeTransactionId = freezeResult.data.transactionId;
    } catch (err) {
      await db.collection("app_usage_records").doc(usageId).update({
        data: {
          status: "failed",
          errorCode: "FREEZE_FAILED",
          errorMessage: "冻结积分调用失败: " + err.message,
          updatedAt: new Date(),
          finishedAt: new Date(),
        },
      });
      return makeResponse(false, { code: "FREEZE_FAILED", message: "冻结积分调用失败: " + err.message }, requestId);
    }

    try {
      await db.collection("app_usage_records").doc(usageId).update({
        data: {
          status: "frozen",
          freezeTransactionId,
          updatedAt: new Date(),
        },
      });
    } catch (err) {
      await cloud.callFunction({
        name: "corePoints",
        data: {
          action: "releaseFrozenPoints",
          _internalToken: token,
          userId: openid,
          costPoints,
          relatedAppKey: appKey,
          relatedUsageId: usageId,
          idempotencyKey: `release_${usageId}_rollback`,
        },
      });
      await db.collection("app_usage_records").doc(usageId).update({
        data: {
          status: "released",
          releaseTransactionId: null,
          errorCode: "USAGE_UPDATE_FAILED",
          errorMessage: "冻结后更新使用记录失败，已尝试释放积分",
          updatedAt: new Date(),
          finishedAt: new Date(),
        },
      });
      return makeResponse(false, { code: "DB_ERROR", message: "冻结后更新使用记录失败: " + err.message }, requestId);
    }
  }

  return makeResponse(true, { usageId, appKey, costPoints, status: costPoints > 0 ? "frozen" : "created" }, requestId);
}

async function finishUsage(event, context) {
  const requestId = context.requestId || Date.now().toString();
  const { usageId, resultRef } = event;
  const actor = resolveUsageActor(event);

  if (!actor.ok) {
    return makeResponse(false, actor.error, requestId);
  }
  if (!usageId) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "缺少 usageId" }, requestId);
  }

  // 查询 usage
  let usage;
  try {
    const usageRes = await db.collection("app_usage_records").doc(usageId).get();
    usage = usageRes.data || null;
  } catch (err) {
    return makeResponse(false, { code: "DB_ERROR", message: "查询使用记录失败: " + err.message }, requestId);
  }

  if (!usage) {
    return makeResponse(false, { code: "USAGE_NOT_FOUND", message: "使用记录不存在" }, requestId);
  }
  if (usage.userId !== actor.userId) {
    return makeResponse(false, { code: "FORBIDDEN", message: "无权操作该使用记录" }, requestId);
  }

  // 幂等：已结算
  if (usage.status === "succeeded") {
    return makeResponse(false, { code: "USAGE_ALREADY_FINISHED", message: "使用记录已结算" }, requestId);
  }
  if (usage.status === "failed" || usage.status === "released") {
    return makeResponse(false, { code: "USAGE_ALREADY_FAILED", message: "使用记录已失败/释放" }, requestId);
  }
  if (usage.status !== "frozen" && usage.status !== "created") {
    return makeResponse(false, { code: "INVALID_STATUS", message: "使用记录状态不可结算" }, requestId);
  }

  // 无需扣费时直接成功
  if (usage.costPoints <= 0) {
    const now = new Date();
    try {
      await db.collection("app_usage_records").doc(usageId).update({
        data: {
          status: "succeeded",
          resultRef: resultRef || null,
          updatedAt: now,
          finishedAt: now,
        },
      });
    } catch (err) {
      return makeResponse(false, { code: "DB_ERROR", message: "更新使用记录失败: " + err.message }, requestId);
    }
    return makeResponse(true, { usageId, status: "succeeded" }, requestId);
  }

  // 结算冻结积分
  let settleTransactionId = null;
  try {
    const settleRes = await cloud.callFunction({
      name: "corePoints",
      data: {
        action: "settleFrozenPoints",
        _internalToken: getInternalToken(),
        userId: usage.userId,
        costPoints: usage.costPoints,
        relatedAppKey: usage.appKey,
        relatedUsageId: usageId,
        idempotencyKey: `settle_${usageId}`,
      },
    });
    const settleResult = settleRes.result;
    if (!settleResult || !settleResult.ok) {
      const errCode = settleResult && settleResult.error ? settleResult.error.code : "SETTLE_FAILED";
      const errMsg = settleResult && settleResult.error ? settleResult.error.message : "结算积分失败";
      return makeResponse(false, { code: errCode, message: errMsg }, requestId);
    }
    settleTransactionId = settleResult.data.transactionId;
  } catch (err) {
    return makeResponse(false, { code: "SETTLE_FAILED", message: "结算积分调用失败: " + err.message }, requestId);
  }

  // 更新使用记录
  const now = new Date();
  try {
    await db.collection("app_usage_records").doc(usageId).update({
      data: {
        status: "succeeded",
        settleTransactionId,
        resultRef: resultRef || null,
        updatedAt: now,
        finishedAt: now,
      },
    });
  } catch (err) {
    return makeResponse(false, { code: "DB_ERROR", message: "更新使用记录失败: " + err.message }, requestId);
  }

  return makeResponse(true, { usageId, status: "succeeded", settleTransactionId }, requestId);
}

async function failUsage(event, context) {
  const requestId = context.requestId || Date.now().toString();
  const { usageId, errorCode, errorMessage } = event;
  const actor = resolveUsageActor(event);

  if (!actor.ok) {
    return makeResponse(false, actor.error, requestId);
  }
  if (!usageId) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "缺少 usageId" }, requestId);
  }

  // 查询 usage
  let usage;
  try {
    const usageRes = await db.collection("app_usage_records").doc(usageId).get();
    usage = usageRes.data || null;
  } catch (err) {
    return makeResponse(false, { code: "DB_ERROR", message: "查询使用记录失败: " + err.message }, requestId);
  }

  if (!usage) {
    return makeResponse(false, { code: "USAGE_NOT_FOUND", message: "使用记录不存在" }, requestId);
  }
  if (usage.userId !== actor.userId) {
    return makeResponse(false, { code: "FORBIDDEN", message: "无权操作该使用记录" }, requestId);
  }

  // 幂等：已失败/释放
  if (usage.status === "failed" || usage.status === "released") {
    return makeResponse(false, { code: "USAGE_ALREADY_FAILED", message: "使用记录已失败/释放" }, requestId);
  }
  if (usage.status === "succeeded") {
    return makeResponse(false, { code: "USAGE_ALREADY_FINISHED", message: "使用记录已结算，不能改为失败" }, requestId);
  }
  if (usage.status !== "frozen" && usage.status !== "created") {
    return makeResponse(false, { code: "INVALID_STATUS", message: "使用记录状态不可释放" }, requestId);
  }

  // 无需扣费时直接失败
  if (usage.costPoints <= 0) {
    const now = new Date();
    try {
      await db.collection("app_usage_records").doc(usageId).update({
        data: {
          status: "failed",
          errorCode: errorCode || null,
          errorMessage: errorMessage || null,
          updatedAt: now,
          finishedAt: now,
        },
      });
    } catch (err) {
      return makeResponse(false, { code: "DB_ERROR", message: "更新使用记录失败: " + err.message }, requestId);
    }
    return makeResponse(true, { usageId, status: "failed" }, requestId);
  }

  // 释放冻结积分
  let releaseTransactionId = null;
  try {
    const releaseRes = await cloud.callFunction({
      name: "corePoints",
      data: {
        action: "releaseFrozenPoints",
        _internalToken: getInternalToken(),
        userId: usage.userId,
        costPoints: usage.costPoints,
        relatedAppKey: usage.appKey,
        relatedUsageId: usageId,
        idempotencyKey: `release_${usageId}`,
      },
    });
    const releaseResult = releaseRes.result;
    if (!releaseResult || !releaseResult.ok) {
      const errCode = releaseResult && releaseResult.error ? releaseResult.error.code : "RELEASE_FAILED";
      const errMsg = releaseResult && releaseResult.error ? releaseResult.error.message : "释放积分失败";
      return makeResponse(false, { code: errCode, message: errMsg }, requestId);
    }
    releaseTransactionId = releaseResult.data.transactionId;
  } catch (err) {
    return makeResponse(false, { code: "RELEASE_FAILED", message: "释放积分调用失败: " + err.message }, requestId);
  }

  // 更新使用记录
  const now = new Date();
  try {
    await db.collection("app_usage_records").doc(usageId).update({
      data: {
        status: "released",
        releaseTransactionId,
        errorCode: errorCode || null,
        errorMessage: errorMessage || null,
        updatedAt: now,
        finishedAt: now,
      },
    });
  } catch (err) {
    return makeResponse(false, { code: "DB_ERROR", message: "更新使用记录失败: " + err.message }, requestId);
  }

  return makeResponse(true, { usageId, status: "released", releaseTransactionId }, requestId);
}

async function listUsageRecords(event, context) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const requestId = context.requestId || Date.now().toString();
  const { page = 1, pageSize = 20 } = event;

  if (!openid) {
    return makeResponse(false, { code: "UNAUTHORIZED", message: "无法获取用户身份" }, requestId);
  }

  const limit = Math.min(Math.max(pageSize, 1), 100);
  const skip = Math.max((page - 1) * limit, 0);

  try {
    const res = await db.collection("app_usage_records")
      .where({ userId: openid })
      .orderBy("startedAt", "desc")
      .skip(skip)
      .limit(limit)
      .get();

    const totalRes = await db.collection("app_usage_records")
      .where({ userId: openid })
      .count();

    const list = (res.data || []).map((item) => ({
      _id: item._id,
      appKey: item.appKey,
      status: item.status,
      costPoints: item.costPoints,
      inputSummary: item.inputSummary,
      resultRef: item.resultRef,
      errorCode: item.errorCode,
      errorMessage: item.errorMessage,
      startedAt: item.startedAt,
      finishedAt: item.finishedAt,
    }));

    return makeResponse(true, {
      list,
      total: totalRes.total || 0,
      page,
      pageSize: limit,
    }, requestId);
  } catch (err) {
    if (err.message && err.message.includes("collection not exists")) {
      return makeResponse(false, { code: "MISSING_COLLECTION", message: "app_usage_records 集合不存在" }, requestId);
    }
    return makeResponse(false, { code: "DB_ERROR", message: "查询使用记录失败: " + err.message }, requestId);
  }
}

exports.main = async (event, context) => {
  const { action } = event;
  const requestId = context.requestId || Date.now().toString();

  if (action === "listApps") {
    return listApps(event, context);
  }
  if (action === "getAppDetail") {
    return getAppDetail(event, context);
  }
  if (action === "createUsage") {
    return createUsage(event, context);
  }
  if (action === "finishUsage") {
    return finishUsage(event, context);
  }
  if (action === "failUsage") {
    return failUsage(event, context);
  }
  if (action === "listUsageRecords") {
    return listUsageRecords(event, context);
  }

  return makeResponse(false, { code: "UNKNOWN_ACTION", message: "未知 action: " + action }, requestId);
};
