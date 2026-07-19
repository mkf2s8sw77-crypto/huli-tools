const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
let cachedCloudBaseAuth;
const WEB_ADMIN_CONFIG_KEY = "admin_web_auto_admins";

function makeResponse(ok, dataOrError, requestId) {
  if (ok) {
    return { ok: true, data: dataOrError || {}, requestId };
  }
  return { ok: false, error: dataOrError || { code: "UNKNOWN", message: "未知错误" }, requestId };
}

function getAdminOpenids() {
  const raw = process.env.ADMIN_OPENIDS || "";
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function getAdminWebUids() {
  const raw = process.env.ADMIN_WEB_UIDS || "";
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

async function getPersistedWebAdmins() {
  try {
    const res = await db.collection("system_configs")
      .where({ key: WEB_ADMIN_CONFIG_KEY })
      .get();
    const admins = [];
    for (const item of res.data || []) {
      if (Array.isArray(item.value)) {
        admins.push(...item.value.filter((s) => typeof s === "string" && s.trim()));
      }
    }
    return [...new Set(admins)];
  } catch (err) {
    console.warn("读取持久化 Web 管理员失败:", err.message);
  }
  return [];
}

async function getAllWebAdminUids() {
  const envUids = getAdminWebUids();
  const persistedUids = await getPersistedWebAdmins();
  const combined = new Set([...envUids, ...persistedUids]);
  return [...combined];
}

function getInternalToken() {
  return process.env.INTERNAL_API_SECRET || "";
}

function getCurrentEnvId() {
  return process.env.TCB_ENV || process.env.SCF_NAMESPACE || cloud.DYNAMIC_CURRENT_ENV || "";
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getCloudBaseAuth() {
  if (cachedCloudBaseAuth !== undefined) return cachedCloudBaseAuth;

  try {
    const tcb = require("@cloudbase/node-sdk");
    const app = tcb.init({
      env: tcb.SYMBOL_DEFAULT_ENV || getCurrentEnvId(),
    });
    cachedCloudBaseAuth = app.auth();
  } catch (err) {
    console.warn("初始化 CloudBase Node SDK 失败:", err.message);
    cachedCloudBaseAuth = null;
  }

  return cachedCloudBaseAuth;
}

function getCloudBaseAuthUid() {
  const auth = getCloudBaseAuth();
  if (!auth || typeof auth.getUserInfo !== "function") return "";

  try {
    const userInfo = auth.getUserInfo() || {};
    return normalizeString(userInfo.uid);
  } catch (err) {
    console.warn("获取 CloudBase Auth 用户信息失败:", err.message);
    return "";
  }
}

function getContextUid(wxContext) {
  return normalizeString(wxContext.UID)
    || normalizeString(wxContext.UIN)
    || normalizeString(wxContext.TCB_UUID);
}

/**
 * 统一管理员身份解析，同时兼容小程序和 Web SDK 调用。
 * 返回 { ok, adminUserId, source, response }
 */
async function resolveAdminIdentity(wxContext, requestId) {
  const openid = normalizeString(wxContext.OPENID);
  const uid = getCloudBaseAuthUid() || getContextUid(wxContext);

  if (!openid && !uid) {
    return {
      ok: false,
      response: makeResponse(false, { code: "UNAUTHORIZED", message: "无法获取用户身份" }, requestId),
    };
  }

  const adminOpenids = getAdminOpenids();
  const adminWebUids = await getAllWebAdminUids();

  if (adminOpenids.length === 0 && adminWebUids.length === 0) {
    return {
      ok: false,
      response: makeResponse(false, { code: "ADMIN_NOT_CONFIGURED", message: "管理员未配置，请在云函数环境变量中设置 ADMIN_OPENIDS 或 ADMIN_WEB_UIDS" }, requestId),
    };
  }

  if (openid && adminOpenids.includes(openid)) {
    return { ok: true, adminUserId: openid, source: "miniProgram" };
  }

  if (uid && adminWebUids.includes(uid)) {
    return { ok: true, adminUserId: "web:" + uid, source: "web" };
  }

  return {
    ok: false,
    response: makeResponse(false, { code: "FORBIDDEN", message: "无权访问管理接口" }, requestId),
  };
}

// 兼容旧的 validateAdmin 签名，内部调用 resolveAdminIdentity
async function validateAdmin(wxContext, requestId) {
  const result = await resolveAdminIdentity(wxContext, requestId);
  if (!result.ok) {
    return { ok: false, response: result.response };
  }
  return { ok: true, openid: result.adminUserId, adminUserId: result.adminUserId, source: result.source };
}

async function writeAuditLog(adminUserId, action, targetCollection, targetId, beforeSummary, afterSummary, requestId) {
  try {
    await db.collection("admin_audit_logs").add({
      data: {
        adminUserId,
        action,
        targetCollection,
        targetId,
        beforeSummary: typeof beforeSummary === "string" ? beforeSummary : JSON.stringify(beforeSummary),
        afterSummary: typeof afterSummary === "string" ? afterSummary : JSON.stringify(afterSummary),
        requestId,
        createdAt: new Date(),
      },
    });
  } catch (err) {
    console.error("写审计日志失败:", err.message);
  }
}

function parsePagination(event) {
  const page = Math.max(parseInt(event.page) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(event.pageSize) || 20, 1), 100);
  const skip = (page - 1) * pageSize;
  return { page, pageSize, skip };
}

function parseTimeRange(event) {
  const result = {};
  if (event.startAt) {
    const d = new Date(event.startAt);
    if (isNaN(d.getTime())) return { error: "startAt 格式无效" };
    result.startAt = d;
  }
  if (event.endAt) {
    const d = new Date(event.endAt);
    if (isNaN(d.getTime())) return { error: "endAt 格式无效" };
    result.endAt = d;
  }
  return result;
}

function buildTimeCondition(timeRange) {
  if (timeRange.startAt && timeRange.endAt) {
    return _.gte(timeRange.startAt).and(_.lte(timeRange.endAt));
  }
  if (timeRange.startAt) return _.gte(timeRange.startAt);
  if (timeRange.endAt) return _.lte(timeRange.endAt);
  return null;
}

// 字段白名单过滤
function pickFields(obj, fields) {
  if (!obj) return obj;
  const result = {};
  for (const f of fields) {
    if (obj[f] !== undefined) result[f] = obj[f];
  }
  return result;
}

const USER_SAFE_FIELDS = ["_id", "openid", "unionid", "phoneNumber", "nickname", "avatarUrl", "roles", "status", "lastLoginAt", "createdAt", "updatedAt"];
const POINT_ACCOUNT_SAFE_FIELDS = ["_id", "userId", "availablePoints", "frozenPoints", "totalRechargedPoints", "totalConsumedPoints", "createdAt", "updatedAt"];
const POINT_TX_SAFE_FIELDS = ["_id", "userId", "type", "deltaAvailable", "deltaFrozen", "availableAfter", "frozenAfter", "relatedAppKey", "relatedOrderId", "relatedUsageId", "idempotencyKey", "note", "createdAt"];
const ORDER_SAFE_FIELDS = ["_id", "orderNo", "userId", "packageKey", "amountFen", "pointsTotal", "status", "provider", "providerTradeNo", "paidAt", "closedAt", "createdAt", "updatedAt"];
const USAGE_SAFE_FIELDS = ["_id", "userId", "appKey", "status", "costPoints", "freezeTransactionId", "settleTransactionId", "releaseTransactionId", "inputSummary", "resultRef", "errorCode", "errorMessage", "startedAt", "finishedAt"];
const APP_SAFE_FIELDS = ["_id", "appKey", "name", "description", "entryPage", "cloudFunctionName", "status", "pricing", "sortOrder", "icon", "createdAt", "updatedAt"];
const PACKAGE_SAFE_FIELDS = ["_id", "packageKey", "productId", "name", "amountFen", "basePoints", "bonusPoints", "status", "sortOrder", "createdAt", "updatedAt"];
const AUDIT_SAFE_FIELDS = ["_id", "adminUserId", "action", "targetCollection", "targetId", "beforeSummary", "afterSummary", "requestId", "createdAt"];

// ─── 只读 Action ──────────────────────────────────────────

async function getAdminMe(event, context) {
  const wxContext = cloud.getWXContext();
  const requestId = context.requestId || Date.now().toString();
  const identity = await resolveAdminIdentity(wxContext, requestId);
  if (!identity.ok) return identity.response;

  return makeResponse(true, {
    adminUserId: identity.adminUserId,
    source: identity.source,
    envId: getCurrentEnvId(),
  }, requestId);
}

async function dashboardSummary(event, context) {
  const wxContext = cloud.getWXContext();
  const requestId = context.requestId || Date.now().toString();
  const adminCheck = await validateAdmin(wxContext, requestId);
  if (!adminCheck.ok) return adminCheck.response;

  const summary = {};
  try {
    const usersCount = await db.collection("users").count();
    summary.totalUsers = usersCount.total || 0;
  } catch (err) {
    summary.totalUsers = 0;
  }

  try {
    const ordersCount = await db.collection("payment_orders").count();
    summary.totalOrders = ordersCount.total || 0;
  } catch (err) {
    summary.totalOrders = 0;
  }

  try {
    const accountsCount = await db.collection("point_accounts").count();
    summary.totalPointAccounts = accountsCount.total || 0;
  } catch (err) {
    summary.totalPointAccounts = 0;
  }

  try {
    const usageCount = await db.collection("app_usage_records").count();
    summary.totalUsageRecords = usageCount.total || 0;
  } catch (err) {
    summary.totalUsageRecords = 0;
  }

  try {
    const recentOrders = await db.collection("payment_orders")
      .orderBy("createdAt", "desc")
      .limit(5)
      .get();
    summary.recentOrders = (recentOrders.data || []).map((o) => pickFields(o, ORDER_SAFE_FIELDS));
  } catch (err) {
    summary.recentOrders = [];
  }

  try {
    const recentUsage = await db.collection("app_usage_records")
      .orderBy("startedAt", "desc")
      .limit(5)
      .get();
    summary.recentUsageRecords = (recentUsage.data || []).map((u) => pickFields(u, USAGE_SAFE_FIELDS));
  } catch (err) {
    summary.recentUsageRecords = [];
  }

  try {
    const recentAudit = await db.collection("admin_audit_logs")
      .orderBy("createdAt", "desc")
      .limit(5)
      .get();
    summary.recentAuditLogs = (recentAudit.data || []).map((a) => pickFields(a, AUDIT_SAFE_FIELDS));
  } catch (err) {
    summary.recentAuditLogs = [];
  }

  return makeResponse(true, summary, requestId);
}

async function listUsers(event, context) {
  const wxContext = cloud.getWXContext();
  const requestId = context.requestId || Date.now().toString();
  const adminCheck = await validateAdmin(wxContext, requestId);
  if (!adminCheck.ok) return adminCheck.response;

  const { page, pageSize, skip } = parsePagination(event);
  const { keyword } = event;

  try {
    let query = db.collection("users");
    if (keyword && typeof keyword === "string" && keyword.trim()) {
      const kw = keyword.trim();
      query = query.where(_.or([
        { openid: kw },
        { _id: kw },
        { nickname: db.RegExp({ regexp: kw, options: "i" }) },
      ]));
    }

    const totalRes = await query.count();
    const listRes = await query
      .orderBy("createdAt", "desc")
      .skip(skip)
      .limit(pageSize)
      .get();

    return makeResponse(true, {
      list: (listRes.data || []).map((u) => pickFields(u, USER_SAFE_FIELDS)),
      total: totalRes.total || 0,
      page,
      pageSize,
    }, requestId);
  } catch (err) {
    if (err.message && err.message.includes("collection not exists")) {
      return makeResponse(false, { code: "MISSING_COLLECTION", message: "users 集合不存在" }, requestId);
    }
    return makeResponse(false, { code: "DB_ERROR", message: "查询用户失败: " + err.message }, requestId);
  }
}

async function getUserDetail(event, context) {
  const wxContext = cloud.getWXContext();
  const requestId = context.requestId || Date.now().toString();
  const adminCheck = await validateAdmin(wxContext, requestId);
  if (!adminCheck.ok) return adminCheck.response;

  const { userId } = event;
  if (!userId || typeof userId !== "string") {
    return makeResponse(false, { code: "INVALID_PARAM", message: "缺少 userId" }, requestId);
  }

  const detail = {};

  try {
    const userRes = await db.collection("users").where({ _id: userId }).get();
    detail.user = userRes.data[0] ? pickFields(userRes.data[0], USER_SAFE_FIELDS) : null;
  } catch (err) {
    detail.user = null;
  }

  if (!detail.user) {
    try {
      const userRes = await db.collection("users").where({ openid: userId }).get();
      detail.user = userRes.data[0] ? pickFields(userRes.data[0], USER_SAFE_FIELDS) : null;
    } catch (err) {
      detail.user = null;
    }
  }

  if (!detail.user) {
    return makeResponse(false, { code: "NOT_FOUND", message: "用户不存在" }, requestId);
  }

  const actualUserId = detail.user._id || detail.user.openid;

  try {
    const accRes = await db.collection("point_accounts").where({ userId: actualUserId }).get();
    detail.pointAccount = accRes.data[0] ? pickFields(accRes.data[0], POINT_ACCOUNT_SAFE_FIELDS) : null;
  } catch (err) {
    detail.pointAccount = null;
  }

  try {
    const txRes = await db.collection("point_transactions")
      .where({ userId: actualUserId })
      .orderBy("createdAt", "desc")
      .limit(10)
      .get();
    detail.recentTransactions = (txRes.data || []).map((t) => pickFields(t, POINT_TX_SAFE_FIELDS));
  } catch (err) {
    detail.recentTransactions = [];
  }

  try {
    const orderRes = await db.collection("payment_orders")
      .where({ userId: actualUserId })
      .orderBy("createdAt", "desc")
      .limit(10)
      .get();
    detail.recentOrders = (orderRes.data || []).map((o) => pickFields(o, ORDER_SAFE_FIELDS));
  } catch (err) {
    detail.recentOrders = [];
  }

  try {
    const usageRes = await db.collection("app_usage_records")
      .where({ userId: actualUserId })
      .orderBy("startedAt", "desc")
      .limit(10)
      .get();
    detail.recentUsageRecords = (usageRes.data || []).map((u) => pickFields(u, USAGE_SAFE_FIELDS));
  } catch (err) {
    detail.recentUsageRecords = [];
  }

  return makeResponse(true, detail, requestId);
}

async function listPointTransactions(event, context) {
  const wxContext = cloud.getWXContext();
  const requestId = context.requestId || Date.now().toString();
  const adminCheck = await validateAdmin(wxContext, requestId);
  if (!adminCheck.ok) return adminCheck.response;

  const { page, pageSize, skip } = parsePagination(event);
  const timeRange = parseTimeRange(event);
  if (timeRange.error) {
    return makeResponse(false, { code: "INVALID_PARAM", message: timeRange.error }, requestId);
  }

  try {
    const where = {};
    if (event.userId) where.userId = event.userId;
    if (event.type) where.type = event.type;
    const timeCond = buildTimeCondition(timeRange);
    if (timeCond) where.createdAt = timeCond;

    let query = db.collection("point_transactions");
    if (Object.keys(where).length > 0) query = query.where(where);

    const totalRes = await query.count();
    const listRes = await query
      .orderBy("createdAt", "desc")
      .skip(skip)
      .limit(pageSize)
      .get();

    return makeResponse(true, {
      list: (listRes.data || []).map((t) => pickFields(t, POINT_TX_SAFE_FIELDS)),
      total: totalRes.total || 0,
      page,
      pageSize,
    }, requestId);
  } catch (err) {
    if (err.message && err.message.includes("collection not exists")) {
      return makeResponse(false, { code: "MISSING_COLLECTION", message: "point_transactions 集合不存在" }, requestId);
    }
    return makeResponse(false, { code: "DB_ERROR", message: "查询积分流水失败: " + err.message }, requestId);
  }
}

async function listOrders(event, context) {
  const wxContext = cloud.getWXContext();
  const requestId = context.requestId || Date.now().toString();
  const adminCheck = await validateAdmin(wxContext, requestId);
  if (!adminCheck.ok) return adminCheck.response;

  const { page, pageSize, skip } = parsePagination(event);
  const timeRange = parseTimeRange(event);
  if (timeRange.error) {
    return makeResponse(false, { code: "INVALID_PARAM", message: timeRange.error }, requestId);
  }

  try {
    const where = {};
    if (event.userId) where.userId = event.userId;
    if (event.orderNo) where.orderNo = event.orderNo;
    if (event.status) where.status = event.status;
    const timeCond2 = buildTimeCondition(timeRange);
    if (timeCond2) where.createdAt = timeCond2;

    let query = db.collection("payment_orders");
    if (Object.keys(where).length > 0) query = query.where(where);

    const totalRes = await query.count();
    const listRes = await query
      .orderBy("createdAt", "desc")
      .skip(skip)
      .limit(pageSize)
      .get();

    return makeResponse(true, {
      list: (listRes.data || []).map((o) => pickFields(o, ORDER_SAFE_FIELDS)),
      total: totalRes.total || 0,
      page,
      pageSize,
    }, requestId);
  } catch (err) {
    if (err.message && err.message.includes("collection not exists")) {
      return makeResponse(false, { code: "MISSING_COLLECTION", message: "payment_orders 集合不存在" }, requestId);
    }
    return makeResponse(false, { code: "DB_ERROR", message: "查询订单失败: " + err.message }, requestId);
  }
}

async function listUsageRecords(event, context) {
  const wxContext = cloud.getWXContext();
  const requestId = context.requestId || Date.now().toString();
  const adminCheck = await validateAdmin(wxContext, requestId);
  if (!adminCheck.ok) return adminCheck.response;

  const { page, pageSize, skip } = parsePagination(event);
  const timeRange = parseTimeRange(event);
  if (timeRange.error) {
    return makeResponse(false, { code: "INVALID_PARAM", message: timeRange.error }, requestId);
  }

  try {
    const where = {};
    if (event.userId) where.userId = event.userId;
    if (event.appKey) where.appKey = event.appKey;
    if (event.status) where.status = event.status;
    const timeCond3 = buildTimeCondition(timeRange);
    if (timeCond3) where.startedAt = timeCond3;

    let query = db.collection("app_usage_records");
    if (Object.keys(where).length > 0) query = query.where(where);

    const totalRes = await query.count();
    const listRes = await query
      .orderBy("startedAt", "desc")
      .skip(skip)
      .limit(pageSize)
      .get();

    return makeResponse(true, {
      list: (listRes.data || []).map((u) => pickFields(u, USAGE_SAFE_FIELDS)),
      total: totalRes.total || 0,
      page,
      pageSize,
    }, requestId);
  } catch (err) {
    if (err.message && err.message.includes("collection not exists")) {
      return makeResponse(false, { code: "MISSING_COLLECTION", message: "app_usage_records 集合不存在" }, requestId);
    }
    return makeResponse(false, { code: "DB_ERROR", message: "查询使用记录失败: " + err.message }, requestId);
  }
}

async function listApps(event, context) {
  const wxContext = cloud.getWXContext();
  const requestId = context.requestId || Date.now().toString();
  const adminCheck = await validateAdmin(wxContext, requestId);
  if (!adminCheck.ok) return adminCheck.response;

  const { page, pageSize, skip } = parsePagination(event);

  try {
    let query = db.collection("apps");
    const totalRes = await query.count();
    const listRes = await query
      .orderBy("sortOrder", "asc")
      .skip(skip)
      .limit(pageSize)
      .get();

    return makeResponse(true, {
      list: (listRes.data || []).map((a) => pickFields(a, APP_SAFE_FIELDS)),
      total: totalRes.total || 0,
      page,
      pageSize,
    }, requestId);
  } catch (err) {
    if (err.message && err.message.includes("collection not exists")) {
      return makeResponse(false, { code: "MISSING_COLLECTION", message: "apps 集合不存在" }, requestId);
    }
    return makeResponse(false, { code: "DB_ERROR", message: "查询应用失败: " + err.message }, requestId);
  }
}

async function listPackages(event, context) {
  const wxContext = cloud.getWXContext();
  const requestId = context.requestId || Date.now().toString();
  const adminCheck = await validateAdmin(wxContext, requestId);
  if (!adminCheck.ok) return adminCheck.response;

  const { page, pageSize, skip } = parsePagination(event);

  try {
    let query = db.collection("recharge_packages");
    const totalRes = await query.count();
    const listRes = await query
      .orderBy("sortOrder", "asc")
      .skip(skip)
      .limit(pageSize)
      .get();

    return makeResponse(true, {
      list: (listRes.data || []).map((p) => pickFields(p, PACKAGE_SAFE_FIELDS)),
      total: totalRes.total || 0,
      page,
      pageSize,
    }, requestId);
  } catch (err) {
    if (err.message && err.message.includes("collection not exists")) {
      return makeResponse(false, { code: "MISSING_COLLECTION", message: "recharge_packages 集合不存在" }, requestId);
    }
    return makeResponse(false, { code: "DB_ERROR", message: "查询充值包失败: " + err.message }, requestId);
  }
}

async function listAuditLogs(event, context) {
  const wxContext = cloud.getWXContext();
  const requestId = context.requestId || Date.now().toString();
  const adminCheck = await validateAdmin(wxContext, requestId);
  if (!adminCheck.ok) return adminCheck.response;

  const { page, pageSize, skip } = parsePagination(event);
  const timeRange = parseTimeRange(event);
  if (timeRange.error) {
    return makeResponse(false, { code: "INVALID_PARAM", message: timeRange.error }, requestId);
  }

  try {
    const where = {};
    if (event.adminUserId) where.adminUserId = event.adminUserId;
    if (event.actionFilter) where.action = event.actionFilter;
    const timeCond4 = buildTimeCondition(timeRange);
    if (timeCond4) where.createdAt = timeCond4;

    let query = db.collection("admin_audit_logs");
    if (Object.keys(where).length > 0) query = query.where(where);

    const totalRes = await query.count();
    const listRes = await query
      .orderBy("createdAt", "desc")
      .skip(skip)
      .limit(pageSize)
      .get();

    return makeResponse(true, {
      list: (listRes.data || []).map((a) => pickFields(a, AUDIT_SAFE_FIELDS)),
      total: totalRes.total || 0,
      page,
      pageSize,
    }, requestId);
  } catch (err) {
    if (err.message && err.message.includes("collection not exists")) {
      return makeResponse(false, { code: "MISSING_COLLECTION", message: "admin_audit_logs 集合不存在" }, requestId);
    }
    return makeResponse(false, { code: "DB_ERROR", message: "查询审计日志失败: " + err.message }, requestId);
  }
}

// ─── 写操作 Action ────────────────────────────────────────

async function checkCollectionsExist() {
  const required = [
    "users", "point_accounts", "point_transactions", "apps",
    "app_usage_records", "recharge_packages", "payment_orders",
    "admin_audit_logs", "system_configs", "app_ai_draw_tasks",
    "app_nursing_undercover_sessions",
  ];
  const missing = [];
  for (const name of required) {
    try {
      await db.collection(name).limit(1).get();
    } catch (err) {
      if (err.message && (err.message.includes("collection not exists") || err.errCode === -502005)) {
        missing.push(name);
      } else if (err.message && err.message.includes("permission")) {
        return { ok: false, code: "DB_PERMISSION_DENIED", missing: [name], all: required };
      } else {
        missing.push(name);
      }
    }
  }
  if (missing.length > 0) {
    return { ok: false, code: "MISSING_COLLECTION", missing, all: required };
  }
  return { ok: true };
}

async function adjustPoints(event, context) {
  const wxContext = cloud.getWXContext();
  const requestId = context.requestId || Date.now().toString();
  const { targetUserId, deltaPoints, note, idempotencyKey } = event;

  const adminCheck = await validateAdmin(wxContext, requestId);
  if (!adminCheck.ok) return adminCheck.response;
  const adminUserId = adminCheck.adminUserId;

  if (!targetUserId) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "缺少目标用户" }, requestId);
  }
  if (typeof deltaPoints !== "number" || deltaPoints === 0 || !Number.isInteger(deltaPoints)) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "积分变动量必须为整数且不能为0" }, requestId);
  }
  if (idempotencyKey && typeof idempotencyKey !== "string") {
    return makeResponse(false, { code: "INVALID_PARAM", message: "idempotencyKey 必须为字符串" }, requestId);
  }

  let beforeAccount = null;
  try {
    const res = await db.collection("point_accounts").where({ userId: targetUserId }).get();
    beforeAccount = res.data[0] || null;
  } catch (err) {
    // ignore
  }

  const token = getInternalToken();
  if (!token) {
    return makeResponse(false, { code: "INTERNAL_SECRET_NOT_CONFIGURED", message: "内部调用凭据未配置" }, requestId);
  }

  let adjustResult;
  try {
    const res = await cloud.callFunction({
      name: "corePoints",
      data: {
        action: "adminAdjustPoints",
        _internalToken: token,
        operatorOpenid: adminUserId,
        targetUserId,
        deltaPoints,
        note: note || "管理员调整",
        idempotencyKey: idempotencyKey || "admin_adjust_" + requestId,
      },
    });
    adjustResult = res.result;
    if (!adjustResult || !adjustResult.ok) {
      const errCode = adjustResult && adjustResult.error ? adjustResult.error.code : "ADJUST_FAILED";
      const errMsg = adjustResult && adjustResult.error ? adjustResult.error.message : "调整积分失败";
      return makeResponse(false, { code: errCode, message: errMsg }, requestId);
    }
  } catch (err) {
    return makeResponse(false, { code: "ADJUST_FAILED", message: "调整积分调用失败: " + err.message }, requestId);
  }

  await writeAuditLog(adminUserId, "adjustPoints", "point_accounts", targetUserId, {
    availablePointsBefore: beforeAccount ? beforeAccount.availablePoints : 0,
    frozenPointsBefore: beforeAccount ? beforeAccount.frozenPoints : 0,
    deltaPoints,
  }, {
    transactionId: adjustResult.data.transactionId,
    availableAfter: adjustResult.data.availableAfter,
    frozenAfter: adjustResult.data.frozenAfter,
  }, requestId);

  return makeResponse(true, {
    targetUserId,
    deltaPoints,
    transactionId: adjustResult.data.transactionId,
    availableAfter: adjustResult.data.availableAfter,
    frozenAfter: adjustResult.data.frozenAfter,
  }, requestId);
}

