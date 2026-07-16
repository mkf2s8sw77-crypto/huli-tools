const api = require("../../../services/api");

const MODE_LABELS = {
  word_undercover: "词语卧底",
  case_reasoning: "病例推理卧底",
};

const DIFFICULTY_LABELS = {
  student: "护理学生",
  new_nurse: "新护士规培",
  specialist: "专科护士",
};

const STATUS_LABELS = {
  in_progress: "进行中",
  voting: "投票中",
  finished: "已结束",
  cancelled: "已取消",
  failed: "已失败",
};

function genClientActionId() {
  return "ca_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
}

function stripCloudErrorPrefix(message) {
  return (message || "").replace(/^\[[^\]]+\]\s*/, "");
}

Page({
  data: {
    phase: "config",
    loading: false,
    configLoading: true,
    error: null,

    appInfo: null,
    costLabel: "免费使用",

    modes: [],
    difficulties: [],
    npcRange: { min: 4, max: 6 },
    roundRange: { min: 2, max: 3 },
    scenarioMeta: {},

    selectedMode: "word_undercover",
    selectedDifficulty: "student",
    selectedNpcCount: 4,
    selectedRoundCount: 2,

    session: null,
    playerRole: null,
    playerSecret: "",
    isUndercover: false,
    speechText: "",
    canSubmitSpeech: false,
    currentRoundSpeeches: [],
    allRoundSpeeches: [],

    voteTargets: [],
    selectedVoteTarget: "",
    votesWithNames: [],
    votedOutName: "",
    undercoverName: "",

    historyGames: [],
    historyTotal: 0,
    historyPage: 1,
    historyLoading: false,
  },

  onLoad() {
    this.loadConfig();
    this.loadAppInfo();
  },

  onShow() {
    if (this.data.phase === "config") {
      this.loadHistory();
    }
  },

  clearError() {
    this.setData({ error: null });
  },

  async loadAppInfo() {
    try {
      const detail = await api.getAppDetail("nursing_undercover");
      this.setData({
        appInfo: detail,
        costLabel: "免费使用",
      });
    } catch (err) {
      // non-blocking
    }
  },

  async loadConfig() {
    this.setData({ configLoading: true });
    try {
      const config = await api.callCloud("app_nursing_undercover", { action: "listConfig" });
      this.setData({
        modes: config.modes || [],
        difficulties: config.difficulties || [],
        npcRange: config.npcRange || { min: 4, max: 6 },
        roundRange: config.roundRange || { min: 2, max: 3 },
        scenarioMeta: config.scenarioMeta || {},
        configLoading: false,
      });
    } catch (err) {
      this.setData({ configLoading: false, error: stripCloudErrorPrefix(err.message) });
    }
  },

  async loadHistory() {
    this.setData({ historyLoading: true });
    try {
      const result = await api.callCloud("app_nursing_undercover", {
        action: "listMyGames", page: 1, pageSize: 5,
      });
      this.setData({
        historyGames: (result.games || []).map((g) => ({
          ...g,
          modeLabel: MODE_LABELS[g.mode] || g.mode,
          difficultyLabel: DIFFICULTY_LABELS[g.difficulty] || g.difficulty,
          statusLabel: STATUS_LABELS[g.status] || g.status,
          resultLabel: g.result ? (g.result.playerWon ? "胜利" : "失败") : "",
        })),
        historyTotal: result.total || 0,
        historyPage: 1,
        historyLoading: false,
      });
    } catch (err) {
      this.setData({ historyLoading: false });
    }
  },

  onModeChange(e) {
    this.setData({ selectedMode: e.detail.value || e.currentTarget.dataset.mode });
  },

  onDifficultyChange(e) {
    this.setData({ selectedDifficulty: e.detail.value || e.currentTarget.dataset.difficulty });
  },

  onNpcCountChange(e) {
    this.setData({ selectedNpcCount: parseInt(e.detail.value, 10) || 4 });
  },

  onRoundCountChange(e) {
    this.setData({ selectedRoundCount: parseInt(e.detail.value, 10) || 2 });
  },

  async onStartGame() {
    if (this.data.loading) return;
    this.setData({ loading: true, error: null });

    try {
      const usageData = await api.createUsage("nursing_undercover", {
        mode: this.data.selectedMode,
        difficulty: this.data.selectedDifficulty,
      });
      const usageId = usageData.usageId;

      const session = await api.callCloud("app_nursing_undercover", {
        action: "startGame",
        usageId,
        mode: this.data.selectedMode,
        difficulty: this.data.selectedDifficulty,
        npcCount: this.data.selectedNpcCount,
        roundCount: this.data.selectedRoundCount,
      });

      this.enterGame(session);
    } catch (err) {
      this.setData({ loading: false, error: stripCloudErrorPrefix(err.message) });
    }
  },

  enterGame(session) {
    const playerRole = (session.roles || []).find((r) => r.roleId === "player");
    const isFinished = ["finished", "cancelled", "failed"].includes(session.status);

    let phase = "game";
    if (session.status === "voting") phase = "vote";
    if (isFinished) phase = "result";

    const roleNameMap = {};
    (session.roles || []).forEach((r) => {
      roleNameMap[r.roleId] = r.roleId === "player" ? "我" : r.displayName;
    });

    const speeches = this.groupSpeeches(session, roleNameMap, isFinished);

    const votesWithNames = (session.votes || []).map((v) => ({
      ...v,
      voterName: roleNameMap[v.roleId] || v.roleId,
      targetName: roleNameMap[v.targetRoleId] || v.targetRoleId,
    }));

    const votedOutName = session.result ? (roleNameMap[session.result.votedOutRoleId] || session.result.votedOutRoleId) : "";
    const undercoverName = session.undercoverRoleId ? (roleNameMap[session.undercoverRoleId] || session.undercoverRoleId) : "";

    this.setData({
      loading: false,
      session,
      playerRole,
      playerSecret: playerRole ? playerRole.secretLabel : "",
      isUndercover: playerRole ? playerRole.team === "undercover" : false,
      phase,
      currentRoundSpeeches: speeches.current,
      allRoundSpeeches: speeches.all,
      votesWithNames,
      votedOutName,
      undercoverName,
      voteTargets: isFinished || session.status === "voting"
        ? (session.roles || []).filter((r) => r.roleId !== "player").map((r) => ({
          roleId: r.roleId,
          displayName: r.displayName,
        }))
        : [],
    });
  },

  groupSpeeches(session, roleNameMap, revealTeams) {
    const transcript = session.transcript || [];
    const currentRound = session.currentRound || 1;

    const roleTeamMap = {};
    (session.roles || []).forEach((r) => {
      roleTeamMap[r.roleId] = r.team;
    });

    function decorateSpeech(t) {
      const speech = { ...t, displayName: roleNameMap[t.roleId] || t.roleId };
      if (revealTeams) {
        speech.team = roleTeamMap[t.roleId] || (t.roleId === "player" ? "civilian" : "civilian");
      }
      return speech;
    }

    const current = transcript.filter((t) => t.roundNo === currentRound).map(decorateSpeech);
    const all = [];
    for (let r = 1; r <= (session.roundCount || 2); r++) {
      const roundSpeeches = transcript.filter((t) => t.roundNo === r).map(decorateSpeech);
      if (roundSpeeches.length > 0) {
        all.push({ roundNo: r, speeches: roundSpeeches });
      }
    }
    return { current, all };
  },

  onSpeechInput(e) {
    const value = e.detail.value || "";
    this.setData({ speechText: value, canSubmitSpeech: !!value.trim() });
  },

  async onSubmitSpeech() {
    if (this.data.loading) return;
    const text = this.data.speechText.trim();
    if (!text) {
      wx.showToast({ title: "请输入发言内容", icon: "none" });
      return;
    }
    if (text.length > 200) {
      wx.showToast({ title: "发言不超过200字", icon: "none" });
      return;
    }

    this.setData({ loading: true, error: null });
    try {
      const session = await api.callCloud("app_nursing_undercover", {
        action: "submitSpeech",
        sessionId: this.data.session._id,
        roundNo: this.data.session.currentRound,
        text,
        clientActionId: genClientActionId(),
      });
      this.setData({ speechText: "", canSubmitSpeech: false });
      this.enterGame(session);
    } catch (err) {
      this.setData({ loading: false, error: stripCloudErrorPrefix(err.message) });
    }
  },

  onSelectVoteTarget(e) {
    this.setData({ selectedVoteTarget: e.currentTarget.dataset.roleId });
  },

  async onSubmitVote() {
    if (this.data.loading) return;
    if (!this.data.selectedVoteTarget) {
      wx.showToast({ title: "请选择投票目标", icon: "none" });
      return;
    }

    this.setData({ loading: true, error: null });
    try {
      const session = await api.callCloud("app_nursing_undercover", {
        action: "submitVote",
        sessionId: this.data.session._id,
        targetRoleId: this.data.selectedVoteTarget,
        clientActionId: genClientActionId(),
      });
      this.enterGame(session);
    } catch (err) {
      this.setData({ loading: false, error: stripCloudErrorPrefix(err.message) });
    }
  },

  async onCancelGame() {
    if (this.data.loading) return;
    const that = this;
    wx.showModal({
      title: "确认取消",
      content: "确定要取消当前对局吗？",
      success: async (res) => {
        if (!res.confirm) return;
        that.setData({ loading: true });
        try {
          await api.callCloud("app_nursing_undercover", {
            action: "cancelGame",
            sessionId: that.data.session._id,
          });
          that.setData({ loading: false, phase: "config", session: null });
          that.loadHistory();
        } catch (err) {
          that.setData({ loading: false, error: stripCloudErrorPrefix(err.message) });
        }
      },
    });
  },

  onNewGame() {
    this.setData({
      phase: "config",
      session: null,
      playerRole: null,
      playerSecret: "",
      isUndercover: false,
      speechText: "",
      canSubmitSpeech: false,
      currentRoundSpeeches: [],
      allRoundSpeeches: [],
      voteTargets: [],
      selectedVoteTarget: "",
      votesWithNames: [],
      votedOutName: "",
      undercoverName: "",
      error: null,
    });
    this.loadHistory();
  },

  async onViewHistory(e) {
    const sessionId = e.currentTarget.dataset.id;
    if (!sessionId) return;
    this.setData({ loading: true });
    try {
      const session = await api.callCloud("app_nursing_undercover", {
        action: "getGame",
        sessionId,
      });
      this.enterGame(session);
    } catch (err) {
      this.setData({ loading: false, error: stripCloudErrorPrefix(err.message) });
    }
  },

  async onLoadMoreHistory() {
    if (this.data.historyLoading) return;
    const nextPage = this.data.historyPage + 1;
    this.setData({ historyLoading: true });
    try {
      const result = await api.callCloud("app_nursing_undercover", {
        action: "listMyGames", page: nextPage, pageSize: 5,
      });
      const newGames = (result.games || []).map((g) => ({
        ...g,
        modeLabel: MODE_LABELS[g.mode] || g.mode,
        difficultyLabel: DIFFICULTY_LABELS[g.difficulty] || g.difficulty,
        statusLabel: STATUS_LABELS[g.status] || g.status,
        resultLabel: g.result ? (g.result.playerWon ? "胜利" : "失败") : "",
      }));
      this.setData({
        historyGames: this.data.historyGames.concat(newGames),
        historyPage: nextPage,
        historyTotal: result.total || 0,
        historyLoading: false,
      });
    } catch (err) {
      this.setData({ historyLoading: false });
    }
  },
});
