const cloud = require("wx-server-sdk");
const crypto = require("crypto");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

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

function resolveTargetUserId(event, fallbackOpenid) {
  return event.userId || fallbackOpenid || "";
}

function makeCodedError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function isPositiveInteger(value) {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isNonZeroInteger(value) {
  return typeof value === "number" && Number.isInteger(value) && value !== 0;
}

function getTransactionDocId(idempotencyKey) {
  const digest = crypto.createHash("sha256").update(String(idempotencyKey)).digest("hex");
  return `pt_${digest}`;
}

function transactionResultFromDoc(transactionDoc) {
  return {
    transactionId: transactionDoc._id,
    availableAfter: transactionDoc.availableAfter,
    frozenAfter: transactionDoc.frozenAfter,
    alreadyExists: true,
  };
}

async function runPointMutation(userId, idempotencyKey, mutate) {
  return db.runTransaction(async (transaction) => {
    const transactionDocId = getTransactionDocId(idempotencyKey);

    try {
      const docExist = await transaction.collection("point_transactions").doc(transactionDocId).get();
      if (docExist.data) {
        return transactionResultFromDoc(docExist.data);
      }
    } catch (err) {
      // 文档不存在时继续；兼容历史自动 _id 流水，下面再按 idempotencyKey 查询。
    }

    const exist = await transaction.collection("point_transactions")
      .where({ idempotencyKey })
      .limit(1)
      .get();
    if (exist.data.length > 0) {
      return transactionResultFromDoc(exist.data[0]);
    }

    const accountRes = await transaction.collection("point_accounts")
      .where({ userId })
      .limit(1)
      .get();
    const account = accountRes.data[0] || null;
    if (!account) {
      throw makeCodedError("ACCOUNT_NOT_FOUND", "积分账户不存在");
    }

    const normalizedAccount = {
      ...account,
      availablePoints: Number(account.availablePoints) || 0,
      frozenPoints: Number(account.frozenPoints) || 0,
      totalRechargedPoints: Number(account.totalRechargedPoints) || 0,
      totalConsumedPoints: Number(account.totalConsumedPoints) || 0,
    };

    const now = new Date();
    const result = mutate(normalizedAccount, now);

    await transaction.collection("point_accounts").doc(account._id).update({
      data: result.accountUpdate,
    });

    const transRes = await transaction.collection("point_transactions").add({
      data: {
        _id: transactionDocId,
        ...result.transactionData,
      },
    });

    return {
      transactionId: transRes._id || transactionDocId,
      availableAfter: result.transactionData.availableAfter,
      frozenAfter: result.transactionData.frozenAfter,
      alreadyExists: false,
    };
  });
}

function mutationErrorResponse(err, fallbackCode, fallbackMessage, requestId) {
  if (err && typeof err.code === "string") {
    return makeResponse(false, { code: err.code, message: err.message }, requestId);
  }
  const message = err && err.message ? err.message : "未知错误";
  return makeResponse(false, { code: fallbackCode, message: fallbackMessage + ": " + message }, requestId);
}

async function getBalance(event, context) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const requestId = context.requestId || Date.now().toString();

  if (!openid) {
    return makeResponse(false, { code: "UNAUTHORIZED", message: "无法获取用户身份" }, requestId);
  }

  try {
    const res = await db.collection("point_accounts").where({ userId: openid }).get();
    const account = res.data[0] || null;
    return makeResponse(true, {
      availablePoints: account ? account.availablePoints : 0,
      frozenPoints: account ? account.frozenPoints : 0,
      totalRechargedPoints: account ? account.totalRechargedPoints : 0,
      totalConsumedPoints: account ? account.totalConsumedPoints : 0,
    }, requestId);
  } catch (err) {
    return makeResponse(false, { code: "DB_ERROR", message: "查询余额失败: " + err.message }, requestId);
  }
}

