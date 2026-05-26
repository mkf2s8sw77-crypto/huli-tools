const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

function makeResponse(ok, dataOrError, requestId) {
  if (ok) {
    return { ok: true, data: dataOrError || {}, requestId };
  }
  return { ok: false, error: dataOrError || { code: "UNKNOWN", message: "未知错误" }, requestId };
}

async function ensurePointAccount(openid, now) {
  const accountRes = await db.collection("point_accounts").where({ userId: openid }).get();
  const account = accountRes.data[0] || null;
  if (account) {
    return account;
  }

  try {
    await db.collection("point_accounts").add({
      data: {
        _id: openid,
        userId: openid,
        availablePoints: 0,
        frozenPoints: 0,
        totalRechargedPoints: 0,
        totalConsumedPoints: 0,
        createdAt: now,
        updatedAt: now,
      },
    });
  } catch (err) {
    const retryRes = await db.collection("point_accounts").where({ userId: openid }).get();
    const retryAccount = retryRes.data[0] || null;
    if (retryAccount) {
      return retryAccount;
    }
    throw err;
  }

  const createdRes = await db.collection("point_accounts").where({ userId: openid }).get();
  return createdRes.data[0] || null;
}

async function bootstrap(event, context) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const appid = wxContext.APPID;
  const unionid = wxContext.UNIONID || null;
  const requestId = context.requestId || Date.now().toString();

  if (!openid) {
    return makeResponse(false, { code: "UNAUTHORIZED", message: "无法获取用户身份" }, requestId);
  }

  const now = new Date();

  // 尝试查找用户
  let user;
  try {
    const userRes = await db.collection("users").doc(openid).get();
    user = userRes.data;
  } catch (err) {
    user = null;
  }

  if (!user) {
    // 首次创建
    try {
      await db.collection("users").add({
        data: {
          _id: openid,
          openid,
          unionid,
          phoneNumber: null,
          nickname: null,
          avatarUrl: null,
          roles: ["user"],
          status: "active",
          lastLoginAt: now,
          createdAt: now,
          updatedAt: now,
        },
      });
    } catch (err) {
      return makeResponse(false, { code: "DB_ERROR", message: "创建用户失败: " + err.message }, requestId);
    }

  } else {
    // 更新最后登录时间
    try {
      const updateData = {
        lastLoginAt: now,
        updatedAt: now,
      };
      if (unionid) {
        updateData.unionid = unionid;
      }
      await db.collection("users").doc(openid).update({
        data: updateData,
      });
    } catch (err) {
      // 非致命错误，继续返回用户信息
    }
  }

  try {
    await ensurePointAccount(openid, now);
  } catch (err) {
    return makeResponse(false, { code: "DB_ERROR", message: "创建积分账户失败: " + err.message }, requestId);
  }

  // 读取用户和积分账户
  let userData;
  let accountData;
  try {
    const userRes = await db.collection("users").doc(openid).get();
    userData = userRes.data;
  } catch (err) {
    return makeResponse(false, { code: "DB_ERROR", message: "读取用户失败" }, requestId);
  }

  try {
    const accountRes = await db.collection("point_accounts").where({ userId: openid }).get();
    accountData = accountRes.data[0] || null;
  } catch (err) {
    accountData = null;
  }

  return makeResponse(true, {
    user: {
      openid: userData.openid,
      unionid: userData.unionid || null,
      nickname: userData.nickname || null,
      avatarUrl: userData.avatarUrl || null,
      roles: userData.roles || ["user"],
      status: userData.status,
      lastLoginAt: userData.lastLoginAt,
      createdAt: userData.createdAt,
    },
    points: accountData
      ? {
          availablePoints: accountData.availablePoints || 0,
          frozenPoints: accountData.frozenPoints || 0,
          totalRechargedPoints: accountData.totalRechargedPoints || 0,
          totalConsumedPoints: accountData.totalConsumedPoints || 0,
        }
      : { availablePoints: 0, frozenPoints: 0, totalRechargedPoints: 0, totalConsumedPoints: 0 },
  }, requestId);
}

async function getProfile(event, context) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const requestId = context.requestId || Date.now().toString();

  if (!openid) {
    return makeResponse(false, { code: "UNAUTHORIZED", message: "无法获取用户身份" }, requestId);
  }

  let userData;
  let accountData;

  try {
    const userRes = await db.collection("users").doc(openid).get();
    userData = userRes.data;
  } catch (err) {
    return makeResponse(false, { code: "USER_NOT_FOUND", message: "用户不存在" }, requestId);
  }

  try {
    const accountRes = await db.collection("point_accounts").where({ userId: openid }).get();
    accountData = accountRes.data[0] || null;
  } catch (err) {
    accountData = null;
  }

  return makeResponse(true, {
    user: {
      openid: userData.openid,
      unionid: userData.unionid || null,
      nickname: userData.nickname || null,
      avatarUrl: userData.avatarUrl || null,
      roles: userData.roles || ["user"],
      status: userData.status,
      lastLoginAt: userData.lastLoginAt,
      createdAt: userData.createdAt,
    },
    points: accountData
      ? {
          availablePoints: accountData.availablePoints || 0,
          frozenPoints: accountData.frozenPoints || 0,
          totalRechargedPoints: accountData.totalRechargedPoints || 0,
          totalConsumedPoints: accountData.totalConsumedPoints || 0,
        }
      : { availablePoints: 0, frozenPoints: 0, totalRechargedPoints: 0, totalConsumedPoints: 0 },
  }, requestId);
}

exports.main = async (event, context) => {
  const { action } = event;
  const requestId = context.requestId || Date.now().toString();

  if (action === "bootstrap") {
    return bootstrap(event, context);
  }
  if (action === "getProfile") {
    return getProfile(event, context);
  }

  return makeResponse(false, { code: "UNKNOWN_ACTION", message: "未知 action: " + action }, requestId);
};