async function upsertApp(event, context) {
  const wxContext = cloud.getWXContext();
  const requestId = context.requestId || Date.now().toString();
  const { appKey, name, description, entryPage, cloudFunctionName, status, pricing, sortOrder } = event;

  const adminCheck = await validateAdmin(wxContext, requestId);
  if (!adminCheck.ok) return adminCheck.response;
  const adminUserId = adminCheck.adminUserId;

  if (!appKey || typeof appKey !== "string" || appKey.trim().length === 0) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "appKey 不能为空" }, requestId);
  }
  if (!entryPage || typeof entryPage !== "string" || entryPage.trim().length === 0) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "entryPage 不能为空" }, requestId);
  }
  const validStatuses = ["active", "disabled", "coming_soon"];
  if (!status || !validStatuses.includes(status)) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "status 必须是 active / disabled / coming_soon" }, requestId);
  }
  if (!pricing || pricing.mode !== "fixed" || typeof pricing.costPoints !== "number" || !Number.isInteger(pricing.costPoints) || pricing.costPoints < 0) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "pricing 格式无效：mode 必须为 fixed，costPoints 必须为非负整数" }, requestId);
  }

  const now = new Date();
  const trimmedAppKey = appKey.trim();

  let existing = null;
  try {
    const res = await db.collection("apps").where({ appKey: trimmedAppKey }).get();
    existing = res.data[0] || null;
  } catch (err) {
    return makeResponse(false, { code: "DB_ERROR", message: "查询应用失败: " + err.message }, requestId);
  }

  const appData = {
    appKey: trimmedAppKey,
    name: (name || "").trim(),
    description: (description || "").trim(),
    entryPage: entryPage.trim(),
    cloudFunctionName: (cloudFunctionName || "").trim(),
    status,
    pricing: { mode: "fixed", costPoints: pricing.costPoints },
    sortOrder: typeof sortOrder === "number" ? sortOrder : 0,
    updatedAt: now,
  };

  if (existing) {
    try {
      await db.collection("apps").doc(existing._id).update({ data: appData });
    } catch (err) {
      return makeResponse(false, { code: "DB_ERROR", message: "更新应用失败: " + err.message }, requestId);
    }
    await writeAuditLog(adminUserId, "upsertApp", "apps", trimmedAppKey, { existing: existing }, { updated: appData }, requestId);
    return makeResponse(true, { appKey: trimmedAppKey, operation: "update" }, requestId);
  }

  try {
    await db.collection("apps").add({ data: { ...appData, createdAt: now } });
  } catch (err) {
    return makeResponse(false, { code: "DB_ERROR", message: "创建应用失败: " + err.message }, requestId);
  }
  await writeAuditLog(adminUserId, "upsertApp", "apps", trimmedAppKey, {}, { created: appData }, requestId);
  return makeResponse(true, { appKey: trimmedAppKey, operation: "create" }, requestId);
}

