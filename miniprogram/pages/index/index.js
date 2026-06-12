const api = require("../../services/api");

const APP_ICON_CLASS_MAP = {
  demo_sum: "icon-tile--lavender icon-tile--calculator",
  ai_draw: "icon-tile--peach icon-tile--image",
  nursing_undercover: "icon-tile--lavender icon-tile--undercover",
};

function decorateApp(app) {
  return {
    ...app,
    iconClass: APP_ICON_CLASS_MAP[app.appKey] || "icon-tile--teal icon-tile--toolbox",
  };
}

Page({
  data: {
    loading: true,
    error: null,
    userSummary: null,
    apps: [],
  },

  onLoad() {
    this.loadHomeData();
  },

  onShow() {
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar) {
      tabBar.setData({ selected: 0 });
    }
  },

  async loadHomeData() {
    this.setData({ loading: true, error: null });

    try {
      const [userData, appsData] = await Promise.all([
        api.bootstrapUser(),
        api.listApps(),
      ]);

      this.setData({
        userSummary: userData || null,
        apps: (appsData.apps || []).map(decorateApp),
        loading: false,
      });
    } catch (err) {
      console.error("首页数据加载失败:", err);
      this.setData({
        error: err.message || "加载失败，请稍后重试",
        loading: false,
      });
    }
  },

  onTapApp(event) {
    const { app } = event.currentTarget.dataset;
    if (!app || !app.entryPage) {
      wx.showToast({ title: "应用入口未配置", icon: "none" });
      return;
    }
    if (app.status !== "active") {
      wx.showToast({ title: "该应用暂未开放", icon: "none" });
      return;
    }
    wx.navigateTo({
      url: app.entryPage,
      fail: () => {
        wx.showToast({ title: "页面跳转失败", icon: "none" });
      },
    });
  },

  onGoRecharge() {
    wx.navigateTo({ url: "/pages/recharge/recharge" });
  },

  onGoOrders() {
    wx.navigateTo({ url: "/pages/orders/orders" });
  },

  onGoTransactions() {
    wx.navigateTo({ url: "/pages/transactions/transactions" });
  },

  onGoUsageRecords() {
    wx.navigateTo({ url: "/pages/usage-records/usage-records" });
  },
});
