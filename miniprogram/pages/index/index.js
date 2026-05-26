Page({
  data: {
    message: "欢迎使用沪里工具",
    userInfo: null,
  },

  onLoad() {
    this.getUserInfo();
  },

  async getUserInfo() {
    try {
      const { result } = await wx.cloud.callFunction({
        name: "getOpenId",
      });
      this.setData({
        userInfo: {
          openid: result.openid,
        },
      });
    } catch (err) {
      console.error("获取用户信息失败:", err);
    }
  },
});
