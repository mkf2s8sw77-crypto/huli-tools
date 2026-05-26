const api = require("../../../services/api");

Page({
  data: {
    a: "",
    b: "",
    result: null,
    loading: false,
    error: null,
    usageId: null,
    costPoints: null,
    appInfo: null,
    triggerFail: false,
  },

  async onLoad() {
    this.loadAppInfo();
  },

  async loadAppInfo() {
    try {
      const data = await api.getAppDetail("demo_sum");
      this.setData({ appInfo: data.app || null });
    } catch (err) {
      console.error("获取应用详情失败:", err);
    }
  },

  onInputA(e) {
    this.setData({ a: e.detail.value });
  },

  onInputB(e) {
    this.setData({ b: e.detail.value });
  },

  onToggleFail(e) {
    this.setData({ triggerFail: e.detail.value });
  },

  async onCalc() {
    const a = this.data.a;
    const b = this.data.b;
    const triggerFail = this.data.triggerFail;

    this.setData({ loading: true, error: null, result: null, usageId: null, costPoints: null });

    try {
      // 1. 创建使用记录并冻结积分
      const createData = await api.createUsage("demo_sum", { a, b });
      const usageId = createData.usageId;
      const costPoints = createData.costPoints;
      this.setData({ usageId, costPoints });

      // 2. 调用示例工具
      const sumRes = await api.callCloud("demoSum", { usageId, a, b, triggerFail });

      this.setData({
        result: sumRes.result,
        loading: false,
      });

      // 成功后刷新首页余额
      const pages = getCurrentPages();
      const home = pages.find((p) => p.route === "pages/index/index");
      if (home && home.loadHomeData) {
        home.loadHomeData();
      }
    } catch (err) {
      console.error("计算失败:", err);
      this.setData({
        error: err.message || "计算失败",
        loading: false,
      });
    }
  },
});