async function listTransactions(event, context) {
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
    const res = await db.collection("point_transactions")
      .where({ userId: openid })
      .orderBy("createdAt", "desc")
      .skip(skip)
      .limit(limit)
      .get();

    const totalRes = await db.collection("point_transactions")
      .where({ userId: openid })
      .count();

    return makeResponse(true, {
      list: res.data || [],
      total: totalRes.total || 0,
      page,
      pageSize: limit,
    }, requestId);
  } catch (err) {
    return makeResponse(false, { code: "DB_ERROR", message: "查询流水失败: " + err.message }, requestId);
  }
}

// 内部 helper：冻结积分（仅供其他云函数调用，需 _internalToken）
async function freezePoints(event, context) {
  const wxContext = cloud.getWXContext();
  const openid = resolveTargetUserId(event, wxContext.OPENID);
  const requestId = context.requestId || Date.now().toString();
  const { costPoints, relatedAppKey, relatedUsageId, idempotencyKey } = event;

  const authError = getInternalAuthError(event);
  if (authError) {
    return makeResponse(false, authError, requestId);
  }
  if (!openid) {
    return makeResponse(false, { code: "UNAUTHORIZED", message: "无法获取用户身份" }, requestId);
  }
  if (!isPositiveInteger(costPoints)) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "积分数量无效" }, requestId);
  }
  if (!idempotencyKey) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "缺少幂等键" }, requestId);
  }

  // 幂等检查
  try {
    const exist = await db.collection("point_transactions").where({ idempotencyKey }).get();
    if (exist.data.length > 0) {
      return makeResponse(true, { transactionId: exist.data[0]._id, alreadyExists: true }, requestId);
    }
  } catch (err) {
    // 继续执行
  }

  try {
    const mutation = await runPointMutation(openid, idempotencyKey, (account, now) => {
      if (account.availablePoints < costPoints) {
        throw makeCodedError("BALANCE_NOT_ENOUGH", "余额不足");
      }
      const availableAfter = account.availablePoints - costPoints;
      const frozenAfter = account.frozenPoints + costPoints;
      return {
        accountUpdate: {
          availablePoints: availableAfter,
          frozenPoints: frozenAfter,
          updatedAt: now,
        },
        transactionData: {
          userId: openid,
          type: "freeze",
          deltaAvailable: -costPoints,
          deltaFrozen: costPoints,
          availableAfter,
          frozenAfter,
          relatedAppKey: relatedAppKey || null,
          relatedOrderId: null,
          relatedUsageId: relatedUsageId || null,
          idempotencyKey,
          note: "冻结积分",
          createdAt: now,
        },
      };
    });
    return makeResponse(true, { transactionId: mutation.transactionId, alreadyExists: mutation.alreadyExists }, requestId);
  } catch (err) {
    return mutationErrorResponse(err, "DB_ERROR", "冻结积分失败", requestId);
  }
}

// 内部 helper：结算冻结积分（仅供其他云函数调用，需 _internalToken）
async function settleFrozenPoints(event, context) {
  const wxContext = cloud.getWXContext();
  const openid = resolveTargetUserId(event, wxContext.OPENID);
  const requestId = context.requestId || Date.now().toString();
  const { costPoints, relatedAppKey, relatedUsageId, idempotencyKey } = event;

  const authError = getInternalAuthError(event);
  if (authError) {
    return makeResponse(false, authError, requestId);
  }
  if (!openid) {
    return makeResponse(false, { code: "UNAUTHORIZED", message: "无法获取用户身份" }, requestId);
  }
  if (!isPositiveInteger(costPoints)) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "积分数量无效" }, requestId);
  }
  if (!idempotencyKey) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "缺少幂等键" }, requestId);
  }

  // 幂等检查
  try {
    const exist = await db.collection("point_transactions").where({ idempotencyKey }).get();
    if (exist.data.length > 0) {
      return makeResponse(true, { transactionId: exist.data[0]._id, alreadyExists: true }, requestId);
    }
  } catch (err) {
    // 继续执行
  }

  try {
    const mutation = await runPointMutation(openid, idempotencyKey, (account, now) => {
      if (account.frozenPoints < costPoints) {
        throw makeCodedError("FROZEN_NOT_ENOUGH", "冻结积分不足");
      }
      const frozenAfter = account.frozenPoints - costPoints;
      return {
        accountUpdate: {
          frozenPoints: frozenAfter,
          totalConsumedPoints: account.totalConsumedPoints + costPoints,
          updatedAt: now,
        },
        transactionData: {
          userId: openid,
          type: "settle",
          deltaAvailable: 0,
          deltaFrozen: -costPoints,
          availableAfter: account.availablePoints,
          frozenAfter,
          relatedAppKey: relatedAppKey || null,
          relatedOrderId: null,
          relatedUsageId: relatedUsageId || null,
          idempotencyKey,
          note: "结算冻结积分",
          createdAt: now,
        },
      };
    });
    return makeResponse(true, { transactionId: mutation.transactionId, alreadyExists: mutation.alreadyExists }, requestId);
  } catch (err) {
    return mutationErrorResponse(err, "DB_ERROR", "结算积分失败", requestId);
  }
}

