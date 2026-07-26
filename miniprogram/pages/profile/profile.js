const api = require("../../services/api");

function maskOpenid(openid) {
  if (!openid || openid.length < 8) return openid || "-";
  return `${openid.slice(0, 4)}****${openid.slice(-4)}`;
}

Page({
  data: {
    loading: false,
    user: null,
    points: {
      availablePoints: 0,
      totalRechargedPoints: 0,
      totalConsumedPoints: 0,
    },
    maskedOpenid: "",
  },

  onLoad() {
    this.loadProfile();
  },

  onShow() {
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar) {
      tabBar.setData({ selected: 1 });
    }
    this.loadProfile();
  },

  async loadProfile() {
    this.setData({ loading: true });
    try {
      const data = await api.getProfile();
      const user = data.user || null;
      this.setData({
        user,
        points: data.points || {
          availablePoints: 0,
          totalRechargedPoints: 0,
          totalConsumedPoints: 0,
        },
        maskedOpenid: maskOpenid(user ? user.openid : ""),
        loading: false,
      });
    } catch (err) {
      api.toastError(err);
      this.setData({ loading: false });
    }
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
