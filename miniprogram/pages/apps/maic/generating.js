const api = require("../../../services/api");

const ACTIVE_TASK_KEY = "maic_active_usage_id";
const POLL_INTERVAL = 5000;

const STATUS_TEXT = {
  submit_pending: "正在连接 MAIC 生成服务",
  queued: "任务已排队",
  processing: "MiniMax M3 正在编排课程",
  importing: "正在把课程导入云开发",
  succeeded: "课程已生成",
  failed: "生成失败",
  cancelled: "任务已取消",
  timed_out: "生成超时",
};

Page({
  data: {
    usageId: "",
    status: "submit_pending",
    statusText: "正在提交任务",
    progress: 1,
    errorMsg: "",
    courseId: "",
    cancelling: false,
  },

  onLoad(options) {
    const usageId = decodeURIComponent(options.usageId || "");
    this.setData({ usageId });
    if (!usageId) {
      this.setData({ errorMsg: "缺少任务编号" });
      return;
    }
    wx.setStorageSync(ACTIVE_TASK_KEY, usageId);
    this.poll();
  },

  onShow() {
    if (this.data.usageId && !this.timer && !this.isTerminal(this.data.status)) this.schedule(300);
  },

  onHide() {
    this.clearTimer();
  },

  onUnload() {
    this.clearTimer();
  },

  isTerminal(status) {
    return ["succeeded", "failed", "cancelled", "timed_out"].includes(status);
  },

  clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  },

  schedule(delay) {
    this.clearTimer();
    this.timer = setTimeout(() => this.poll(), delay || POLL_INTERVAL);
  },

  async poll() {
    this.clearTimer();
    try {
      const data = await api.getMaicTask(this.data.usageId);
      const task = data.task || {};
      const terminal = this.isTerminal(task.status);
      this.setData({
        status: task.status,
        statusText: STATUS_TEXT[task.status] || "正在处理课程",
        progress: Number(task.progress || 0),
        errorMsg: task.error ? task.error.message : "",
        courseId: task.courseId || "",
      });
      if (terminal) {
        wx.removeStorageSync(ACTIVE_TASK_KEY);
        if (task.status === "succeeded" && task.courseId) {
          this.scheduleOpenCourse(task.courseId);
        }
        return;
      }
      this.schedule(POLL_INTERVAL);
    } catch (err) {
      this.setData({ errorMsg: err.rawMessage || err.message || "查询任务失败" });
      this.schedule(10000);
    }
  },

  scheduleOpenCourse(courseId) {
    if (this.opening) return;
    this.opening = true;
    setTimeout(() => {
      wx.redirectTo({ url: `/pages/apps/maic/course?courseId=${encodeURIComponent(courseId)}` });
    }, 700);
  },

  async cancelTask() {
    if (this.data.cancelling || this.isTerminal(this.data.status)) return;
    const confirmed = await new Promise((resolve) => {
      wx.showModal({ title: "取消生成", content: "取消后会释放本次冻结的积分。", success: (res) => resolve(res.confirm) });
    });
    if (!confirmed) return;
    this.setData({ cancelling: true });
    try {
      const data = await api.cancelMaicTask(this.data.usageId);
      const task = data.task || {};
      wx.removeStorageSync(ACTIVE_TASK_KEY);
      this.setData({ status: task.status || "cancelled", statusText: "任务已取消", progress: 100 });
    } catch (err) {
      api.toastError(err);
      this.schedule(1000);
    } finally {
      this.setData({ cancelling: false });
    }
  },

  backToCourses() {
    wx.navigateBack({ delta: 1 });
  },
});