async function upsertPackage(event, context) {
  const wxContext = cloud.getWXContext();
  const requestId = context.requestId || Date.now().toString();
  const { packageKey, productId, name, amountFen, basePoints, bonusPoints, status, sortOrder } = event;

  const adminCheck = await validateAdmin(wxContext, requestId);
  if (!adminCheck.ok) return adminCheck.response;
  const adminUserId = adminCheck.adminUserId;

  if (!packageKey || typeof packageKey !== "string" || packageKey.trim().length === 0) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "packageKey 不能为空" }, requestId);
  }
  if (productId !== undefined && productId !== null && typeof productId !== "string") {
    return makeResponse(false, { code: "INVALID_PARAM", message: "productId 必须是字符串" }, requestId);
  }
  if (typeof amountFen !== "number" || !Number.isInteger(amountFen) || amountFen <= 0) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "amountFen 必须是正整数" }, requestId);
  }
  if (typeof basePoints !== "number" || !Number.isInteger(basePoints) || basePoints < 0) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "basePoints 必须为非负整数" }, requestId);
  }
  if (typeof bonusPoints !== "number" || !Number.isInteger(bonusPoints) || bonusPoints < 0) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "bonusPoints 必须为非负整数" }, requestId);
  }
  const validStatuses = ["active", "disabled"];
  if (!status || !validStatuses.includes(status)) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "status 必须是 active / disabled" }, requestId);
  }

  const now = new Date();
  const trimmedKey = packageKey.trim();

  let existing = null;
  try {
    const res = await db.collection("recharge_packages").where({ packageKey: trimmedKey }).get();
    existing = res.data[0] || null;
  } catch (err) {
    return makeResponse(false, { code: "DB_ERROR", message: "查询充值包失败: " + err.message }, requestId);
  }

  const pkgData = {
    packageKey: trimmedKey,
    productId: (productId || "").trim(),
    name: (name || "").trim(),
    amountFen,
    basePoints,
    bonusPoints,
    status,
    sortOrder: typeof sortOrder === "number" ? sortOrder : 0,
    updatedAt: now,
  };

  if (existing) {
    try {
      await db.collection("recharge_packages").doc(existing._id).update({ data: pkgData });
    } catch (err) {
      return makeResponse(false, { code: "DB_ERROR", message: "更新充值包失败: " + err.message }, requestId);
    }
    await writeAuditLog(adminUserId, "upsertPackage", "recharge_packages", trimmedKey, { existing: existing }, { updated: pkgData }, requestId);
    return makeResponse(true, { packageKey: trimmedKey, operation: "update" }, requestId);
  }

  try {
    await db.collection("recharge_packages").add({ data: { ...pkgData, createdAt: now } });
  } catch (err) {
    return makeResponse(false, { code: "DB_ERROR", message: "创建充值包失败: " + err.message }, requestId);
  }
  await writeAuditLog(adminUserId, "upsertPackage", "recharge_packages", trimmedKey, {}, { created: pkgData }, requestId);
  return makeResponse(true, { packageKey: trimmedKey, operation: "create" }, requestId);
}

