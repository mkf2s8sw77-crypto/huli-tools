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

function getEnv(name, defaultValue) {
  const v = process.env[name];
  return v !== undefined ? v : defaultValue;
}

function getInternalToken() {
  return process.env.INTERNAL_API_SECRET || "";
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

// ---------- 小程序虚拟支付（xpay） ----------

function hmacSha256Hex(key, data) {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest("hex");
}

// 0=现网 1=沙箱
function getVirtualPayEnv() {
  return getEnv("VIRTUAL_PAY_ENV", "0") === "1" ? 1 : 0;
}

function getVirtualPayAppKey() {
  return getVirtualPayEnv() === 1
    ? (process.env.VIRTUAL_PAY_APP_KEY_SANDBOX || "")
    : (process.env.VIRTUAL_PAY_APP_KEY || "");
}

function getRequiredVirtualPayVars() {
  const vars = ["VIRTUAL_PAY_OFFER_ID", "WX_MINIPROGRAM_APPSECRET"];
  vars.push(getVirtualPayEnv() === 1 ? "VIRTUAL_PAY_APP_KEY_SANDBOX" : "VIRTUAL_PAY_APP_KEY");
  return vars;
}

function checkVirtualPayConfig() {
  const missing = getRequiredVirtualPayVars().filter((k) => !process.env[k]);
  if (missing.length > 0) {
    return { ok: false, missing };
  }
  if (!getVirtualPayAppKey()) {
    return { ok: false, missing: [getVirtualPayEnv() === 1 ? "VIRTUAL_PAY_APP_KEY_SANDBOX" : "VIRTUAL_PAY_APP_KEY"] };
  }
  return { ok: true };
}

function getMiniProgramAppid() {
  const wxContext = cloud.getWXContext();
  return wxContext.APPID || process.env.WX_PAY_APPID || "";
}

let accessTokenCache = { token: null, expiresAtMs: 0 };

async function getAccessToken() {
  const now = Date.now();
  if (accessTokenCache.token && accessTokenCache.expiresAtMs > now + 60 * 1000) {
    return accessTokenCache.token;
  }
  const appid = getMiniProgramAppid();
  const secret = process.env.WX_MINIPROGRAM_APPSECRET || "";
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.access_token) {
    throw new Error(`获取 access_token 失败: errcode=${data.errcode} errmsg=${data.errmsg || ""}`);
  }
  accessTokenCache = {
    token: data.access_token,
    expiresAtMs: now + (Number(data.expires_in) || 7200) * 1000,
  };
  return data.access_token;
}

async function code2Session(code) {
  const appid = getMiniProgramAppid();
  const secret = process.env.WX_MINIPROGRAM_APPSECRET || "";
  const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.errcode) {
    const err = new Error(`code2session 失败: errcode=${data.errcode} errmsg=${data.errmsg || ""}`);
    err.code = "WX_LOGIN_FAILED";
    throw err;
  }
  return data;
}

