const api = require("../../services/api");

const TILE_CLASS_MAP = {
  ai_draw: "tile--photo",
  nursing_undercover: "tile--game",
  maic: "tile--maic",
  demo_sum: "tile--plain",
};

const TILE_TAG_MAP = {
  ai_draw: "HOT",
  nursing_undercover: "教学游戏",
  maic: "AI 课堂",
};

function decorateApp(app) {
  const pricing = app.pricing || null;
  const costPoints =
    pricing && pricing.mode === "fixed" ? Number(pricing.costPoints) || 0 : 0;
  const tag = TILE_TAG_MAP[app.appKey] || (app.status === "coming_soon" ? "即将上线" : "");
  return {
    ...app,
    tileClass: TILE_CLASS_MAP[app.appKey] || "tile--plain",
    tag,
    tagHot: tag === "HOT",
    priceText: costPoints > 0 ? `${costPoints} 积分/次` : "免费",
    priceFree: costPoints <= 0,
  };
}

Page({
  data: {
    loading: true,
    error: null,
    apps: [],
    userSummary: {
      points: { availablePoints: 0 },
    },
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
      const [userSummary, appsData] = await Promise.all([
        api.bootstrapUser(),
        api.listApps(),
      ]);

      this.setData({
        apps: (appsData.apps || []).map(decorateApp),
        userSummary: userSummary || { points: { availablePoints: 0 } },
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
});