async function initSchema(event, context) {
  const wxContext = cloud.getWXContext();
  const requestId = context.requestId || Date.now().toString();

  const adminCheck = await validateAdmin(wxContext, requestId);
  if (!adminCheck.ok) return adminCheck.response;
  const adminUserId = adminCheck.adminUserId;

  const collCheck = await checkCollectionsExist();
  if (!collCheck.ok) {
    return makeResponse(false, {
      code: collCheck.code,
      message: collCheck.code === "MISSING_COLLECTION"
        ? "以下集合不存在，请先创建: " + collCheck.missing.join(", ")
        : "数据库权限不足，无法访问集合",
      missingCollections: collCheck.missing || [],
      allCollections: collCheck.all || [],
    }, requestId);
  }

  const now = new Date();
  const results = { systemConfigs: 0, apps: 0, rechargePackages: 0, errors: [] };

  const systemConfigSeeds = [
    { key: "payment_provider", value: "mock", description: "支付提供商: mock 或 wechat", updatedAt: now },
    { key: "mock_payment_enabled", value: true, description: "是否启用模拟支付（仅开发测试环境）", updatedAt: now },
  ];

  for (const item of systemConfigSeeds) {
    try {
      const exist = await db.collection("system_configs").where({ key: item.key }).get();
      if (exist.data.length === 0) {
        await db.collection("system_configs").add({ data: { ...item, createdAt: now } });
        results.systemConfigs++;
      } else {
        await db.collection("system_configs").doc(exist.data[0]._id).update({
          data: { value: item.value, updatedAt: now },
        });
      }
    } catch (err) {
      results.errors.push("system_configs seed 失败: " + err.message);
    }
  }

  const appSeeds = [
    {
      appKey: "demo_sum", name: "积分示例工具",
      description: "输入两个数字求和，演示积分扣费链路",
      entryPage: "/pages/tools/demo-sum/index", cloudFunctionName: "demoSum",
      status: "active", pricing: { mode: "fixed", costPoints: 1 },
      sortOrder: 1, createdAt: now, updatedAt: now,
    },
    {
      appKey: "ai_draw", name: "护士职业定妆照",
      description: "上传本人形象照和参考图，生成护士职业标准照",
      entryPage: "/pages/apps/ai_draw/index", cloudFunctionName: "app_ai_draw",
      status: "active", pricing: { mode: "fixed", costPoints: 0 },
      sortOrder: 2, createdAt: now, updatedAt: now,
    },
    {
      appKey: "nursing_undercover", name: "谁是卧底（护理版）",
      description: "AI NPC 参与的护理教学卧底推理游戏，支持词语卧底和病例推理双模式",
      entryPage: "/pages/apps/nursing_undercover/index", cloudFunctionName: "app_nursing_undercover",
      status: "active", pricing: { mode: "fixed", costPoints: 0 },
      sortOrder: 3, createdAt: now, updatedAt: now,
    },
  ];

  for (const item of appSeeds) {
    try {
      const exist = await db.collection("apps").where({ appKey: item.appKey }).get();
      if (exist.data.length === 0) {
        await db.collection("apps").add({ data: item });
        results.apps++;
      } else {
        await db.collection("apps").doc(exist.data[0]._id).update({
          data: {
            name: item.name, description: item.description,
            entryPage: item.entryPage, cloudFunctionName: item.cloudFunctionName,
            status: item.status, pricing: item.pricing,
            sortOrder: item.sortOrder, updatedAt: now,
          },
        });
      }
    } catch (err) {
      results.errors.push("apps seed 失败: " + err.message);
    }
  }

  const packageSeeds = [
    { packageKey: "pkg_6yuan", name: "6元充值包", amountFen: 600, basePoints: 60, bonusPoints: 0, status: "active", sortOrder: 1, createdAt: now, updatedAt: now },
    { packageKey: "pkg_30yuan", name: "30元充值包", amountFen: 3000, basePoints: 300, bonusPoints: 30, status: "active", sortOrder: 2, createdAt: now, updatedAt: now },
  ];

  for (const item of packageSeeds) {
    try {
      const exist = await db.collection("recharge_packages").where({ packageKey: item.packageKey }).get();
      if (exist.data.length === 0) {
        await db.collection("recharge_packages").add({ data: item });
        results.rechargePackages++;
      } else {
        await db.collection("recharge_packages").doc(exist.data[0]._id).update({
          data: {
            name: item.name, amountFen: item.amountFen,
            basePoints: item.basePoints, bonusPoints: item.bonusPoints,
            status: item.status, sortOrder: item.sortOrder, updatedAt: now,
          },
        });
      }
    } catch (err) {
      results.errors.push("recharge_packages seed 失败: " + err.message);
    }
  }

  await writeAuditLog(adminUserId, "initSchema", "system_configs", "seed", {}, {
    seeded: {
      systemConfigs: results.systemConfigs,
      apps: results.apps,
      rechargePackages: results.rechargePackages,
    },
    errors: results.errors,
  }, requestId);

  return makeResponse(true, {
    message: "initSchema 完成",
    seeded: {
      systemConfigs: results.systemConfigs,
      apps: results.apps,
      rechargePackages: results.rechargePackages,
    },
    errors: results.errors,
  }, requestId);
}