// 内部 helper：释放冻结积分（仅供其他云函数调用，需 _internalToken）
async function releaseFrozenPoints(event, context) {
  const wxContext = cloud.getWXContext();
  const openid = resolveTargetUserId(event, wxContext.OPENID);
  const requestId = context.requestId || Date.now().toString();
  const { costPoints, relatedAppKey, relatedUsageId, idempotencyKey } = event;

  const authError = getInternalAuthError(event);
  if (authError) {
    return makeResponse(false, authError, requestId);
  }
  if (!openid) {
    return makeResponse(false, { code: "UNAUTHORIZED", message: "无法获取用户身份" }, requestId);
  }
  if (!isPositiveInteger(costPoints)) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "积分数量无效" }, requestId);
  }
  if (!idempotencyKey) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "缺少幂等键" }, requestId);
  }

  // 幂等检查
  try {
    const exist = await db.collection("point_transactions").where({ idempotencyKey }).get();
    if (exist.data.length > 0) {
      return makeResponse(true, { transactionId: exist.data[0]._id, alreadyExists: true }, requestId);
    }
  } catch (err) {
    // 继续执行
  }

  try {
    const mutation = await runPointMutation(openid, idempotencyKey, (account, now) => {
      if (account.frozenPoints < costPoints) {
        throw makeCodedError("FROZEN_NOT_ENOUGH", "冻结积分不足");
      }
      const availableAfter = account.availablePoints + costPoints;
      const frozenAfter = account.frozenPoints - costPoints;
      return {
        accountUpdate: {
          availablePoints: availableAfter,
          frozenPoints: frozenAfter,
          updatedAt: now,
        },
        transactionData: {
          userId: openid,
          type: "release",
          deltaAvailable: costPoints,
          deltaFrozen: -costPoints,
          availableAfter,
          frozenAfter,
          relatedAppKey: relatedAppKey || null,
          relatedOrderId: null,
          relatedUsageId: relatedUsageId || null,
          idempotencyKey,
          note: "释放冻结积分",
          createdAt: now,
        },
      };
    });
    return makeResponse(true, { transactionId: mutation.transactionId, alreadyExists: mutation.alreadyExists }, requestId);
  } catch (err) {
    return mutationErrorResponse(err, "DB_ERROR", "释放积分失败", requestId);
  }
}

