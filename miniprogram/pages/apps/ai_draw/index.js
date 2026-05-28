const api = require("../../../services/api");

const MAX_POLL_COUNT = 60;
const POLL_INTERVAL = 3000;

Page({
  data: {
    prompt: "",
    appInfo: null,
    loading: false,
    polling: false,
    pollCount: 0,
    imageUrl: "",
    usageId: "",
    jobId: "",
    errorMsg: "",
  },

  onLoad() {
    this.loadAppInfo();
  },

  async onUnload() {
    await this.cancelIfPolling();
  },

  async cancelIfPolling() {
    if (this.data.polling && this.data.usageId) {
      try {
        await api.callCloud("app_ai_draw", {
          usageId: this.data.usageId,
          action: "fail",
          errorCode: "USER_CANCEL",
          errorMessage: "用户离开页面",
        });
      } catch (err) {
        console.error("离开页面释放积分失败:", err);
      }
    }
    this.clearPollTimer();
  },

  async loadAppInfo() {
    try {
      const data = await api.getAppDetail("ai_draw");
      this.setData({ appInfo: data.app || null });
    } catch (err) {
      console.error("获取应用详情失败:", err);
    }
  },

  onInputPrompt(e) {
    this.setData({ prompt: e.detail.value });
  },

  async onCancel() {
    const { usageId, polling } = this.data;
    if (!polling || !usageId) return;
    this.clearPollTimer();
    try {
      await api.callCloud("app_ai_draw", {
        usageId,
        action: "fail",
        errorCode: "USER_CANCEL",
        errorMessage: "用户手动取消",
      });
      this.setData({
        polling: false,
        errorMsg: "已取消生成",
      });
    } catch (err) {
      console.error("取消失败:", err);
      this.setData({
        polling: false,
        errorMsg: "取消失败: " + (err.message || "未知错误"),
      });
    }
  },

  async onGenerate() {
    const prompt = this.data.prompt.trim();
    if (!prompt) {
      api.toastError(new Error("请输入绘图描述"));
      return;
    }

    this.clearPollTimer();
    this.setData({
      loading: true,
      polling: false,
      pollCount: 0,
      imageUrl: "",
      usageId: "",
      jobId: "",
      errorMsg: "",
    });

    try {
      const createData = await api.createUsage("ai_draw", { prompt });
      const usageId = createData.usageId;
      this.setData({ usageId });

      const genRes = await api.callCloud("app_ai_draw", {
        usageId,
        prompt,
        action: "generate",
      });

      if (genRes.status === "succeeded") {
        this.setData({
          imageUrl: genRes.imageUrl,
          loading: false,
        });
        this.refreshHomeBalance();
      } else if (genRes.status === "processing") {
        this.setData({
          jobId: genRes.jobId,
          polling: true,
          loading: false,
        });
        this.startPolling();
      } else {
        throw new Error("未知响应状态");
      }
    } catch (err) {
      console.error("生成失败:", err);
      this.setData({
        errorMsg: err.message || "生成失败，请重试",
        loading: false,
        polling: false,
      });
      api.toastError(err);
    }
  },

  startPolling() {
    this.pollTimer = setInterval(() => {
      this.pollQuery();
    }, POLL_INTERVAL);
  },

  async pollQuery() {
    const { jobId, usageId, pollCount } = this.data;
    if (!jobId || pollCount >= MAX_POLL_COUNT) {
      this.clearPollTimer();
      if (pollCount >= MAX_POLL_COUNT && usageId) {
        try {
          await api.callCloud("app_ai_draw", {
            usageId,
            action: "fail",
            errorCode: "POLL_TIMEOUT",
            errorMessage: "前端轮询超时",
          });
        } catch (failErr) {
          console.error("超时释放积分失败:", failErr);
        }
      }
      this.setData({
        polling: false,
        errorMsg: pollCount >= MAX_POLL_COUNT ? "生成超时，请重试" : "",
      });
      return;
    }

    this.setData({ pollCount: pollCount + 1 });

    try {
      const queryRes = await api.callCloud("app_ai_draw", {
        jobId,
        usageId,
        action: "query",
      });

      if (queryRes.status === "succeeded") {
        this.clearPollTimer();
        this.setData({
          imageUrl: queryRes.imageUrl,
          polling: false,
        });
        this.refreshHomeBalance();
      } else if (queryRes.status === "failed") {
        this.clearPollTimer();
        this.setData({
          polling: false,
          errorMsg: queryRes.error ? queryRes.error.message : "图片生成失败",
        });
      }
    } catch (err) {
      console.error("轮询失败:", err);
    }
  },

  clearPollTimer() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  },

  refreshHomeBalance() {
    const pages = getCurrentPages();
    const home = pages.find((p) => p.route === "pages/index/index");
    if (home && home.loadHomeData) {
      home.loadHomeData();
    }
  },

  async onSaveImage() {
    const imageUrl = this.data.imageUrl;
    if (!imageUrl) return;

    try {
      const settingRes = await wx.getSetting();
      const authSetting = settingRes.authSetting || {};

      if (authSetting["scope.writePhotosAlbum"] === false) {
        wx.showModal({
          title: "权限提示",
          content: "需要相册权限才能保存图片",
          confirmText: "去设置",
          success: (modalRes) => {
            if (modalRes.confirm) {
              wx.openSetting();
            }
          },
        });
        return;
      }

      if (!authSetting["scope.writePhotosAlbum"]) {
        try {
          await wx.authorize({ scope: "scope.writePhotosAlbum" });
        } catch (authErr) {
          wx.showModal({
            title: "权限提示",
            content: "需要相册权限才能保存图片",
            confirmText: "去设置",
            success: (modalRes) => {
              if (modalRes.confirm) {
                wx.openSetting();
              }
            },
          });
          return;
        }
      }

      wx.showLoading({ title: "保存中..." });
      const downloadRes = await wx.downloadFile({ url: imageUrl });
      if (downloadRes.statusCode !== 200) {
        throw new Error("下载图片失败");
      }
      await wx.saveImageToPhotosAlbum({ filePath: downloadRes.tempFilePath });
      wx.hideLoading();
      wx.showToast({ title: "已保存到相册", icon: "success" });
    } catch (err) {
      wx.hideLoading();
      console.error("保存失败:", err);
      api.toastError(err);
    }
  },
});
