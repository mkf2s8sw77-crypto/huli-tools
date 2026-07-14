const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const token = process.env.INTERNAL_API_SECRET || "";
  if (!token) {
    return { ok: false, error: { code: "INTERNAL_SECRET_NOT_CONFIGURED", message: "内部调用凭据未配置" }, requestId: context.requestId };
  }
  try {
    const res = await cloud.callFunction({
      name: "app_maic",
      data: { action: "reconcileBatch", _internalToken: token },
    });
    return res.result || { ok: false, error: { code: "EMPTY_RESULT", message: "协调函数未返回结果" } };
  } catch (err) {
    return { ok: false, error: { code: "RECONCILE_CALL_FAILED", message: err.message || "协调调用失败" }, requestId: context.requestId };
  }
};