// 内部 helper：充值到账（仅供其他云函数调用，需 _internalToken）
async function creditPoints(event, context) {
  const wxContext = cloud.getWXContext();
  const callerOpenid = wxContext.OPENID;
  const requestId = context.requestId || Date.now().toString();
  const { points, relatedOrderId, idempotencyKey, userId: targetUserId } = event;

  const authError = getInternalAuthError(event);
  if (authError) {
    return makeResponse(false, authError, requestId);
  }
  const openid = targetUserId || callerOpenid;
  if (!openid) {
    return makeResponse(false, { code: "UNAUTHORIZED", message: "无法获取用户身份" }, requestId);
  }
  if (!isPositiveInteger(points)) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "积分数量无效" }, requestId);
  }
  if (!idempotencyKey) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "缺少幂等键" }, requestId);
  }

  // 幂等检查
  try {
    const exist = await db.collection("point_transactions").where({ idempotencyKey }).get();
    if (exist.data.length > 0) {
      return makeResponse(true, { transactionId: exist.data[0]._id, alreadyExists: true }, requestId);
    }
  } catch (err) {
    // 继续执行
  }

  try {
    const mutation = await runPointMutation(openid, idempotencyKey, (account, now) => {
      const availableAfter = account.availablePoints + points;
      return {
        accountUpdate: {
          availablePoints: availableAfter,
          totalRechargedPoints: account.totalRechargedPoints + points,
          updatedAt: now,
        },
        transactionData: {
          userId: openid,
          type: "recharge",
          deltaAvailable: points,
          deltaFrozen: 0,
          availableAfter,
          frozenAfter: account.frozenPoints,
          relatedAppKey: null,
          relatedOrderId: relatedOrderId || null,
          relatedUsageId: null,
          idempotencyKey,
          note: "充值到账",
          createdAt: now,
        },
      };
    });
    return makeResponse(true, { transactionId: mutation.transactionId, alreadyExists: mutation.alreadyExists }, requestId);
  } catch (err) {
    return mutationErrorResponse(err, "DB_ERROR", "充值到账失败", requestId);
  }
}

// 管理员调整积分
async function adminAdjustPoints(event, context) {
  const requestId = context.requestId || Date.now().toString();
  const { targetUserId, deltaPoints, note, operatorOpenid } = event;

  const authError = getInternalAuthError(event);
  if (authError) {
    return makeResponse(false, authError, requestId);
  }

  if (!targetUserId) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "缺少目标用户" }, requestId);
  }
  if (!isNonZeroInteger(deltaPoints)) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "积分变动量无效" }, requestId);
  }

  const idempotencyKey = event.idempotencyKey || `admin_adjust_${requestId}`;

  // 幂等检查
  try {
    const exist = await db.collection("point_transactions").where({ idempotencyKey }).get();
    if (exist.data.length > 0) {
      return makeResponse(true, { transactionId: exist.data[0]._id, alreadyExists: true }, requestId);
    }
  } catch (err) {
    // 继续执行
  }

  try {
    const mutation = await runPointMutation(targetUserId, idempotencyKey, (account, now) => {
      if (deltaPoints < 0 && account.availablePoints + deltaPoints < 0) {
        throw makeCodedError("BALANCE_NOT_ENOUGH", "调整后余额不能为负");
      }
      const availableAfter = account.availablePoints + deltaPoints;
      return {
        accountUpdate: {
          availablePoints: availableAfter,
          updatedAt: now,
        },
        transactionData: {
          userId: targetUserId,
          type: "admin_adjust",
          deltaAvailable: deltaPoints,
          deltaFrozen: 0,
          availableAfter,
          frozenAfter: account.frozenPoints,
          relatedAppKey: null,
          relatedOrderId: null,
          relatedUsageId: null,
          idempotencyKey,
          note: note || "管理员调整积分",
          createdAt: now,
        },
      };
    });
    return makeResponse(true, {
      transactionId: mutation.transactionId,
      availableAfter: mutation.availableAfter,
      frozenAfter: mutation.frozenAfter,
      alreadyExists: mutation.alreadyExists,
    }, requestId);
  } catch (err) {
    return mutationErrorResponse(err, "DB_ERROR", "调整积分失败", requestId);
  }
}

exports.main = async (event, context) => {
  const { action } = event;
  const requestId = context.requestId || Date.now().toString();

  if (action === "getBalance") {
    return getBalance(event, context);
  }
  if (action === "listTransactions") {
    return listTransactions(event, context);
  }
  if (action === "freezePoints") {
    return freezePoints(event, context);
  }
  if (action === "settleFrozenPoints") {
    return settleFrozenPoints(event, context);
  }
  if (action === "releaseFrozenPoints") {
    return releaseFrozenPoints(event, context);
  }
  if (action === "creditPoints") {
    return creditPoints(event, context);
  }
  if (action === "adminAdjustPoints") {
    return adminAdjustPoints(event, context);
  }

  return makeResponse(false, { code: "UNKNOWN_ACTION", message: "未知 action: " + action }, requestId);
};
