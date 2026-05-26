function callCloud(functionName, data) {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: functionName,
      data: data || {},
    }).then((res) => {
      const result = res.result || {};
      if (result.ok) {
        resolve(result.data || {});
      } else {
        const err = result.error || { code: "UNKNOWN", message: "请求失败" };
        reject(new Error(`[${err.code}] ${err.message}`));
      }
    }).catch((err) => {
      reject(new Error(err.message || "网络请求失败"));
    });
  });
}

function toastError(err) {
  const msg = err && err.message ? err.message : "操作失败";
  wx.showToast({ title: msg, icon: "none" });
}

module.exports = {
  // 通用
  callCloud,
  toastError,

  // 用户
  bootstrapUser() {
    return callCloud("coreUser", { action: "bootstrap" });
  },
  getProfile() {
    return callCloud("coreUser", { action: "getProfile" });
  },

  // 应用
  listApps() {
    return callCloud("coreApp", { action: "listApps" });
  },
  getAppDetail(appKey) {
    return callCloud("coreApp", { action: "getAppDetail", appKey });
  },
  createUsage(appKey, inputSummary) {
    return callCloud("coreApp", { action: "createUsage", appKey, inputSummary });
  },
  finishUsage(usageId, resultRef) {
    return callCloud("coreApp", { action: "finishUsage", usageId, resultRef });
  },
  failUsage(usageId, errorCode, errorMessage) {
    return callCloud("coreApp", { action: "failUsage", usageId, errorCode, errorMessage });
  },

  // 积分
  getBalance() {
    return callCloud("corePoints", { action: "getBalance" });
  },
  listTransactions(page, pageSize) {
    return callCloud("corePoints", { action: "listTransactions", page, pageSize });
  },

  // 支付
  listPackages() {
    return callCloud("corePayment", { action: "listPackages" });
  },
  createOrder(packageKey) {
    return callCloud("corePayment", { action: "createOrder", packageKey });
  },
  listOrders(page, pageSize) {
    return callCloud("corePayment", { action: "listOrders", page, pageSize });
  },
  mockPayOrder(orderNo) {
    return callCloud("corePayment", { action: "mockPayOrder", orderNo });
  },

  // 使用记录
  listUsageRecords(page, pageSize) {
    return callCloud("coreApp", { action: "listUsageRecords", page, pageSize });
  },
};
