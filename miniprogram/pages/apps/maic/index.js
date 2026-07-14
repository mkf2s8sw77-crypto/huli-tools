const api = require("../../../services/api");

const ACTIVE_TASK_KEY = "maic_active_usage_id";

Page({
  data: {
    appInfo: null,
    topic: "",
    audience: "",
    durationMinutes: 10,
    requirements: "",
    loading: false,
    coursesLoading: true,
    courses: [],
    empty: false,
    activeUsageId: "",
  },

  onLoad() {
    this.loadAppInfo();
  },

  onShow() {
    this.setData({ activeUsageId: wx.getStorageSync(ACTIVE_TASK_KEY) || "" });
    this.loadCourses();
  },

  async loadAppInfo() {
    try {
      const data = await api.getAppDetail("maic");
      this.setData({ appInfo: data.app || null });
    } catch (err) {
      console.error("获取 MAIC 应用信息失败:", err);
    }
  },

  async loadCourses() {
    this.setData({ coursesLoading: true });
    try {
      const data = await api.listMaicCourses(1, 20);
      const courses = data.list || [];
      this.setData({ courses, empty: courses.length === 0 });
    } catch (err) {
      this.setData({ empty: true });
      console.error("加载课程失败:", err);
    } finally {
      this.setData({ coursesLoading: false });
    }
  },

  onTopicInput(e) {
    this.setData({ topic: e.detail.value });
  },

  onAudienceInput(e) {
    this.setData({ audience: e.detail.value });
  },

  onRequirementsInput(e) {
    this.setData({ requirements: e.detail.value });
  },

  onDurationChange(e) {
    this.setData({ durationMinutes: Number(e.detail.value) || 10 });
  },

  resumeTask() {
    if (!this.data.activeUsageId) return;
    wx.navigateTo({ url: `/pages/apps/maic/generating?usageId=${encodeURIComponent(this.data.activeUsageId)}` });
  },

  async createCourse() {
    if (this.data.loading) return;
    const topic = (this.data.topic || "").trim();
    if (topic.length < 2) {
      api.toastError(new Error("请填写至少 2 个字的课程主题"));
      return;
    }
    this.setData({ loading: true });
    try {
      const usage = await api.createUsage("maic", {
        topic,
        durationMinutes: this.data.durationMinutes,
      });
      const created = await api.createMaicTask({
        usageId: usage.usageId,
        topic,
        audience: (this.data.audience || "").trim(),
        durationMinutes: this.data.durationMinutes,
        requirements: (this.data.requirements || "").trim(),
      });
      wx.setStorageSync(ACTIVE_TASK_KEY, usage.usageId);
      this.setData({ activeUsageId: usage.usageId });
      wx.navigateTo({ url: `/pages/apps/maic/generating?usageId=${encodeURIComponent(usage.usageId)}` });
      if (created.task && created.task.status === "succeeded") {
        wx.removeStorageSync(ACTIVE_TASK_KEY);
      }
    } catch (err) {
      api.toastError(err);
    } finally {
      this.setData({ loading: false });
    }
  },

  openCourse(e) {
    const courseId = e.currentTarget.dataset.id;
    if (courseId) wx.navigateTo({ url: `/pages/apps/maic/course?courseId=${encodeURIComponent(courseId)}` });
  },
});
