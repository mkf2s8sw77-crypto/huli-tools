const api = require("../../../services/api");

const MAX_INPUT_CHARS = 20000;
const MAX_POLL_COUNT = 100;
const POLL_INTERVAL_MS = 3000;

const SECTION_OPTIONS = [
  { key: "abstract", label: "摘要" },
  { key: "intro", label: "引言" },
  { key: "methods", label: "方法" },
  { key: "results", label: "结果" },
  { key: "discussion", label: "讨论" },
  { key: "conclusion", label: "结论" },
  { key: "title", label: "标题" },
];

function decorateSections(selectedKeys) {
  return SECTION_OPTIONS.map((option) => ({
    ...option,
    selected: (selectedKeys || []).indexOf(option.key) !== -1,
  }));
}

Page({
  data: {
    text: "",
    inputChars: 0,
    maxInputChars: MAX_INPUT_CHARS,
    sectionOptions: decorateSections([]),
    autoDetect: true,
    submitting: false,
    polling: false,
    pollCount: 0,
    hasActiveTask: false,
    usageId: null,
    taskStatusText: "",
    resultText: "",
    summary: [],
    degraded: false,
    model: "",
    languageLabel: "",
    errorMsg: "",
  },

  onLoad() {
    this.restoreLatestTask();
  },

  onShow() {
    if (this.data.hasActiveTask && !this.data.polling) {
      this.setData({ polling: true, pollCount: 0 });
      this.startPolling();
    }
  },

  onHide() {
    this.stopPolling();
  },

  onUnload() {
    this.stopPolling();
  },

  onInput(event) {
    const text = event.detail.value || "";
    this.setData({ text, inputChars: text.length });
  },

  onToggleSection(event) {
    const { key } = event.currentTarget.dataset;
    const options = this.data.sectionOptions.map((option) =>
      option.key === key ? { ...option, selected: !option.selected } : option
    );
    const autoDetect = options.every((option) => !option.selected);
    this.setData({ sectionOptions: options, autoDetect });
  },

  selectedSections() {
    return this.data.sectionOptions
      .filter((option) => option.selected)
      .map((option) => option.key);
  },

  async restoreLatestTask() {
    if (this.latestInFlight) return;
    this.latestInFlight = true;
    try {
      const data = await api.callCloud("app_paper_polish", { action: "latest" });
      const task = data && data.task;
      if (!task) return;
      if (task.status === "processing") {
        this.setData({
          usageId: task.usageId,
          hasActiveTask: true,
          polling: true,
          pollCount: 0,
          taskStatusText: "正在恢复未完成的润色任务…",
        });
        this.startPolling();
      } else if (task.status === "succeeded") {
        this.setData({
          usageId: task.usageId,
          resultText: task.resultText || "",
          summary: task.summary || [],
          degraded: Boolean(task.degraded),
          model: task.model || "",
          languageLabel: this.formatLanguage(task.language),
        });
      }
    } catch (err) {
      console.error("恢复润色任务失败:", err);
    } finally {
      this.latestInFlight = false;
    }
  },

  formatLanguage(language) {
    if (language === "zh-to-en") return "中译英";
    if (language === "en") return "英文润色";
    return "";
  },

  async onSubmit() {
    if (this.data.submitting || this.data.polling || this.data.hasActiveTask) return;

    const text = (this.data.text || "").trim();
    if (!text) {
      wx.showToast({ title: "请先粘贴论文草稿", icon: "none" });
      return;
    }
    if (this.data.text.length > MAX_INPUT_CHARS) {
      wx.showToast({ title: "草稿超过字数上限", icon: "none" });
      return;
    }

    this.setData({
      submitting: true,
      errorMsg: "",
      resultText: "",
      summary: [],
      degraded: false,
      model: "",
      taskStatusText: "",
    });

    try {
      const sections = this.selectedSections();
      const usage = await api.createUsage("paper_polish", {
        inputChars: this.data.text.length,
        sections: sections.length ? sections : ["auto"],
      });
      const submitRes = await api.callCloud("app_paper_polish", {
        action: "submit",
        usageId: usage.usageId,
        text: this.data.text,
        sections,
      });
      this.setData({
        submitting: false,
        usageId: submitRes.usageId,
        hasActiveTask: true,
        polling: true,
        pollCount: 0,
        languageLabel: this.formatLanguage(submitRes.language),
        taskStatusText: "润色任务已提交，正在生成…",
      });
      this.startPolling();
    } catch (err) {
      this.setData({ submitting: false, errorMsg: err.message || "提交失败，请稍后重试" });
      api.toastError(err);
    }
  },

  startPolling() {
    this.stopPolling();
    this.pollTimer = setInterval(() => {
      this.pollQuery();
    }, POLL_INTERVAL_MS);
  },

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  },

  async pollQuery() {
    const { usageId, pollCount } = this.data;
    if (!usageId) {
      this.stopPolling();
      this.setData({ polling: false, hasActiveTask: false });
      return;
    }
    if (pollCount >= MAX_POLL_COUNT) {
      // 只停止轮询，任务仍在后台执行，重新进入页面时可恢复
      this.stopPolling();
      this.setData({
        polling: false,
        taskStatusText: "等待时间较长，任务仍在后台润色，稍后重新进入本页可查看结果",
      });
      return;
    }
    this.setData({ pollCount: pollCount + 1 });

    try {
      const task = await api.callCloud("app_paper_polish", {
        action: "query",
        usageId,
      });
      if (task.status === "processing") {
        this.setData({
          taskStatusText: pollCount < 20 ? "正在润色，通常需要 1-3 分钟…" : "内容较长，仍在润色中…",
        });
        return;
      }
      this.stopPolling();
      if (task.status === "succeeded") {
        this.setData({
          polling: false,
          hasActiveTask: false,
          taskStatusText: "",
          resultText: task.resultText || "",
          summary: task.summary || [],
          degraded: Boolean(task.degraded),
          model: task.model || "",
          languageLabel: this.formatLanguage(task.language),
        });
      } else {
        this.setData({
          polling: false,
          hasActiveTask: false,
          taskStatusText: "",
          errorMsg: task.errorMessage || "润色失败，请重新提交",
        });
      }
    } catch (err) {
      this.stopPolling();
      this.setData({
        polling: false,
        hasActiveTask: false,
        errorMsg: err.message || "查询任务状态失败",
      });
    }
  },

  onCopyResult() {
    if (!this.data.resultText) return;
    wx.setClipboardData({
      data: this.data.resultText,
      success: () => {
        wx.showToast({ title: "已复制成稿", icon: "success" });
      },
    });
  },

  onReset() {
    this.stopPolling();
    this.setData({
      text: "",
      inputChars: 0,
      sectionOptions: decorateSections([]),
      autoDetect: true,
      submitting: false,
      polling: false,
      pollCount: 0,
      hasActiveTask: false,
      usageId: null,
      taskStatusText: "",
      resultText: "",
      summary: [],
      degraded: false,
      model: "",
      languageLabel: "",
      errorMsg: "",
    });
  },
});
