const api = require("../../../services/api");

const MAX_POLL_COUNT = 60;
const POLL_INTERVAL = 3000;
const MAX_REFERENCE_ASSETS = 8;
const ACTIVE_TASK_STORAGE_KEY = "ai_draw_active_task";

const COMPOSITION_OPTIONS = [
  { key: "half_body", label: "半身", desc: "头像、工作照常用" },
  { key: "full_body", label: "全身", desc: "展示完整制服" },
  { key: "id_photo", label: "证件照", desc: "正面标准构图" },
];

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
  if (err.code === "MISSING_SUBJECT") {
    return "请先上传主体形象照";
  }
  if (err.code === "ASSET_NOT_FOUND" || err.code === "ASSET_FORBIDDEN") {
    return "上传素材不可用，请重新选择照片";
  }
  return stripCloudErrorPrefix(err.rawMessage || err.message) || "生成失败，请重试";
}

function getFilename(filePath, fallback) {
  if (!filePath) return fallback;
  const parts = String(filePath).split("/");
  return parts[parts.length - 1] || fallback;
}

function getAssetPayload(asset) {
  return {
    role: asset.role,
    fileID: asset.fileID,
    cloudPath: asset.cloudPath,
    name: asset.name,
  };
}

Page({
  data: {
    appInfo: null,
    costLabel: "限时免费使用",
    loading: false,
    uploadingSubject: false,
    uploadingReference: false,
    polling: false,
    pollCount: 0,
    imageUrl: "",
    usageId: "",
    jobId: "",
    errorMsg: "",
    taskStatusText: "",
    hasActiveTask: false,
    subjectAsset: null,
    referenceAssets: [],
    compositionOptions: COMPOSITION_OPTIONS,
    composition: "half_body",
    requirements: "",
    canGenerate: false,
  },

  onLoad() {
    this.loadAppInfo();
    if (!this.restoreActiveTask()) {
      this.restoreLatestTask();
    }
  },

  onUnload() {
    this.clearPollTimer();
  },

  onHide() {
    this.clearPollTimer();
  },

  onShow() {
    if (!this.data.jobId) {
      if (!this.restoreActiveTask()) {
        this.restoreLatestTask();
      }
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
      this.setData({
        appInfo: data.app || null,
        costLabel: "限时免费使用",
      });
    } catch (err) {
      console.error("获取应用详情失败:", err);
    }
  },

  refreshCanGenerate() {
    const canGenerate = Boolean(
      this.data.subjectAsset &&
      this.data.subjectAsset.fileID &&
      !this.data.loading &&
      !this.data.polling &&
      !this.data.hasActiveTask &&
      !this.data.uploadingSubject &&
      !this.data.uploadingReference
    );
    this.setData({ canGenerate });
  },

  onCompositionChange(e) {
    this.setData({ composition: e.detail.value || "half_body" });
  },

  onInputRequirements(e) {
    this.setData({ requirements: e.detail.value });
  },

  async chooseSubject() {
    if (this.data.loading || this.data.polling || this.data.hasActiveTask) return;
    try {
      const res = await wx.chooseMedia({
        count: 1,
        mediaType: ["image"],
        sourceType: ["album", "camera"],
        sizeType: ["compressed"],
      });
      const file = res.tempFiles && res.tempFiles[0];
      if (!file || !file.tempFilePath) return;
      const asset = await this.uploadAsset(file.tempFilePath, "subject", getFilename(file.tempFilePath, "subject.jpg"));
      this.setData({
        subjectAsset: asset,
        imageUrl: "",
        errorMsg: "",
      });
      this.refreshCanGenerate();
    } catch (err) {
      if (err && err.errMsg && err.errMsg.indexOf("cancel") !== -1) return;
      console.error("上传主体照失败:", err);
      api.toastError(new Error("主体照上传失败，请重试"));
    }
  },

  async chooseReferences() {
    if (this.data.loading || this.data.polling || this.data.hasActiveTask) return;
    const remain = MAX_REFERENCE_ASSETS - this.data.referenceAssets.length;
    if (remain <= 0) {
      api.toastError(new Error("参考图最多 8 张"));
      return;
    }
    try {
      const res = await wx.chooseMedia({
        count: remain,
        mediaType: ["image"],
        sourceType: ["album", "camera"],
        sizeType: ["compressed"],
      });
      const files = res.tempFiles || [];
      if (!files.length) return;
      const uploaded = [];
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        if (!file || !file.tempFilePath) continue;
        const asset = await this.uploadAsset(
          file.tempFilePath,
          "reference",
          getFilename(file.tempFilePath, `reference-${Date.now()}-${i}.jpg`)
        );
        uploaded.push(asset);
      }
      this.setData({
        referenceAssets: this.data.referenceAssets.concat(uploaded).slice(0, MAX_REFERENCE_ASSETS),
        imageUrl: "",
        errorMsg: "",
      });
      this.refreshCanGenerate();
    } catch (err) {
      if (err && err.errMsg && err.errMsg.indexOf("cancel") !== -1) return;
      console.error("上传参考图失败:", err);
      api.toastError(new Error("参考图上传失败，请重试"));
    }
  },

  async uploadAsset(filePath, role, filename) {
    const uploadingKey = role === "subject" ? "uploadingSubject" : "uploadingReference";
    this.setData({ [uploadingKey]: true });
    this.refreshCanGenerate();
    wx.showLoading({ title: role === "subject" ? "上传主体照..." : "上传参考图..." });
    try {
      const prepared = await api.callCloud("app_ai_draw", {
        action: "prepareUpload",
        role,
        filename,
      });
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath: prepared.cloudPath,
        filePath,
      });
      return {
        role,
        name: filename,
        tempFilePath: filePath,
        cloudPath: prepared.cloudPath,
        fileID: uploadRes.fileID,
      };
    } finally {
      wx.hideLoading();
      this.setData({ [uploadingKey]: false });
      this.refreshCanGenerate();
    }
  },

  removeSubject() {
    if (this.data.loading || this.data.polling || this.data.hasActiveTask) return;
    this.setData({ subjectAsset: null });
    this.refreshCanGenerate();
  },

  removeReference(e) {
    if (this.data.loading || this.data.polling || this.data.hasActiveTask) return;
    const index = Number(e.currentTarget.dataset.index);
    const next = this.data.referenceAssets.filter((_, i) => i !== index);
    this.setData({ referenceAssets: next });
    this.refreshCanGenerate();
  },

  async onCancel() {
    const { usageId, jobId } = this.data;
    if (!usageId || !jobId) return;
    this.clearPollTimer();
    const cancelled = await this.cancelGeneration("用户手动取消");
    this.setData({
      polling: false,
      errorMsg: cancelled ? "已取消生成" : "取消失败，请稍后检查使用记录",
      taskStatusText: "",
      hasActiveTask: !cancelled,
    });
    this.refreshCanGenerate();
  },

  async onGenerate() {
    if (this.generateInFlight || this.data.loading || this.data.polling || this.data.hasActiveTask) {
      this.restoreActiveTask();
      return;
    }
    if (!this.data.subjectAsset || !this.data.subjectAsset.fileID) {
      api.toastError(new Error("请先上传主体形象照"));
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
    this.refreshCanGenerate();

    try {
      const inputSummary = {
        mode: "nurse_portrait",
        subject: true,
        referenceCount: this.data.referenceAssets.length,
        composition: this.data.composition,
      };
      const createData = await api.createUsage("ai_draw", inputSummary);
      const usageId = createData.usageId;
      this.setData({ usageId });

      const genRes = await api.callCloud("app_ai_draw", {
        usageId,
        subjectAsset: getAssetPayload(this.data.subjectAsset),
        referenceAssets: this.data.referenceAssets.map(getAssetPayload),
        options: {
          composition: this.data.composition,
          requirements: this.data.requirements.trim(),
        },
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
      if (err.code === "GENERATION_BUSY") {
        const restored = await this.restoreLatestTask();
        if (restored) {
          return;
        }
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
      this.refreshCanGenerate();
    }
  },

  async restoreLatestTask() {
    if (this.latestTaskInFlight || this.data.polling || this.data.hasActiveTask || this.data.loading) {
      return false;
    }
    this.latestTaskInFlight = true;
    try {
      const latest = await api.callCloud("app_ai_draw", { action: "latest" });
      if (!latest || latest.status === "none") return false;

      if (latest.status === "succeeded" && latest.imageUrl) {
        this.clearActiveTask();
        this.clearPollTimer();
        this.setData({
          usageId: latest.usageId || "",
          jobId: latest.jobId || "",
          imageUrl: latest.imageUrl,
          polling: false,
          loading: false,
          pollCount: 0,
          errorMsg: "",
          taskStatusText: "",
          hasActiveTask: false,
        });
        this.refreshHomeBalance();
        this.refreshCanGenerate();
        return true;
      }

      if (latest.status === "processing" && latest.usageId && latest.jobId) {
        this.saveActiveTask({
          usageId: latest.usageId,
          jobId: latest.jobId,
        });
        this.setData({
          usageId: latest.usageId,
          jobId: latest.jobId,
          polling: true,
          loading: false,
          pollCount: 0,
          errorMsg: "",
          taskStatusText: "正在查看后台生成结果",
          hasActiveTask: true,
        });
        this.startPolling();
        this.refreshCanGenerate();
        return true;
      }
    } catch (err) {
      console.error("恢复护士定妆照任务失败:", err);
    } finally {
      this.latestTaskInFlight = false;
    }
    return false;
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
      this.refreshCanGenerate();
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
        this.refreshCanGenerate();
      } else if (queryRes.status === "failed") {
        this.clearPollTimer();
        this.clearActiveTask();
        this.setData({
          polling: false,
          errorMsg: queryRes.error ? queryRes.error.message : "图片生成失败",
          taskStatusText: "",
          hasActiveTask: false,
        });
        this.refreshCanGenerate();
      }
    } catch (err) {
      console.error("轮询失败:", err);
      this.clearPollTimer();
      const errorMsg = formatGenerationError(err);
      this.clearActiveTask();
      this.setData({
        polling: false,
        usageId: "",
        jobId: "",
        errorMsg,
        taskStatusText: "",
        hasActiveTask: false,
      });
      this.refreshHomeBalance();
      this.refreshCanGenerate();
      if (err && (err.code === "TASK_ALREADY_FAILED" || err.code === "GENERATION_BUSY" || err.code === "GENERATION_SERVICE_UNAVAILABLE")) {
        this.restoreLatestTask();
      }
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
      createdAt: Date.now(),
    });
  },

  clearActiveTask() {
    wx.removeStorageSync(ACTIVE_TASK_STORAGE_KEY);
  },

  restoreActiveTask() {
    const task = wx.getStorageSync(ACTIVE_TASK_STORAGE_KEY);
    if (!task || !task.usageId || !task.jobId) return false;
    this.setData({
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
    this.refreshCanGenerate();
    return true;
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
