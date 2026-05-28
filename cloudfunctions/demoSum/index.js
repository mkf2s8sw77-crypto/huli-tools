const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const APP_KEY = "demo_sum";

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
  if (!token) {
    return data;
  }
  return {
    ...data,
    _internalToken: token,
    userId: openid,
  };
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const requestId = context.requestId || Date.now().toString();
  const { usageId, a, b } = event;

  if (!openid) {
    return makeResponse(false, { code: "UNAUTHORIZED", message: "无法获取用户身份" }, requestId);
  }
  if (!usageId) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "缺少 usageId" }, requestId);
  }

  // 查询并校验 usage
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
  if (usage.userId !== openid) {
    return makeResponse(false, { code: "FORBIDDEN", message: "无权操作该使用记录" }, requestId);
  }
  if (usage.appKey !== APP_KEY) {
    return makeResponse(false, { code: "APP_MISMATCH", message: "使用记录不属于积分示例工具" }, requestId);
  }
  if (usage.status !== "frozen" && usage.status !== "created") {
    return makeResponse(false, { code: "INVALID_STATUS", message: "使用记录状态不可执行" }, requestId);
  }

  // 模拟失败场景：调试参数 triggerFail
  if (event.triggerFail) {
    try {
      const failRes = await cloud.callFunction({
        name: "coreApp",
        data: buildUsageActionData(openid, {
          action: "failUsage",
          usageId,
          errorCode: "DEMO_FAIL",
          errorMessage: "模拟业务失败",
        }),
      });
      const failResult = failRes.result;
      if (!failResult || !failResult.ok) {
        const errCode = failResult && failResult.error ? failResult.error.code : "FAIL_USAGE_FAILED";
        const errMsg = failResult && failResult.error ? failResult.error.message : "释放积分失败";
        return makeResponse(false, { code: errCode, message: errMsg }, requestId);
      }
    } catch (err) {
      return makeResponse(false, { code: "FAIL_USAGE_FAILED", message: "释放积分调用失败: " + err.message }, requestId);
    }
    return makeResponse(false, { code: "DEMO_FAIL", message: "模拟业务失败，积分已释放" }, requestId);
  }

  // 业务逻辑：求和
  const numA = Number(a);
  const numB = Number(b);
  if (Number.isNaN(numA) || Number.isNaN(numB)) {
    try {
      const failRes = await cloud.callFunction({
        name: "coreApp",
        data: buildUsageActionData(openid, {
          action: "failUsage",
          usageId,
          errorCode: "INVALID_INPUT",
          errorMessage: "输入必须是数字",
        }),
      });
      const failResult = failRes.result;
      if (!failResult || !failResult.ok) {
        const errCode = failResult && failResult.error ? failResult.error.code : "FAIL_USAGE_FAILED";
        const errMsg = failResult && failResult.error ? failResult.error.message : "释放积分失败";
        return makeResponse(false, { code: errCode, message: errMsg }, requestId);
      }
    } catch (err) {
      return makeResponse(false, { code: "FAIL_USAGE_FAILED", message: "释放积分调用失败: " + err.message }, requestId);
    }
    return makeResponse(false, { code: "INVALID_INPUT", message: "输入必须是数字" }, requestId);
  }

  const result = numA + numB;

  // 业务成功，结算 usage
  try {
    const finishRes = await cloud.callFunction({
      name: "coreApp",
      data: buildUsageActionData(openid, {
        action: "finishUsage",
        usageId,
        resultRef: `${numA} + ${numB} = ${result}`,
      }),
    });
    const finishResult = finishRes.result;
    if (!finishResult || !finishResult.ok) {
      const errCode = finishResult && finishResult.error ? finishResult.error.code : "FINISH_FAILED";
      const errMsg = finishResult && finishResult.error ? finishResult.error.message : "结算失败";
      return makeResponse(false, { code: errCode, message: errMsg }, requestId);
    }
  } catch (err) {
    return makeResponse(false, { code: "FINISH_FAILED", message: "结算调用失败: " + err.message }, requestId);
  }

  return makeResponse(true, { result, usageId }, requestId);
};
