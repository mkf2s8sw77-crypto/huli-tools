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

function getEnv(name, defaultValue) {
  const v = process.env[name];
  return v !== undefined ? v : defaultValue;
}

function getInternalToken() {
  return process.env.INTERNAL_API_SECRET || "huli-tools-internal";
}

function getPaymentProvider() {
  return getEnv("PAYMENT_PROVIDER", "mock");
}

function isMockEnabled() {
  const envVal = getEnv("MOCK_PAYMENT_ENABLED", "").toLowerCase();
  return envVal === "true" || envVal === "1";
}

function getAdminOpenids() {
  const raw = process.env.ADMIN_OPENIDS || "";
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function isAdmin(openid) {
  return getAdminOpenids().includes(openid);
}

function generateOrderNo() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const h = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");
  const rand = String(Math.floor(Math.random() * 1000000)).padStart(6, "0");
  return `ORD${y}${m}${d}${h}${min}${s}${rand}`;
}

function getRequiredWechatVars() {
  return [
    "WX_PAY_MCH_ID",
    "WX_PAY_APPID",
    "WX_PAY_API_V3_KEY",
    "WX_PAY_SERIAL_NO",
    "WX_PAY_PRIVATE_KEY",
    "WX_PAY_NOTIFY_URL",
  ];
}

function checkWechatConfig() {
  const required = getRequiredWechatVars();
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    return { ok: false, missing };
  }
  return { ok: true };
}

async function listPackages(event, context) {
  const requestId = context.requestId || Date.now().toString();

  try {
    const res = await db.collection("recharge_packages")
      .where({ status: "active" })
      .orderBy("sortOrder", "asc")
      .get();

    const list = (res.data || []).map((pkg) => ({
      packageKey: pkg.packageKey,
      name: pkg.name,
      amountFen: pkg.amountFen,
      basePoints: pkg.basePoints,
      bonusPoints: pkg.bonusPoints,
      status: pkg.status,
      sortOrder: pkg.sortOrder || 0,
    }));

    return makeResponse(true, { list, total: list.length }, requestId);
  } catch (err) {
    if (err.message && err.message.includes("collection not exists")) {
      return makeResponse(false, { code: "MISSING_COLLECTION", message: "recharge_packages 集合不存在" }, requestId);
    }
    return makeResponse(false, { code: "DB_ERROR", message: "查询充值包失败: " + err.message }, requestId);
  }
}

async function createOrder(event, context) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const requestId = context.requestId || Date.now().toString();
  const { packageKey } = event;

  if (!openid) {
    return makeResponse(false, { code: "UNAUTHORIZED", message: "无法获取用户身份" }, requestId);
  }
  if (!packageKey) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "缺少 packageKey" }, requestId);
  }

  // 查询套餐
  let pkg;
  try {
    const pkgRes = await db.collection("recharge_packages").where({ packageKey }).get();
    pkg = pkgRes.data[0] || null;
  } catch (err) {
    return makeResponse(false, { code: "DB_ERROR", message: "查询充值包失败: " + err.message }, requestId);
  }

  if (!pkg) {
    return makeResponse(false, { code: "PACKAGE_NOT_FOUND", message: "充值包不存在" }, requestId);
  }
  if (pkg.status !== "active") {
    return makeResponse(false, { code: "PACKAGE_NOT_ACTIVE", message: "充值包未上架" }, requestId);
  }

  // 支付提供商校验
  const provider = getPaymentProvider();
  if (provider === "wechat") {
    const cfg = checkWechatConfig();
    if (!cfg.ok) {
      return makeResponse(false, {
        code: "PAYMENT_NOT_CONFIGURED",
        message: "微信支付配置不完整，缺少以下变量: " + cfg.missing.join(", "),
        missingVars: cfg.missing,
      }, requestId);
    }
  }

  const orderNo = generateOrderNo();
  const pointsTotal = pkg.basePoints + pkg.bonusPoints;
  const now = new Date();

  try {
    await db.collection("payment_orders").add({
      data: {
        orderNo,
        userId: openid,
        packageKey: pkg.packageKey,
        amountFen: pkg.amountFen,
        pointsTotal,
        status: "created",
        provider,
        providerTradeNo: null,
        prepayInfo: null,
        paidAt: null,
        closedAt: null,
        idempotencyKey: `order_${orderNo}`,
        callbackDigest: null,
        createdAt: now,
        updatedAt: now,
      },
    });
  } catch (err) {
    return makeResponse(false, { code: "DB_ERROR", message: "创建订单失败: " + err.message }, requestId);
  }

  return makeResponse(true, {
    orderNo,
    packageKey: pkg.packageKey,
    amountFen: pkg.amountFen,
    pointsTotal,
    status: "created",
    provider,
  }, requestId);
}

