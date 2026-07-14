const LAYOUTS = ["hero", "focus", "compare", "process", "caseboard", "challenge"];

const KIND_META = {
  slide: { label: "课堂讲解", guide: "跟随教师观察舞台中的关键内容" },
  quiz: { label: "知识挑战", guide: "完成作答后，课程才会继续" },
  interaction: { label: "动手练习", guide: "完成当前练习后继续下一幕" },
  pbl: { label: "临床推演", guide: "沿着病例路径做出你的判断" },
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function estimateSpeechDuration(text) {
  const count = String(text || "").replace(/\s+/g, "").length;
  return clamp(900 + count * 115, 1800, 8000);
}

function playableActions(actions) {
  return (Array.isArray(actions) ? actions : []).filter((action) => action && action.type !== "navigate");
}

function deriveLayout(scene, index) {
  const requested = scene && scene.presentation && scene.presentation.layout;
  if (LAYOUTS.includes(requested)) return requested;
  if (!scene) return "focus";
  if (scene.kind === "pbl") return "caseboard";
  if (scene.kind === "quiz" || scene.kind === "interaction") return "challenge";
  if (index === 0) return "hero";
  const types = (scene.blocks || []).map((block) => block.type);
  if (types.includes("table")) return "compare";
  if (types.includes("steps") || types.includes("diagram")) return "process";
  return "focus";
}

function buildSceneMeta(scene, index, total) {
  const meta = KIND_META[(scene && scene.kind) || "slide"] || KIND_META.slide;
  const actions = playableActions(scene && scene.actions);
  const legacyNavigateCount = (scene && scene.actions ? scene.actions : []).filter((action) => action && action.type === "navigate").length;
  return {
    kindLabel: meta.label,
    guide: meta.guide,
    eyebrow: (scene && scene.presentation && scene.presentation.eyebrow) || meta.label,
    layout: deriveLayout(scene, index),
    pageLabel: `${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`,
    actions,
    actionCount: actions.length,
    legacyNavigateCount,
  };
}

function isInteractionComplete(scene, state) {
  const config = (scene && scene.config) || {};
  const current = state || {};
  if (!scene || scene.kind !== "interaction") return false;
  if (scene.interactionType === "tabs") {
    const tabCount = (config.tabs || []).length;
    return tabCount > 0 && new Set(current.visitedTabs || []).size >= tabCount;
  }
  if (scene.interactionType === "matching") {
    const pairs = config.pairs || [];
    const matches = current.matches || [];
    return pairs.length > 0 && matches.length >= pairs.length && matches.every((item) => item.correct);
  }
  if (scene.interactionType === "sorting") return Boolean(current.checked && current.correct);
  if (scene.interactionType === "hotspot") return Boolean(current.selectedPointId);
  const steps = config.steps || [];
  return steps.length > 0 && Number(current.revealed || 0) >= steps.length;
}

function getSceneGate(scene, state, isLast) {
  let canContinue = true;
  let hint = "讲解结束后，由你决定何时继续";
  if (scene && scene.kind === "quiz") {
    canContinue = Boolean(state && state.quizSubmitted);
    hint = canContinue ? "已完成作答，可以继续" : "请先提交答案";
  } else if (scene && scene.kind === "interaction") {
    canContinue = isInteractionComplete(scene, state && state.interactionState);
    hint = canContinue ? "练习已完成，可以继续" : "请完成当前练习";
  } else if (scene && scene.kind === "pbl") {
    canContinue = Boolean(state && state.pblFinished);
    hint = canContinue ? "病例推演已完成，可以复盘" : "请完成病例决策";
  }
  return {
    canContinue,
    hint,
    label: isLast ? "完成课程" : canContinue ? "继续下一幕" : "完成后继续",
  };
}

module.exports = {
  buildSceneMeta,
  deriveLayout,
  estimateSpeechDuration,
  getSceneGate,
  isInteractionComplete,
  playableActions,
};
