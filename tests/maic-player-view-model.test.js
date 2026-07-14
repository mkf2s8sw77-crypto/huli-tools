const assert = require("node:assert/strict");
const test = require("node:test");
const viewModel = require("../miniprogram/pages/apps/maic/player-view-model");

test("旧 navigate 动作不会进入播放器动作序列", () => {
  const actions = viewModel.playableActions([
    { type: "speech", text: "开始讲解" },
    { type: "navigate", sceneId: "next" },
    { type: "pause", durationMs: 500 },
  ]);
  assert.deepEqual(actions.map((item) => item.type), ["speech", "pause"]);
});

test("旁白时长按文本估算并限制上下界", () => {
  assert.equal(viewModel.estimateSpeechDuration("好"), 1800);
  assert.equal(viewModel.estimateSpeechDuration("这是一段用于估算课堂讲解时间的普通中文旁白。"), 3430);
  assert.equal(viewModel.estimateSpeechDuration("很长".repeat(100)), 8000);
});

test("旧课程可从内容类型推导原生舞台布局", () => {
  assert.equal(viewModel.deriveLayout({ kind: "slide", blocks: [] }, 0), "hero");
  assert.equal(viewModel.deriveLayout({ kind: "slide", blocks: [{ type: "table" }] }, 2), "compare");
  assert.equal(viewModel.deriveLayout({ kind: "slide", blocks: [{ type: "steps" }] }, 2), "process");
  assert.equal(viewModel.deriveLayout({ kind: "pbl" }, 2), "caseboard");
  assert.equal(viewModel.deriveLayout({ kind: "quiz" }, 2), "challenge");
});

test("测验、互动与 PBL 均需要用户完成后才能继续", () => {
  assert.equal(viewModel.getSceneGate({ kind: "quiz" }, { quizSubmitted: false }, false).canContinue, false);
  assert.equal(viewModel.getSceneGate({ kind: "quiz" }, { quizSubmitted: true }, false).canContinue, true);
  const matching = {
    kind: "interaction",
    interactionType: "matching",
    config: { pairs: [{ leftId: "a", rightId: "b" }] },
  };
  assert.equal(viewModel.getSceneGate(matching, { interactionState: { matches: [] } }, false).canContinue, false);
  assert.equal(
    viewModel.getSceneGate(matching, { interactionState: { matches: [{ leftId: "a", rightId: "b", correct: true }] } }, false).canContinue,
    true,
  );
  assert.equal(viewModel.getSceneGate({ kind: "pbl" }, { pblFinished: false }, true).canContinue, false);
});
