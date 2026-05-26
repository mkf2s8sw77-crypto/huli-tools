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
  return process.env.INTERNAL_API_SECRET || "huli-tools-internal";
}

function checkInternalToken(event) {
  return event._internalToken === getInternalToken();
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
  const openid = wxContext.OPENID;
  const requestId = context.requestId || Date.now().toString();
  const { costPoints, relatedAppKey, relatedUsageId, idempotencyKey } = event;

  if (!checkInternalToken(event)) {
    return makeResponse(false, { code: "FORBIDDEN", message: "内部接口，禁止直接调用" }, requestId);
  }
  if (!openid) {
    return makeResponse(false, { code: "UNAUTHORIZED", message: "无法获取用户身份" }, requestId);
  }
  if (!costPoints || costPoints <= 0) {
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

  const now = new Date();

  let account;
  try {
    const res = await db.collection("point_accounts").where({ userId: openid }).get();
    account = res.data[0] || null;
  } catch (err) {
    return makeResponse(false, { code: "DB_ERROR", message: "读取账户失败: " + err.message }, requestId);
  }

  if (!account) {
    return makeResponse(false, { code: "ACCOUNT_NOT_FOUND", message: "积分账户不存在" }, requestId);
  }

  if (account.availablePoints < costPoints) {
    return makeResponse(false, { code: "BALANCE_NOT_ENOUGH", message: "余额不足" }, requestId);
  }

  // 原子更新账户
  try {
    await db.collection("point_accounts").doc(account._id).update({
      data: {
        availablePoints: _.inc(-costPoints),
        frozenPoints: _.inc(costPoints),
        updatedAt: now,
      },
    });
  } catch (err) {
    return makeResponse(false, { code: "DB_ERROR", message: "冻结积分失败: " + err.message }, requestId);
  }

  // 写流水
  let transactionId;
  try {
    const transRes = await db.collection("point_transactions").add({
      data: {
        userId: openid,
        type: "freeze",
        deltaAvailable: -costPoints,
        deltaFrozen: costPoints,
        availableAfter: account.availablePoints - costPoints,
        frozenAfter: account.frozenPoints + costPoints,
        relatedAppKey: relatedAppKey || null,
        relatedOrderId: null,
        relatedUsageId: relatedUsageId || null,
        idempotencyKey,
        note: "冻结积分",
        createdAt: now,
      },
    });
    transactionId = transRes._id;
  } catch (err) {
    return makeResponse(false, { code: "DB_ERROR", message: "写流水失败: " + err.message }, requestId);
  }

  return makeResponse(true, { transactionId }, requestId);
}

// 内部 helper：结算冻结积分（仅供其他云函数调用，需 _internalToken）
async function settleFrozenPoints(event, context) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const requestId = context.requestId || Date.now().toString();
  const { costPoints, relatedAppKey, relatedUsageId, idempotencyKey } = event;

  if (!checkInternalToken(event)) {
    return makeResponse(false, { code: "FORBIDDEN", message: "内部接口，禁止直接调用" }, requestId);
  }
  if (!openid) {
    return makeResponse(false, { code: "UNAUTHORIZED", message: "无法获取用户身份" }, requestId);
  }
  if (!costPoints || costPoints <= 0) {
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

  const now = new Date();

  let account;
  try {
    const res = await db.collection("point_accounts").where({ userId: openid }).get();
    account = res.data[0] || null;
  } catch (err) {
    return makeResponse(false, { code: "DB_ERROR", message: "读取账户失败: " + err.message }, requestId);
  }

  if (!account) {
    return makeResponse(false, { code: "ACCOUNT_NOT_FOUND", message: "积分账户不存在" }, requestId);
  }

  if (account.frozenPoints < costPoints) {
    return makeResponse(false, { code: "FROZEN_NOT_ENOUGH", message: "冻结积分不足" }, requestId);
  }

  // 原子更新账户
  try {
    await db.collection("point_accounts").doc(account._id).update({
      data: {
        frozenPoints: _.inc(-costPoints),
        totalConsumedPoints: _.inc(costPoints),
        updatedAt: now,
      },
    });
  } catch (err) {
    return makeResponse(false, { code: "DB_ERROR", message: "结算积分失败: " + err.message }, requestId);
  }

  // 写流水
  let transactionId;
  try {
    const transRes = await db.collection("point_transactions").add({
      data: {
        userId: openid,
        type: "settle",
        deltaAvailable: 0,
        deltaFrozen: -costPoints,
        availableAfter: account.availablePoints,
        frozenAfter: account.frozenPoints - costPoints,
        relatedAppKey: relatedAppKey || null,
        relatedOrderId: null,
        relatedUsageId: relatedUsageId || null,
        idempotencyKey,
        note: "结算冻结积分",
        createdAt: now,
      },
    });
    transactionId = transRes._id;
  } catch (err) {
    return makeResponse(false, { code: "DB_ERROR", message: "写流水失败: " + err.message }, requestId);
  }

  return makeResponse(true, { transactionId }, requestId);
}

// 内部 helper：释放冻结积分（仅供其他云函数调用，需 _internalToken）
async function releaseFrozenPoints(event, context) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const requestId = context.requestId || Date.now().toString();
  const { costPoints, relatedAppKey, relatedUsageId, idempotencyKey } = event;

  if (!checkInternalToken(event)) {
    return makeResponse(false, { code: "FORBIDDEN", message: "内部接口，禁止直接调用" }, requestId);
  }
  if (!openid) {
    return makeResponse(false, { code: "UNAUTHORIZED", message: "无法获取用户身份" }, requestId);
  }
  if (!costPoints || costPoints <= 0) {
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

  const now = new Date();

  let account;
  try {
    const res = await db.collection("point_accounts").where({ userId: openid }).get();
    account = res.data[0] || null;
  } catch (err) {
    return makeResponse(false, { code: "DB_ERROR", message: "读取账户失败: " + err.message }, requestId);
  }

  if (!account) {
    return makeResponse(false, { code: "ACCOUNT_NOT_FOUND", message: "积分账户不存在" }, requestId);
  }

  if (account.frozenPoints < costPoints) {
    return makeResponse(false, { code: "FROZEN_NOT_ENOUGH", message: "冻结积分不足" }, requestId);
  }

  // 原子更新账户：恢复可用，减少冻结
  try {
    await db.collection("point_accounts").doc(account._id).update({
      data: {
        availablePoints: _.inc(costPoints),
        frozenPoints: _.inc(-costPoints),
        updatedAt: now,
      },
    });
  } catch (err) {
    return makeResponse(false, { code: "DB_ERROR", message: "释放积分失败: " + err.message }, requestId);
  }

  // 写流水
  let transactionId;
  try {
    const transRes = await db.collection("point_transactions").add({
      data: {
        userId: openid,
        type: "release",
        deltaAvailable: costPoints,
        deltaFrozen: -costPoints,
        availableAfter: account.availablePoints + costPoints,
        frozenAfter: account.frozenPoints - costPoints,
        relatedAppKey: relatedAppKey || null,
        relatedOrderId: null,
        relatedUsageId: relatedUsageId || null,
        idempotencyKey,
        note: "释放冻结积分",
        createdAt: now,
      },
    });
    transactionId = transRes._id;
  } catch (err) {
    return makeResponse(false, { code: "DB_ERROR", message: "写流水失败: " + err.message }, requestId);
  }

  return makeResponse(true, { transactionId }, requestId);
}

// 内部 helper：充值到账（仅供其他云函数调用，需 _internalToken）
async function creditPoints(event, context) {
  const wxContext = cloud.getWXContext();
  const callerOpenid = wxContext.OPENID;
  const requestId = context.requestId || Date.now().toString();
  const { points, relatedOrderId, idempotencyKey, userId: targetUserId } = event;

  if (!checkInternalToken(event)) {
    return makeResponse(false, { code: "FORBIDDEN", message: "内部接口，禁止直接调用" }, requestId);
  }
  const openid = targetUserId || callerOpenid;
  if (!openid) {
    return makeResponse(false, { code: "UNAUTHORIZED", message: "无法获取用户身份" }, requestId);
  }
  if (!points || points <= 0) {
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

  const now = new Date();

  let account;
  try {
    const res = await db.collection("point_accounts").where({ userId: openid }).get();
    account = res.data[0] || null;
  } catch (err) {
    return makeResponse(false, { code: "DB_ERROR", message: "读取账户失败: " + err.message }, requestId);
  }

  if (!account) {
    return makeResponse(false, { code: "ACCOUNT_NOT_FOUND", message: "积分账户不存在" }, requestId);
  }

  // 原子更新账户
  try {
    await db.collection("point_accounts").doc(account._id).update({
      data: {
        availablePoints: _.inc(points),
        totalRechargedPoints: _.inc(points),
        updatedAt: now,
      },
    });
  } catch (err) {
    return makeResponse(false, { code: "DB_ERROR", message: "充值到账失败: " + err.message }, requestId);
  }

  // 写流水
  let transactionId;
  try {
    const transRes = await db.collection("point_transactions").add({
      data: {
        userId: openid,
        type: "recharge",
        deltaAvailable: points,
        deltaFrozen: 0,
        availableAfter: account.availablePoints + points,
        frozenAfter: account.frozenPoints,
        relatedAppKey: null,
        relatedOrderId: relatedOrderId || null,
        relatedUsageId: null,
        idempotencyKey,
        note: "充值到账",
        createdAt: now,
      },
    });
    transactionId = transRes._id;
  } catch (err) {
    return makeResponse(false, { code: "DB_ERROR", message: "写流水失败: " + err.message }, requestId);
  }

  return makeResponse(true, { transactionId }, requestId);
}

// 管理员调整积分
async function adminAdjustPoints(event, context) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const requestId = context.requestId || Date.now().toString();
  const { targetUserId, deltaPoints, note } = event;

  if (!openid) {
    return makeResponse(false, { code: "UNAUTHORIZED", message: "无法获取用户身份" }, requestId);
  }

  const adminOpenids = (process.env.ADMIN_OPENIDS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (adminOpenids.length === 0) {
    return makeResponse(false, { code: "ADMIN_NOT_CONFIGURED", message: "管理员未配置" }, requestId);
  }
  if (!adminOpenids.includes(openid)) {
    return makeResponse(false, { code: "FORBIDDEN", message: "无权访问管理接口" }, requestId);
  }

  if (!targetUserId) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "缺少目标用户" }, requestId);
  }
  if (typeof deltaPoints !== "number" || deltaPoints === 0) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "积分变动量无效" }, requestId);
  }

  const idempotencyKey = event.idempotencyKey || `admin_adjust_${openid}_${targetUserId}_${deltaPoints}_${Date.now()}`;

  // 幂等检查
  try {
    const exist = await db.collection("point_transactions").where({ idempotencyKey }).get();
    if (exist.data.length > 0) {
      return makeResponse(true, { transactionId: exist.data[0]._id, alreadyExists: true }, requestId);
    }
  } catch (err) {
    // 继续执行
  }

  const now = new Date();

  let account;
  try {
    const res = await db.collection("point_accounts").where({ userId: targetUserId }).get();
    account = res.data[0] || null;
  } catch (err) {
    return makeResponse(false, { code: "DB_ERROR", message: "读取账户失败: " + err.message }, requestId);
  }

  if (!account) {
    return makeResponse(false, { code: "ACCOUNT_NOT_FOUND", message: "目标用户积分账户不存在" }, requestId);
  }

  if (deltaPoints < 0 && account.availablePoints + deltaPoints < 0) {
    return makeResponse(false, { code: "BALANCE_NOT_ENOUGH", message: "调整后余额不能为负" }, requestId);
  }

  // 原子更新账户
  try {
    await db.collection("point_accounts").doc(account._id).update({
      data: {
        availablePoints: _.inc(deltaPoints),
        updatedAt: now,
      },
    });
  } catch (err) {
    return makeResponse(false, { code: "DB_ERROR", message: "调整积分失败: " + err.message }, requestId);
  }

  // 写流水
  let transactionId;
  try {
    const transRes = await db.collection("point_transactions").add({
      data: {
        userId: targetUserId,
        type: "admin_adjust",
        deltaAvailable: deltaPoints,
        deltaFrozen: 0,
        availableAfter: account.availablePoints + deltaPoints,
        frozenAfter: account.frozenPoints,
        relatedAppKey: null,
        relatedOrderId: null,
        relatedUsageId: null,
        idempotencyKey,
        note: note || "管理员调整积分",
        createdAt: now,
      },
    });
    transactionId = transRes._id;
  } catch (err) {
    return makeResponse(false, { code: "DB_ERROR", message: "写流水失败: " + err.message }, requestId);
  }

  return makeResponse(true, {
    transactionId,
    availableAfter: account.availablePoints + deltaPoints,
    frozenAfter: account.frozenPoints,
  }, requestId);
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
