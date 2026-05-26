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

function getAdminOpenids() {
  const raw = process.env.ADMIN_OPENIDS || "";
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function isAdmin(openid) {
  const admins = getAdminOpenids();
  return admins.includes(openid);
}

async function checkCollectionsExist() {
  const required = [
    "users",
    "point_accounts",
    "point_transactions",
    "apps",
    "app_usage_records",
    "recharge_packages",
    "payment_orders",
    "admin_audit_logs",
    "system_configs",
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

function validateAdmin(wxContext, requestId) {
  const openid = wxContext.OPENID;
  if (!openid) {
    return { ok: false, response: makeResponse(false, { code: "UNAUTHORIZED", message: "无法获取用户身份" }, requestId) };
  }
  const adminOpenids = getAdminOpenids();
  if (adminOpenids.length === 0) {
    return { ok: false, response: makeResponse(false, { code: "ADMIN_NOT_CONFIGURED", message: "管理员未配置，请在云函数环境变量中设置 ADMIN_OPENIDS" }, requestId) };
  }
  if (!isAdmin(openid)) {
    return { ok: false, response: makeResponse(false, { code: "FORBIDDEN", message: "无权访问管理接口" }, requestId) };
  }
  return { ok: true, openid };
}

async function writeAuditLog(openid, action, targetCollection, targetId, beforeSummary, afterSummary, requestId) {
  try {
    await db.collection("admin_audit_logs").add({
      data: {
        adminUserId: openid,
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
    // 审计日志非致命，但记录到控制台
    console.error("写审计日志失败:", err.message);
  }
}

async function adjustPoints(event, context) {
  const wxContext = cloud.getWXContext();
  const requestId = context.requestId || Date.now().toString();
  const { targetUserId, deltaPoints, note } = event;

  const adminCheck = validateAdmin(wxContext, requestId);
  if (!adminCheck.ok) return adminCheck.response;
  const openid = adminCheck.openid;

  if (!targetUserId) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "缺少目标用户" }, requestId);
  }
  if (typeof deltaPoints !== "number" || deltaPoints === 0 || !Number.isInteger(deltaPoints)) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "积分变动量必须为整数且不能为0" }, requestId);
  }

  // 读取调整前余额用于审计
  let beforeAccount = null;
  try {
    const res = await db.collection("point_accounts").where({ userId: targetUserId }).get();
    beforeAccount = res.data[0] || null;
  } catch (err) {
    // ignore
  }

  // 调用 corePoints 调整积分
  let adjustResult;
  try {
    const res = await cloud.callFunction({
      name: "corePoints",
      data: {
        action: "adminAdjustPoints",
        targetUserId,
        deltaPoints,
        note: note || "管理员调试调整",
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

  await writeAuditLog(openid, "adjustPoints", "point_accounts", targetUserId, {
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
  }, requestId);
}

async function upsertApp(event, context) {
  const wxContext = cloud.getWXContext();
  const requestId = context.requestId || Date.now().toString();
  const { appKey, name, description, entryPage, cloudFunctionName, status, pricing, sortOrder } = event;

  const adminCheck = validateAdmin(wxContext, requestId);
  if (!adminCheck.ok) return adminCheck.response;
  const openid = adminCheck.openid;

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
    await writeAuditLog(openid, "upsertApp", "apps", trimmedAppKey, { existing: existing }, { updated: appData }, requestId);
    return makeResponse(true, { appKey: trimmedAppKey, operation: "update" }, requestId);
  }

  try {
    await db.collection("apps").add({ data: { ...appData, createdAt: now } });
  } catch (err) {
    return makeResponse(false, { code: "DB_ERROR", message: "创建应用失败: " + err.message }, requestId);
  }
  await writeAuditLog(openid, "upsertApp", "apps", trimmedAppKey, {}, { created: appData }, requestId);
  return makeResponse(true, { appKey: trimmedAppKey, operation: "create" }, requestId);
}

async function upsertPackage(event, context) {
  const wxContext = cloud.getWXContext();
  const requestId = context.requestId || Date.now().toString();
  const { packageKey, name, amountFen, basePoints, bonusPoints, status, sortOrder } = event;

  const adminCheck = validateAdmin(wxContext, requestId);
  if (!adminCheck.ok) return adminCheck.response;
  const openid = adminCheck.openid;

  if (!packageKey || typeof packageKey !== "string" || packageKey.trim().length === 0) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "packageKey 不能为空" }, requestId);
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
    await writeAuditLog(openid, "upsertPackage", "recharge_packages", trimmedKey, { existing: existing }, { updated: pkgData }, requestId);
    return makeResponse(true, { packageKey: trimmedKey, operation: "update" }, requestId);
  }

  try {
    await db.collection("recharge_packages").add({ data: { ...pkgData, createdAt: now } });
  } catch (err) {
    return makeResponse(false, { code: "DB_ERROR", message: "创建充值包失败: " + err.message }, requestId);
  }
  await writeAuditLog(openid, "upsertPackage", "recharge_packages", trimmedKey, {}, { created: pkgData }, requestId);
  return makeResponse(true, { packageKey: trimmedKey, operation: "create" }, requestId);
}

