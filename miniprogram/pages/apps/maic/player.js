const api = require("../../../services/api");
const playerViewModel = require("./player-view-model");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

Page({
  data: {
    courseId: "",
    loading: true,
    scenes: [],
    currentScene: null,
    currentIndex: 0,
    total: 0,
    progressPercent: 0,
    assetUrls: {},
    narration: "",
    activeTargetId: "",
    activeAction: "",
    laserVisible: false,
    laserStyle: "",
    quizSelected: [],
    quizOptions: [],
    quizSubmitted: false,
    quizCorrect: false,
    interactionState: {},
    pblNode: null,
    pblScore: 0,
    pblFinished: false,
    sceneMeta: {},
    canContinue: true,
    continueHint: "",
    continueLabel: "继续下一幕",
    actionStep: 0,
    actionCount: 0,
  },

  onLoad(options) {
    this.setData({ courseId: decodeURIComponent(options.courseId || "") });
    this.progressState = { quizAnswers: {}, interactions: {}, pbl: {} };
    this.loadCourse();
  },

  onShow() {
    if (this.wasHidden && this.data.currentScene) {
      this.wasHidden = false;
      this.runSceneActions(this.data.currentScene);
    }
  },

  onHide() {
    this.wasHidden = true;
    this.cancelSceneActions();
    this.scheduleSave(true);
  },

  onUnload() {
    this.cancelSceneActions();
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.persistProgress();
  },

  cancelSceneActions() {
    this.actionRunToken = (this.actionRunToken || 0) + 1;
    this.setData({ activeTargetId: "", activeAction: "", laserVisible: false });
  },

  async loadCourse() {
    try {
      const [sceneData, progressData] = await Promise.all([
        api.listMaicScenes(this.data.courseId),
        api.getMaicProgress(this.data.courseId),
      ]);
      const scenes = sceneData.scenes || [];
      const saved = progressData.progress || {};
      this.progressState = {
        quizAnswers: saved.quizAnswers || {},
        interactions: saved.interactions || {},
        pbl: saved.pbl || {},
        completed: Boolean(saved.completed),
      };
      const index = clamp(Number(saved.sceneIndex || 0), 0, Math.max(0, scenes.length - 1));
      this.setData({ scenes, total: scenes.length, assetUrls: sceneData.assetUrls || {}, loading: false });
      if (scenes.length) await this.openScene(index);
    } catch (err) {
      this.setData({ loading: false });
      api.toastError(err);
    }
  },

  async openScene(index, options) {
    const scenes = this.data.scenes;
    if (!scenes.length || index < 0 || index >= scenes.length) return;
    const scene = scenes[index];
    this.cancelSceneActions();
    const savedQuiz = this.progressState.quizAnswers[scene.id] || null;
    const sceneMeta = playerViewModel.buildSceneMeta(scene, index, scenes.length);
    const nextData = {
      currentScene: scene,
      currentIndex: index,
      progressPercent: Math.round(((index + 1) / scenes.length) * 100),
      narration: "",
      activeTargetId: "",
      activeAction: "",
      laserVisible: false,
      quizSelected: savedQuiz ? savedQuiz.selected || [] : [],
      quizOptions: this.decorateQuizOptions(scene, savedQuiz ? savedQuiz.selected || [] : [], savedQuiz ? Boolean(savedQuiz.submitted) : false),
      quizSubmitted: savedQuiz ? Boolean(savedQuiz.submitted) : false,
      quizCorrect: savedQuiz ? Boolean(savedQuiz.correct) : false,
      interactionState: this.buildInteractionState(scene),
      ...this.buildPblState(scene),
      sceneMeta,
      actionStep: 0,
      actionCount: sceneMeta.actionCount,
    };
    const gate = playerViewModel.getSceneGate(scene, nextData, index === scenes.length - 1);
    nextData.canContinue = gate.canContinue;
    nextData.continueHint = gate.hint;
    nextData.continueLabel = gate.label;
    await new Promise((resolve) => this.setData(nextData, resolve));
    this.scheduleSave();
    if (!(options && options.skipActions)) this.runSceneActions(scene);
  },

  decorateQuizOptions(scene, selected, submitted) {
    if (!scene || scene.kind !== "quiz") return [];
    return (scene.options || []).map((option) => ({
      ...option,
      selected: selected.includes(option.id),
      correctAnswer: submitted && (scene.answers || []).includes(option.id),
    }));
  },

  buildInteractionState(scene) {
    if (!scene || scene.kind !== "interaction") return {};
    const saved = this.progressState.interactions[scene.id] || {};
    const config = scene.config || {};
    if (scene.interactionType === "tabs") {
      const selectedTab = Number(saved.selectedTab || 0);
      return { selectedTab, visitedTabs: saved.visitedTabs || [selectedTab] };
    }
    if (scene.interactionType === "matching") {
      const matches = saved.matches || [];
      const matchedRightIds = matches.map((item) => item.rightId);
      return {
        pendingLeftId: "",
        matches,
        rightOptions: (config.right || []).map((item) => ({ ...item, matched: matchedRightIds.includes(item.id) })),
      };
    }
    if (scene.interactionType === "sorting") {
      return { items: saved.items || (config.items || []).slice(), checked: Boolean(saved.checked), correct: Boolean(saved.correct) };
    }
    if (scene.interactionType === "hotspot") {
      return { selectedPointId: saved.selectedPointId || "", feedback: saved.feedback || "" };
    }
    return { revealed: Number(saved.revealed || 1) };
  },

  buildPblState(scene) {
    if (!scene || scene.kind !== "pbl") return { pblNode: null, pblScore: 0, pblFinished: false };
    const saved = this.progressState.pbl[scene.id] || {};
    const nodeId = saved.nodeId || scene.initialNodeId;
    return {
      pblNode: (scene.nodes || []).find((node) => node.id === nodeId) || scene.nodes[0] || null,
      pblScore: Number(saved.score || 0),
      pblFinished: Boolean(saved.finished) || !((scene.nodes || []).find((node) => node.id === nodeId) || scene.nodes[0] || { choices: [] }).choices.length,
    };
  },

  async runSceneActions(scene) {
    if (!scene) return;
    const token = this.actionRunToken;
    const actions = playerViewModel.playableActions(scene.actions).slice(0, 24);
    this.setData({ actionCount: actions.length, actionStep: 0 });
    for (let i = 0; i < actions.length; i += 1) {
      if (token !== this.actionRunToken) return;
      const action = actions[i];
      this.setData({ actionStep: i + 1 });
      if (action.type === "speech") {
        this.setData({ narration: action.text, activeAction: "speech" });
        await delay(playerViewModel.estimateSpeechDuration(action.text));
        if (token === this.actionRunToken) this.setData({ activeAction: "" });
      } else if (action.type === "highlight" || action.type === "spotlight") {
        this.setData({ activeTargetId: action.targetId, activeAction: action.type });
        await delay(action.durationMs || 900);
        if (token === this.actionRunToken) this.setData({ activeTargetId: "", activeAction: "" });
      } else if (action.type === "laser") {
        this.setData({ laserVisible: true, laserStyle: `left:${action.x}%;top:${action.y}%;`, activeAction: "laser" });
        await delay(action.durationMs || 800);
        if (token === this.actionRunToken) this.setData({ laserVisible: false, activeAction: "" });
      } else if (action.type === "pause") {
        this.setData({ activeAction: "pause" });
        await delay(action.durationMs);
        if (token === this.actionRunToken) this.setData({ activeAction: "" });
      }
    }
    if (token === this.actionRunToken) this.setData({ activeAction: "", actionStep: actions.length });
  },

  prevScene() {
    this.openScene(this.data.currentIndex - 1);
  },

  nextScene() {
    if (!this.data.canContinue) {
      wx.showToast({ title: this.data.continueHint || "请先完成当前内容", icon: "none" });
      return;
    }
    if (this.data.currentIndex >= this.data.total - 1) {
      this.progressState.completed = true;
      this.scheduleSave(true);
      wx.showToast({ title: "课程已完成", icon: "success" });
      return;
    }
    this.openScene(this.data.currentIndex + 1);
  },

  selectQuizOption(e) {
    if (this.data.quizSubmitted) return;
    const id = e.currentTarget.dataset.id;
    const scene = this.data.currentScene;
    let selected = this.data.quizSelected.slice();
    if (scene.questionType === "multiple") {
      selected = selected.includes(id) ? selected.filter((item) => item !== id) : selected.concat(id);
    } else {
      selected = [id];
    }
    this.setData({ quizSelected: selected, quizOptions: this.decorateQuizOptions(scene, selected, false) });
  },

  submitQuiz() {
    const scene = this.data.currentScene;
    if (!this.data.quizSelected.length) {
      api.toastError(new Error("请先选择答案"));
      return;
    }
    const actual = this.data.quizSelected.slice().sort().join(",");
    const expected = (scene.answers || []).slice().sort().join(",");
    const correct = actual === expected;
    this.setData({ quizSubmitted: true, quizCorrect: correct, quizOptions: this.decorateQuizOptions(scene, this.data.quizSelected, true) });
    this.progressState.quizAnswers[scene.id] = { selected: this.data.quizSelected, submitted: true, correct };
    this.syncGate({ quizSubmitted: true });
    this.scheduleSave(true);
  },

  selectTab(e) {
    const selectedTab = Number(e.currentTarget.dataset.index || 0);
    const visitedTabs = Array.from(new Set((this.data.interactionState.visitedTabs || []).concat(selectedTab)));
    const state = { selectedTab, visitedTabs };
    this.setData({ interactionState: state });
    this.saveInteraction(state);
    this.syncGate({ interactionState: state });
  },

  selectMatchLeft(e) {
    this.setData({ "interactionState.pendingLeftId": e.currentTarget.dataset.id });
  },

  selectMatchRight(e) {
    const leftId = this.data.interactionState.pendingLeftId;
    const rightId = e.currentTarget.dataset.id;
    if (!leftId || e.currentTarget.dataset.matched) return;
    const config = this.data.currentScene.config || {};
    const left = (config.left || []).find((item) => item.id === leftId);
    const right = (config.right || []).find((item) => item.id === rightId);
    const correct = (config.pairs || []).some((pair) => pair.leftId === leftId && pair.rightId === rightId);
    const matches = (this.data.interactionState.matches || []).filter((item) => item.leftId !== leftId);
    matches.push({ leftId, leftText: left ? left.text : leftId, rightId, rightText: right ? right.text : rightId, correct });
    const matchedRightIds = matches.map((item) => item.rightId);
    const rightOptions = (config.right || []).map((item) => ({ ...item, matched: matchedRightIds.includes(item.id) }));
    const state = { pendingLeftId: "", matches, rightOptions };
    this.setData({ interactionState: state });
    this.saveInteraction({ matches });
    this.syncGate({ interactionState: state });
  },

  moveSortItem(e) {
    const index = Number(e.currentTarget.dataset.index);
    const direction = Number(e.currentTarget.dataset.direction);
    const target = index + direction;
    const items = (this.data.interactionState.items || []).slice();
    if (target < 0 || target >= items.length) return;
    const temp = items[index];
    items[index] = items[target];
    items[target] = temp;
    this.setData({ interactionState: { items, checked: false, correct: false } });
    this.saveInteraction({ items, checked: false, correct: false });
    this.syncGate({ interactionState: { items, checked: false, correct: false } });
  },

  checkSort() {
    const ids = (this.data.interactionState.items || []).map((item) => item.id).join(",");
    const expected = (this.data.currentScene.config.correctOrder || []).join(",");
    const state = { ...this.data.interactionState, checked: true, correct: ids === expected };
    this.setData({ interactionState: state });
    this.saveInteraction(state);
    this.syncGate({ interactionState: state });
  },

  selectHotspot(e) {
    const id = e.currentTarget.dataset.id;
    const point = (this.data.currentScene.config.points || []).find((item) => item.id === id);
    const state = { selectedPointId: id, feedback: point ? point.feedback : "" };
    this.setData({ interactionState: state });
    this.saveInteraction(state);
    this.syncGate({ interactionState: state });
  },

  revealStep() {
    const max = (this.data.currentScene.config.steps || []).length;
    const revealed = Math.min(max, Number(this.data.interactionState.revealed || 1) + 1);
    this.setData({ "interactionState.revealed": revealed });
    this.saveInteraction({ revealed });
    this.syncGate({ interactionState: { ...this.data.interactionState, revealed } });
  },

  saveInteraction(state) {
    this.progressState.interactions[this.data.currentScene.id] = state;
    this.scheduleSave();
  },

  choosePbl(e) {
    if (this.data.pblFinished) return;
    const choiceId = e.currentTarget.dataset.id;
    const choice = (this.data.pblNode.choices || []).find((item) => item.id === choiceId);
    if (!choice) return;
    const score = this.data.pblScore + Number(choice.score || 0);
    const nextNode = choice.nextNodeId
      ? (this.data.currentScene.nodes || []).find((node) => node.id === choice.nextNodeId)
      : null;
    const finished = !nextNode;
    this.setData({ pblNode: nextNode || this.data.pblNode, pblScore: score, pblFinished: finished, narration: choice.feedback });
    this.progressState.pbl[this.data.currentScene.id] = {
      nodeId: nextNode ? nextNode.id : this.data.pblNode.id,
      score,
      finished,
    };
    this.syncGate({ pblFinished: finished });
    this.scheduleSave(true);
  },

  syncGate(overrides) {
    const scene = this.data.currentScene;
    if (!scene) return;
    const state = {
      quizSubmitted: this.data.quizSubmitted,
      interactionState: this.data.interactionState,
      pblFinished: this.data.pblFinished,
      ...(overrides || {}),
    };
    const gate = playerViewModel.getSceneGate(scene, state, this.data.currentIndex === this.data.total - 1);
    this.setData({ canContinue: gate.canContinue, continueHint: gate.hint, continueLabel: gate.label });
  },

  scheduleSave(immediate) {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    if (immediate) {
      this.persistProgress();
      return;
    }
    this.saveTimer = setTimeout(() => this.persistProgress(), 800);
  },

  async persistProgress() {
    if (!this.data.courseId || !this.data.scenes.length) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    try {
      await api.saveMaicProgress(this.data.courseId, {
        ...this.progressState,
        sceneIndex: this.data.currentIndex,
        sceneId: this.data.currentScene ? this.data.currentScene.id : "",
        percent: this.data.progressPercent,
      });
    } catch (err) {
      console.error("保存 MAIC 学习进度失败:", err);
    }
  },
});