async function bootstrapFirstWebAdmin(event, context) {
  const wxContext = cloud.getWXContext();
  const requestId = context.requestId || Date.now().toString();

  const uid = getCloudBaseAuthUid() || getContextUid(wxContext);
  if (!uid) {
    return makeResponse(false, { code: "UNAUTHORIZED", message: "无法获取用户身份" }, requestId);
  }

  const adminOpenids = getAdminOpenids();
  const envWebUids = getAdminWebUids();
  const persistedAdmins = await getPersistedWebAdmins();

  if (adminOpenids.length > 0 || envWebUids.length > 0 || persistedAdmins.length > 0) {
    return makeResponse(false, { code: "WEB_ADMIN_ALREADY_CONFIGURED", message: "已有管理员存在，无法自动准入" }, requestId);
  }

  try {
    await db.collection("system_configs").add({
      data: {
        _id: WEB_ADMIN_CONFIG_KEY,
        key: WEB_ADMIN_CONFIG_KEY,
        value: [uid],
        description: "首次扫码自动准入的 Web 管理员 uid 列表",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    await writeAuditLog("web:" + uid, "bootstrapFirstWebAdmin", "system_configs", WEB_ADMIN_CONFIG_KEY, {}, { uid, autoAdmitted: true }, requestId);

    return makeResponse(true, { uid, message: "已成为首位 Web 管理员" }, requestId);
  } catch (err) {
    const currentAdmins = await getPersistedWebAdmins();
    if (currentAdmins.length > 0) {
      return makeResponse(false, { code: "WEB_ADMIN_ALREADY_CONFIGURED", message: "已有管理员存在，无法自动准入" }, requestId);
    }
    return makeResponse(false, { code: "DB_ERROR", message: "自动准入失败: " + err.message }, requestId);
  }
}

// ─── 主入口 ───────────────────────────────────────────────

exports.main = async (event, context) => {
  const { action } = event;
  const requestId = context.requestId || Date.now().toString();

  const actionMap = {
    initSchema,
    adjustPoints,
    upsertApp,
    upsertPackage,
    bootstrapFirstWebAdmin,
    listAuditLogs,
    getAdminMe,
    dashboardSummary,
    listUsers,
    getUserDetail,
    listPointTransactions,
    listOrders,
    listUsageRecords,
    listApps,
    listPackages,
  };

  const handler = actionMap[action];
  if (handler) {
    return handler(event, context);
  }

  return makeResponse(false, { code: "UNKNOWN_ACTION", message: "未知 action: " + action }, requestId);
};
