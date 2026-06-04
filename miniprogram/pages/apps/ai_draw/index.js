const api = require("../../../services/api");

const MAX_POLL_COUNT = 60;
const POLL_INTERVAL = 3000;
const ACTIVE_TASK_STORAGE_KEY = "ai_draw_active_task";

function stripCloudErrorPrefix(message) {
  return (message || "").replace(/^\[[^\]]+\]\s*/, "");
}

function formatGenerationError(err) {
  if (!err) return "生成失败，请重试";
  if (err.code === "GENERATION_BUSY") {
    return "生图服务正在处理上一张图片，请稍后再试";
  }
  if (err.code === "GENERATION_SERVICE_UNAVAILABLE") {
    return "生图服务暂时不可用，请稍后再试";
  }
  return stripCloudErrorPrefix(err.rawMessage || err.message) || "生成失败，请重试";
}

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
    taskStatusText: "",
    hasActiveTask: false,
  },

  onLoad() {
    this.loadAppInfo();
    this.restoreActiveTask();
  },

  onUnload() {
    this.clearPollTimer();
  },

  onHide() {
    this.clearPollTimer();
  },

  onShow() {
    if (!this.data.jobId) {
      this.restoreActiveTask();
      return;
    }
    if ((this.data.polling || this.data.hasActiveTask) && !this.pollTimer) {
      this.setData({ polling: true });
      this.startPolling();
    }
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
    const { usageId, jobId, polling } = this.data;
    if (!usageId || !jobId) return;
    this.clearPollTimer();
    const cancelled = await this.cancelGeneration("用户手动取消");
    this.setData({
      polling: false,
      errorMsg: cancelled ? "已取消生成" : "取消失败，请稍后检查积分流水",
      taskStatusText: "",
      hasActiveTask: !cancelled,
    });
  },

  async onGenerate() {
    if (this.generateInFlight || this.data.loading || this.data.polling || this.data.hasActiveTask) {
      this.restoreActiveTask();
      return;
    }
    const prompt = this.data.prompt.trim();
    if (!prompt) {
      api.toastError(new Error("请输入绘图描述"));
      return;
    }

    this.generateInFlight = true;
    this.clearPollTimer();
    this.setData({
      loading: true,
      polling: false,
      pollCount: 0,
      imageUrl: "",
      usageId: "",
      jobId: "",
      errorMsg: "",
      taskStatusText: "",
      hasActiveTask: false,
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
        this.clearActiveTask();
        this.setData({
          usageId,
          imageUrl: genRes.imageUrl,
          jobId: genRes.jobId || "",
          loading: false,
          hasActiveTask: false,
          taskStatusText: "",
        });
        this.refreshHomeBalance();
      } else if (genRes.status === "processing") {
        const activeUsageId = genRes.usageId || usageId;
        this.saveActiveTask({
          usageId: activeUsageId,
          jobId: genRes.jobId,
          prompt,
        });
        this.setData({
          usageId: activeUsageId,
          jobId: genRes.jobId,
          polling: true,
          loading: false,
          taskStatusText: "任务已提交，正在后台生成",
          hasActiveTask: true,
        });
        this.startPolling();
      } else {
        throw new Error("未知响应状态");
      }
    } catch (err) {
      console.error("生成失败:", err);
      const errorMsg = formatGenerationError(err);
      const activeTask = wx.getStorageSync(ACTIVE_TASK_STORAGE_KEY);
      if (err.code === "GENERATION_BUSY" && activeTask && activeTask.usageId && activeTask.jobId) {
        this.generateInFlight = false;
        this.restoreActiveTask();
        return;
      }
      this.setData({
        errorMsg,
        loading: false,
        polling: false,
        taskStatusText: "",
      });
      api.toastError(new Error(errorMsg));
    } finally {
      this.generateInFlight = false;
    }
  },

  startPolling() {
    this.clearPollTimer();
    this.pollTimer = setInterval(() => {
      this.pollQuery();
    }, POLL_INTERVAL);
  },

  async pollQuery() {
    const { jobId, usageId, pollCount } = this.data;
    if (!jobId || pollCount >= MAX_POLL_COUNT) {
      this.clearPollTimer();
      this.setData({
        polling: false,
        errorMsg: pollCount >= MAX_POLL_COUNT
          ? "任务仍在后台生成，可稍后返回本页查看"
          : "",
        taskStatusText: pollCount >= MAX_POLL_COUNT ? "任务仍在后台生成" : "",
        hasActiveTask: pollCount >= MAX_POLL_COUNT,
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
        this.clearActiveTask();
        this.setData({
          imageUrl: queryRes.imageUrl,
          polling: false,
          taskStatusText: "",
          hasActiveTask: false,
        });
        this.refreshHomeBalance();
      } else if (queryRes.status === "failed") {
        this.clearPollTimer();
        this.clearActiveTask();
        this.setData({
          polling: false,
          errorMsg: queryRes.error ? queryRes.error.message : "图片生成失败",
          taskStatusText: "",
          hasActiveTask: false,
        });
      }
    } catch (err) {
      console.error("轮询失败:", err);
      this.clearPollTimer();
      const errorMsg = formatGenerationError(err);
      this.clearActiveTask();
      this.setData({
        polling: false,
        errorMsg,
        taskStatusText: "",
        hasActiveTask: false,
      });
      this.refreshHomeBalance();
    }
  },

  async cancelGeneration(reason) {
    const { jobId, usageId } = this.data;
    if (!jobId || !usageId) return false;
    try {
      await api.callCloud("app_ai_draw", {
        action: "cancel",
        jobId,
        usageId,
        reason,
      });
      this.clearActiveTask();
      this.refreshHomeBalance();
      return true;
    } catch (err) {
      console.error("取消生成失败:", err);
      return false;
    }
  },

  saveActiveTask(task) {
    if (!task || !task.usageId || !task.jobId) return;
    wx.setStorageSync(ACTIVE_TASK_STORAGE_KEY, {
      usageId: task.usageId,
      jobId: task.jobId,
      prompt: task.prompt || this.data.prompt,
      createdAt: Date.now(),
    });
  },

  clearActiveTask() {
    wx.removeStorageSync(ACTIVE_TASK_STORAGE_KEY);
  },

  restoreActiveTask() {
    const task = wx.getStorageSync(ACTIVE_TASK_STORAGE_KEY);
    if (!task || !task.usageId || !task.jobId) return;
    this.setData({
      prompt: task.prompt || this.data.prompt,
      usageId: task.usageId,
      jobId: task.jobId,
      polling: true,
      loading: false,
      pollCount: 0,
      errorMsg: "",
      taskStatusText: "正在查看后台生成结果",
      hasActiveTask: true,
    });
    this.startPolling();
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