async function listAuditLogs(event, context) {
  const wxContext = cloud.getWXContext();
  const requestId = context.requestId || Date.now().toString();
  const { page = 1, pageSize = 20 } = event;

  const adminCheck = validateAdmin(wxContext, requestId);
  if (!adminCheck.ok) return adminCheck.response;

  const limit = Math.min(Math.max(pageSize, 1), 100);
  const skip = Math.max((page - 1) * limit, 0);

  try {
    const res = await db.collection("admin_audit_logs")
      .orderBy("createdAt", "desc")
      .skip(skip)
      .limit(limit)
      .get();

    const totalRes = await db.collection("admin_audit_logs").count();

    return makeResponse(true, {
      list: res.data || [],
      total: totalRes.total || 0,
      page,
      pageSize: limit,
    }, requestId);
  } catch (err) {
    if (err.message && err.message.includes("collection not exists")) {
      return makeResponse(false, { code: "MISSING_COLLECTION", message: "admin_audit_logs 集合不存在" }, requestId);
    }
    return makeResponse(false, { code: "DB_ERROR", message: "查询审计日志失败: " + err.message }, requestId);
  }
}

async function initSchema(event, context) {
  const wxContext = cloud.getWXContext();
  const requestId = context.requestId || Date.now().toString();

  const adminCheck = validateAdmin(wxContext, requestId);
  if (!adminCheck.ok) return adminCheck.response;
  const openid = adminCheck.openid;

  // 检查集合是否存在
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

  // seed system_configs
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

  // seed apps
  const appSeeds = [
    {
      appKey: "demo_sum",
      name: "积分示例工具",
      description: "输入两个数字求和，演示积分扣费链路",
      entryPage: "/pages/tools/demo-sum/index",
      cloudFunctionName: "demoSum",
      status: "active",
      pricing: { mode: "fixed", costPoints: 1 },
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
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
            name: item.name,
            description: item.description,
            entryPage: item.entryPage,
            cloudFunctionName: item.cloudFunctionName,
            status: item.status,
            pricing: item.pricing,
            sortOrder: item.sortOrder,
            updatedAt: now,
          },
        });
      }
    } catch (err) {
      results.errors.push("apps seed 失败: " + err.message);
    }
  }

  // seed recharge_packages
  const packageSeeds = [
    {
      packageKey: "pkg_6yuan",
      name: "6元充值包",
      amountFen: 600,
      basePoints: 60,
      bonusPoints: 0,
      status: "active",
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      packageKey: "pkg_30yuan",
      name: "30元充值包",
      amountFen: 3000,
      basePoints: 300,
      bonusPoints: 30,
      status: "active",
      sortOrder: 2,
      createdAt: now,
      updatedAt: now,
    },
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
            name: item.name,
            amountFen: item.amountFen,
            basePoints: item.basePoints,
            bonusPoints: item.bonusPoints,
            status: item.status,
            sortOrder: item.sortOrder,
            updatedAt: now,
          },
        });
      }
    } catch (err) {
      results.errors.push("recharge_packages seed 失败: " + err.message);
    }
  }

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

exports.main = async (event, context) => {
  const { action } = event;
  const requestId = context.requestId || Date.now().toString();

  if (action === "initSchema") {
    return initSchema(event, context);
  }
  if (action === "adjustPoints") {
    return adjustPoints(event, context);
  }
  if (action === "upsertApp") {
    return upsertApp(event, context);
  }
  if (action === "upsertPackage") {
    return upsertPackage(event, context);
  }
  if (action === "listAuditLogs") {
    return listAuditLogs(event, context);
  }

  return makeResponse(false, { code: "UNKNOWN_ACTION", message: "未知 action: " + action }, requestId);
};
