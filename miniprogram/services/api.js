function createCloudError(err) {
  const code = err.code || "UNKNOWN";
  const rawMessage = err.message || "请求失败";
  const error = new Error(`[${code}] ${rawMessage}`);
  error.code = code;
  error.rawMessage = rawMessage;
  error.detail = err;
  return error;
}

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
        reject(createCloudError(err));
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
  getOrder(orderNo) {
    return callCloud("corePayment", { action: "getOrder", orderNo });
  },
  mockPayOrder(orderNo) {
    return callCloud("corePayment", { action: "mockPayOrder", orderNo });
  },
  createVirtualOrder(packageKey, code) {
    return callCloud("corePayment", { action: "createVirtualOrder", packageKey, code });
  },
  confirmVirtualOrder(orderNo) {
    return callCloud("corePayment", { action: "confirmVirtualOrder", orderNo });
  },

  // 使用记录
  listUsageRecords(page, pageSize) {
    return callCloud("coreApp", { action: "listUsageRecords", page, pageSize });
  },
};