async function listOrders(event, context) {
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
    const res = await db.collection("payment_orders")
      .where({ userId: openid })
      .orderBy("createdAt", "desc")
      .skip(skip)
      .limit(limit)
      .get();

    const totalRes = await db.collection("payment_orders")
      .where({ userId: openid })
      .count();

    const list = (res.data || []).map((order) => ({
      orderNo: order.orderNo,
      packageKey: order.packageKey,
      amountFen: order.amountFen,
      pointsTotal: order.pointsTotal,
      status: order.status,
      provider: order.provider,
      paidAt: order.paidAt || null,
      closedAt: order.closedAt || null,
      createdAt: order.createdAt,
    }));

    return makeResponse(true, {
      list,
      total: totalRes.total || 0,
      page,
      pageSize: limit,
    }, requestId);
  } catch (err) {
    if (err.message && err.message.includes("collection not exists")) {
      return makeResponse(false, { code: "MISSING_COLLECTION", message: "payment_orders 集合不存在" }, requestId);
    }
    return makeResponse(false, { code: "DB_ERROR", message: "查询订单失败: " + err.message }, requestId);
  }
}

async function mockPayOrder(event, context) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const requestId = context.requestId || Date.now().toString();
  const { orderNo, asAdmin } = event;

  if (!openid) {
    return makeResponse(false, { code: "UNAUTHORIZED", message: "无法获取用户身份" }, requestId);
  }
  if (!orderNo) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "缺少 orderNo" }, requestId);
  }

  if (!isMockEnabled()) {
    return makeResponse(false, { code: "MOCK_PAYMENT_DISABLED", message: "模拟支付未启用" }, requestId);
  }

  // 查询订单
  let order;
  try {
    const orderRes = await db.collection("payment_orders").where({ orderNo }).get();
    order = orderRes.data[0] || null;
  } catch (err) {
    return makeResponse(false, { code: "DB_ERROR", message: "查询订单失败: " + err.message }, requestId);
  }

  if (!order) {
    return makeResponse(false, { code: "ORDER_NOT_FOUND", message: "订单不存在" }, requestId);
  }

  // 权限校验：自己订单 或 管理员代操作
  if (order.userId !== openid) {
    if (asAdmin) {
      if (!isAdmin(openid)) {
        return makeResponse(false, { code: "FORBIDDEN", message: "无权操作他人订单" }, requestId);
      }
    } else {
      return makeResponse(false, { code: "FORBIDDEN", message: "无权操作他人订单" }, requestId);
    }
  }

  // 幂等：已支付
  if (order.status === "paid") {
    return makeResponse(true, { orderNo, status: "paid", alreadyPaid: true }, requestId);
  }

  if (order.status === "closed") {
    return makeResponse(false, { code: "ORDER_ALREADY_CLOSED", message: "订单已关闭" }, requestId);
  }

  if (order.status === "refunded") {
    return makeResponse(false, { code: "ORDER_ALREADY_REFUNDED", message: "订单已退款" }, requestId);
  }

  if (order.status !== "created" && order.status !== "pending_pay") {
    return makeResponse(false, { code: "INVALID_ORDER_STATUS", message: "订单状态不可支付" }, requestId);
  }

  const now = new Date();

  // 更新订单为已支付
  try {
    await db.collection("payment_orders").doc(order._id).update({
      data: {
        status: "paid",
        paidAt: now,
        providerTradeNo: `MOCK_${Date.now()}`,
        callbackDigest: "mock_payment",
        updatedAt: now,
      },
    });
  } catch (err) {
    return makeResponse(false, { code: "DB_ERROR", message: "更新订单状态失败: " + err.message }, requestId);
  }

  // 调用 corePoints.creditPoints 充值到账（确保积分到订单归属用户而非调用者）
  const creditIdempotencyKey = `recharge_${orderNo}`;
  try {
    const creditRes = await cloud.callFunction({
      name: "corePoints",
      data: {
        action: "creditPoints",
        _internalToken: getInternalToken(),
        userId: order.userId,
        points: order.pointsTotal,
        relatedOrderId: orderNo,
        idempotencyKey: creditIdempotencyKey,
      },
    });
    const creditResult = creditRes.result;
    if (!creditResult || !creditResult.ok) {
      const errCode = creditResult && creditResult.error ? creditResult.error.code : "CREDIT_FAILED";
      const errMsg = creditResult && creditResult.error ? creditResult.error.message : "积分到账失败";
      return makeResponse(false, { code: errCode, message: errMsg }, requestId);
    }
  } catch (err) {
    return makeResponse(false, { code: "CREDIT_FAILED", message: "积分到账调用失败: " + err.message }, requestId);
  }

  return makeResponse(true, { orderNo, status: "paid", pointsTotal: order.pointsTotal }, requestId);
}

