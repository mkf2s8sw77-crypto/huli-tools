const api = require("../../../services/api");

Page({
  data: {
    courseId: "",
    loading: true,
    course: null,
    progress: {},
    deleting: false,
  },

  onLoad(options) {
    this.setData({ courseId: decodeURIComponent(options.courseId || "") });
  },

  onShow() {
    if (this.data.courseId) this.loadCourse();
  },

  async loadCourse() {
    this.setData({ loading: true });
    try {
      const [courseData, progressData] = await Promise.all([
        api.getMaicCourse(this.data.courseId),
        api.getMaicProgress(this.data.courseId),
      ]);
      this.setData({ course: courseData.course || null, progress: progressData.progress || {} });
    } catch (err) {
      api.toastError(err);
    } finally {
      this.setData({ loading: false });
    }
  },

  startLearning() {
    wx.navigateTo({ url: `/pages/apps/maic/player?courseId=${encodeURIComponent(this.data.courseId)}` });
  },

  async deleteCourse() {
    if (this.data.deleting) return;
    const confirmed = await new Promise((resolve) => {
      wx.showModal({ title: "删除课程", content: "课程、学习进度和云存储媒体会一并删除，且无法恢复。", confirmColor: "#B66A6A", success: (res) => resolve(res.confirm) });
    });
    if (!confirmed) return;
    this.setData({ deleting: true });
    try {
      await api.deleteMaicCourse(this.data.courseId);
      wx.showToast({ title: "已删除", icon: "success" });
      setTimeout(() => wx.navigateBack({ delta: 1 }), 500);
    } catch (err) {
      api.toastError(err);
    } finally {
      this.setData({ deleting: false });
    }
  },
});