// 调用 xpay 服务端 API（仅需支付签名 pay_sig 的接口）
async function callXpayApi(uri, postBodyObj) {
  const appKey = getVirtualPayAppKey();
  const postBody = JSON.stringify(postBodyObj);
  const paySig = hmacSha256Hex(appKey, `${uri}&${postBody}`);
  const accessToken = await getAccessToken();
  const url = `https://api.weixin.qq.com${uri}?access_token=${encodeURIComponent(accessToken)}&pay_sig=${paySig}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: postBody,
  });
  return res.json();
}

// 到账 + 标记订单 paid（幂等，mock / 虚拟支付查单 / 发货推送共用）
async function deliverOrder(order, meta) {
  if (order.status === "paid") {
    return { alreadyPaid: true };
  }
  if (order.status !== "created" && order.status !== "pending_pay") {
    const err = new Error(`订单状态不可到账: ${order.status}`);
    err.code = "INVALID_ORDER_STATUS";
    throw err;
  }

  const token = getInternalToken();
  if (!token) {
    const err = new Error("内部调用凭据未配置");
    err.code = "INTERNAL_SECRET_NOT_CONFIGURED";
    throw err;
  }

  const creditIdempotencyKey = `recharge_${order.orderNo}`;
  const creditRes = await cloud.callFunction({
    name: "corePoints",
    data: {
      action: "creditPoints",
      _internalToken: token,
      userId: order.userId,
      points: order.pointsTotal,
      relatedOrderId: order.orderNo,
      idempotencyKey: creditIdempotencyKey,
    },
  });
  const creditResult = creditRes.result;
  if (!creditResult || !creditResult.ok) {
    const errCode = creditResult && creditResult.error ? creditResult.error.code : "CREDIT_FAILED";
    const errMsg = creditResult && creditResult.error ? creditResult.error.message : "积分到账失败";
    const err = new Error(errMsg);
    err.code = errCode;
    throw err;
  }

  const now = new Date();
  try {
    await db.collection("payment_orders").doc(order._id).update({
      data: {
        status: "paid",
        paidAt: now,
        providerTradeNo: (meta && meta.providerTradeNo) || null,
        callbackDigest: (meta && meta.callbackDigest) || null,
        updatedAt: now,
      },
    });
  } catch (updateErr) {
    const err = new Error("积分已到账，但更新订单状态失败，可重复发起以补齐状态: " + updateErr.message);
    err.code = "ORDER_STATUS_UPDATE_FAILED";
    throw err;
  }
  return { alreadyPaid: false };
}

async function findOrderByNo(orderNo) {
  const res = await db.collection("payment_orders").where({ orderNo }).get();
  return res.data[0] || null;
}

// ---------- actions ----------

async function listPackages(event, context) {
  const requestId = context.requestId || Date.now().toString();

  try {
    const res = await db.collection("recharge_packages")
      .where({ status: "active" })
      .orderBy("sortOrder", "asc")
      .get();

    const list = (res.data || []).map((pkg) => ({
      packageKey: pkg.packageKey,
      productId: pkg.productId || "",
      name: pkg.name,
      amountFen: pkg.amountFen,
      basePoints: pkg.basePoints,
      bonusPoints: pkg.bonusPoints,
      status: pkg.status,
      sortOrder: pkg.sortOrder || 0,
    }));

    return makeResponse(true, {
      list,
      total: list.length,
      provider: getPaymentProvider(),
      mockEnabled: isMockEnabled(),
    }, requestId);
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

async function getOrder(event, context) {
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
    order = await findOrderByNo(orderNo);
  } catch (err) {
    return makeResponse(false, { code: "DB_ERROR", message: "查询订单失败: " + err.message }, requestId);
  }
  if (!order) {
    return makeResponse(false, { code: "ORDER_NOT_FOUND", message: "订单不存在" }, requestId);
  }
  if (order.userId !== openid) {
    return makeResponse(false, { code: "FORBIDDEN", message: "无权查看该订单" }, requestId);
  }

  return makeResponse(true, {
    orderNo: order.orderNo,
    packageKey: order.packageKey,
    amountFen: order.amountFen,
    pointsTotal: order.pointsTotal,
    status: order.status,
    provider: order.provider,
    paidAt: order.paidAt || null,
    createdAt: order.createdAt,
  }, requestId);
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
    order = await findOrderByNo(orderNo);
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

  try {
    const r = await deliverOrder(order, {
      providerTradeNo: `MOCK_${Date.now()}`,
      callbackDigest: "mock_payment",
    });
    return makeResponse(true, { orderNo, status: "paid", pointsTotal: order.pointsTotal, alreadyPaid: r.alreadyPaid }, requestId);
  } catch (err) {
    return makeResponse(false, { code: err.code || "CREDIT_FAILED", message: err.message }, requestId);
  }
}

// 虚拟支付：创建订单并返回 wx.requestVirtualPayment 所需的签名参数
async function createVirtualOrder(event, context) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const requestId = context.requestId || Date.now().toString();
  const { packageKey, code } = event;

  if (!openid) {
    return makeResponse(false, { code: "UNAUTHORIZED", message: "无法获取用户身份" }, requestId);
  }
  if (!packageKey) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "缺少 packageKey" }, requestId);
  }
  if (!code) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "缺少 wx.login code" }, requestId);
  }
  if (getPaymentProvider() !== "virtual") {
    return makeResponse(false, { code: "PROVIDER_MISMATCH", message: "当前支付提供商不是小程序虚拟支付" }, requestId);
  }

  const cfg = checkVirtualPayConfig();
  if (!cfg.ok) {
    return makeResponse(false, {
      code: "PAYMENT_NOT_CONFIGURED",
      message: "虚拟支付配置不完整，缺少以下变量: " + cfg.missing.join(", "),
      missingVars: cfg.missing,
    }, requestId);
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
  if (!pkg.productId) {
    return makeResponse(false, { code: "PACKAGE_NO_PRODUCT_ID", message: "充值包未配置虚拟支付道具 productId" }, requestId);
  }

  // code 换 session_key（signature 的用户态签名需要）
  let session;
  try {
    session = await code2Session(code);
  } catch (err) {
    return makeResponse(false, { code: err.code || "WX_LOGIN_FAILED", message: err.message }, requestId);
  }
  if (session.openid !== openid) {
    return makeResponse(false, { code: "OPENID_MISMATCH", message: "登录态与当前用户不一致" }, requestId);
  }

  const orderNo = generateOrderNo();
  const pointsTotal = pkg.basePoints + pkg.bonusPoints;
  const now = new Date();
  const env = getVirtualPayEnv();

  try {
    await db.collection("payment_orders").add({
      data: {
        orderNo,
        userId: openid,
        packageKey: pkg.packageKey,
        amountFen: pkg.amountFen,
        pointsTotal,
        status: "created",
        provider: "virtual",
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

  const signData = JSON.stringify({
    offerId: process.env.VIRTUAL_PAY_OFFER_ID,
    buyQuantity: 1,
    env,
    currencyType: "CNY",
    productId: pkg.productId,
    goodsPrice: pkg.amountFen,
    outTradeNo: orderNo,
    attach: orderNo,
  });
  const paySig = hmacSha256Hex(getVirtualPayAppKey(), `requestVirtualPayment&${signData}`);
  const signature = hmacSha256Hex(session.session_key, signData);

  return makeResponse(true, {
    orderNo,
    packageKey: pkg.packageKey,
    amountFen: pkg.amountFen,
    pointsTotal,
    status: "created",
    provider: "virtual",
    mode: "short_series_goods",
    env,
    signData,
    paySig,
    signature,
  }, requestId);
}

// 虚拟支付：客户端支付成功后调用，服务端主动查单确认并到账（推送的兜底）
async function confirmVirtualOrder(event, context) {
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
    order = await findOrderByNo(orderNo);
  } catch (err) {
    return makeResponse(false, { code: "DB_ERROR", message: "查询订单失败: " + err.message }, requestId);
  }
  if (!order) {
    return makeResponse(false, { code: "ORDER_NOT_FOUND", message: "订单不存在" }, requestId);
  }
  if (order.userId !== openid) {
    return makeResponse(false, { code: "FORBIDDEN", message: "无权操作该订单" }, requestId);
  }
  if (order.provider !== "virtual") {
    return makeResponse(false, { code: "PROVIDER_MISMATCH", message: "该订单不是虚拟支付订单" }, requestId);
  }
  if (order.status === "paid") {
    return makeResponse(true, { orderNo, status: "paid", alreadyPaid: true }, requestId);
  }
  if (order.status === "closed") {
    return makeResponse(false, { code: "ORDER_ALREADY_CLOSED", message: "订单已关闭" }, requestId);
  }
  if (order.status === "refunded") {
    return makeResponse(false, { code: "ORDER_ALREADY_REFUNDED", message: "订单已退款" }, requestId);
  }

  const cfg = checkVirtualPayConfig();
  if (!cfg.ok) {
    return makeResponse(false, {
      code: "PAYMENT_NOT_CONFIGURED",
      message: "虚拟支付配置不完整，缺少以下变量: " + cfg.missing.join(", "),
      missingVars: cfg.missing,
    }, requestId);
  }

  // 主动查单（现金单）
  let queryResp;
  try {
    queryResp = await callXpayApi("/xpay/query_order", {
      openid: order.userId,
      env: getVirtualPayEnv(),
      order_id: orderNo,
    });
  } catch (err) {
    return makeResponse(false, { code: "QUERY_ORDER_FAILED", message: "查询微信订单失败: " + err.message }, requestId);
  }
  if (queryResp.errcode) {
    return makeResponse(false, {
      code: "QUERY_ORDER_FAILED",
      message: `查询微信订单失败: errcode=${queryResp.errcode} errmsg=${queryResp.errmsg || ""}`,
    }, requestId);
  }

  const wxOrder = queryResp.order || {};
  // status: 2=已支付待发货 3=发货中 4=已发货
  if (![2, 3, 4].includes(wxOrder.status)) {
    return makeResponse(false, {
      code: "ORDER_NOT_PAID",
      message: "微信订单尚未支付完成",
      wxStatus: wxOrder.status,
    }, requestId);
  }

  try {
    await deliverOrder(order, {
      providerTradeNo: wxOrder.wx_order_id || wxOrder.channel_order_id || null,
      callbackDigest: "query_order",
    });
  } catch (err) {
    return makeResponse(false, { code: err.code || "CREDIT_FAILED", message: err.message }, requestId);
  }

  // 已支付但未标记发货的，主动通知平台发货完成（正常走推送回包成功则不需要）
  if (wxOrder.status === 2 || wxOrder.status === 3) {
    try {
      await callXpayApi("/xpay/notify_provide_goods", {
        order_id: orderNo,
        env: getVirtualPayEnv(),
      });
    } catch (err) {
      console.warn("notify_provide_goods 失败（不影响到账）:", err.message);
    }
  }

  return makeResponse(true, { orderNo, status: "paid", pointsTotal: order.pointsTotal }, requestId);
}

// 虚拟支付：道具发货推送（云开发消息推送到云函数，事件形式调用）
async function handleGoodsDeliverNotify(event) {
  const outTradeNo = event.OutTradeNo;
  const buyerOpenid = event.OpenId;
  const env = Number(event.Env);

  if (!outTradeNo) {
    return { ErrCode: 0, ErrMsg: "missing OutTradeNo, ignored" };
  }
  if (env !== getVirtualPayEnv()) {
    return { ErrCode: 0, ErrMsg: `env ${env} not handled by this deployment, ignored` };
  }

  let order;
  try {
    order = await findOrderByNo(outTradeNo);
  } catch (err) {
    // 数据库异常时返回失败让微信重试
    return { ErrCode: -1, ErrMsg: "db error: " + err.message };
  }
  if (!order) {
    return { ErrCode: 0, ErrMsg: "order not found, ignored" };
  }
  if (buyerOpenid && order.userId !== buyerOpenid) {
    return { ErrCode: 0, ErrMsg: "openid mismatch, ignored" };
  }

  const goods = event.GoodsInfo || {};
  if (goods.ActualPrice !== undefined && Number(goods.ActualPrice) !== order.amountFen) {
    console.warn(`发货推送金额不一致: order=${order.orderNo} amountFen=${order.amountFen} actual=${goods.ActualPrice}`);
  }

  const payInfo = event.WeChatPayInfo || {};
  try {
    await deliverOrder(order, {
      providerTradeNo: payInfo.TransactionId || null,
      callbackDigest: "xpay_goods_deliver_notify",
    });
  } catch (err) {
    // 到账失败返回失败让微信重试（creditPoints 幂等，可安全重试）
    return { ErrCode: -1, ErrMsg: err.message };
  }

  return { ErrCode: 0, ErrMsg: "success" };
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
    order = await findOrderByNo(orderNo);
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
  // 云开发消息推送（虚拟支付发货通知等）不是 action 风格，优先识别
  if (event && event.MsgType === "event" && typeof event.Event === "string") {
    if (event.Event === "xpay_goods_deliver_notify") {
      return handleGoodsDeliverNotify(event);
    }
    return { ErrCode: 0, ErrMsg: `event ${event.Event} ignored` };
  }

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
  if (action === "getOrder") {
    return getOrder(event, context);
  }
  if (action === "mockPayOrder") {
    return mockPayOrder(event, context);
  }
  if (action === "createVirtualOrder") {
    return createVirtualOrder(event, context);
  }
  if (action === "confirmVirtualOrder") {
    return confirmVirtualOrder(event, context);
  }
  if (action === "handlePayCallback") {
    return handlePayCallback(event, context);
  }
  if (action === "closeOrder") {
    return closeOrder(event, context);
  }

  return makeResponse(false, { code: "UNKNOWN_ACTION", message: "未知 action: " + action }, requestId);
};