async function handlePayCallback(event, context) {
  const requestId = context.requestId || Date.now().toString();

  // 微信支付回调不依赖用户登录态，是服务端对服务端通知
  const provider = getPaymentProvider();
  if (provider !== "wechat") {
    return makeResponse(false, { code: "PROVIDER_MISMATCH", message: "当前支付提供商不是微信支付" }, requestId);
  }

  const cfg = checkWechatConfig();
  if (!cfg.ok) {
    return makeResponse(false, {
      code: "PAYMENT_NOT_CONFIGURED",
      message: "微信支付配置不完整，缺少以下变量: " + cfg.missing.join(", "),
      missingVars: cfg.missing,
    }, requestId);
  }

  // 真实微信支付回调需要验签、解密、处理订单
  // 由于当前环境未提供真实商户密钥，仅做预留，返回明确提示
  return makeResponse(false, {
    code: "NOT_IMPLEMENTED",
    message: "真实微信支付回调尚未完全实现，请联系管理员配置并启用",
  }, requestId);
}

async function closeOrder(event, context) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const requestId = context.requestId || Date.now().toString();
  const { orderNo } = event;

  if (!openid) {
    return makeResponse(false, { code: "UNAUTHORIZED", message: "无法获取用户身份" }, requestId);
  }
  if (!orderNo) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "缺少 orderNo" }, requestId);
  }

  let order;
  try {
    const orderRes = await db.collection("payment_orders").where({ orderNo }).get();
    order = orderRes.data[0] || null;
  } catch (err) {
    return makeResponse(false, { code: "DB_ERROR", message: "查询订单失败: " + err.message }, requestId);
  }

  if (!order) {
    return makeResponse(false, { code: "ORDER_NOT_FOUND", message: "订单不存在" }, requestId);
  }
  if (order.userId !== openid) {
    return makeResponse(false, { code: "FORBIDDEN", message: "无权操作该订单" }, requestId);
  }

  if (order.status === "paid") {
    return makeResponse(false, { code: "ORDER_ALREADY_PAID", message: "订单已支付，不能关闭" }, requestId);
  }
  if (order.status === "closed") {
    return makeResponse(true, { orderNo, status: "closed", alreadyClosed: true }, requestId);
  }
  if (order.status === "refunded") {
    return makeResponse(false, { code: "ORDER_ALREADY_REFUNDED", message: "订单已退款，不能关闭" }, requestId);
  }

  const now = new Date();
  try {
    await db.collection("payment_orders").doc(order._id).update({
      data: {
        status: "closed",
        closedAt: now,
        updatedAt: now,
      },
    });
  } catch (err) {
    return makeResponse(false, { code: "DB_ERROR", message: "关闭订单失败: " + err.message }, requestId);
  }

  return makeResponse(true, { orderNo, status: "closed" }, requestId);
}

exports.main = async (event, context) => {
  const { action } = event;
  const requestId = context.requestId || Date.now().toString();

  if (action === "listPackages") {
    return listPackages(event, context);
  }
  if (action === "createOrder") {
    return createOrder(event, context);
  }
  if (action === "listOrders") {
    return listOrders(event, context);
  }
  if (action === "mockPayOrder") {
    return mockPayOrder(event, context);
  }
  if (action === "handlePayCallback") {
    return handlePayCallback(event, context);
  }
  if (action === "closeOrder") {
    return closeOrder(event, context);
  }

  return makeResponse(false, { code: "UNKNOWN_ACTION", message: "未知 action: " + action }, requestId);
};
