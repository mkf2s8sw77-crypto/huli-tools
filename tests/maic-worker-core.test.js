const assert = require("node:assert/strict");
const test = require("node:test");
const { assertSafeCourse, normalizeCourse, repairJson } = require("../cloudfunctions/app_maic_worker/core/contract");
const { generateFallbackCourse } = require("../cloudfunctions/app_maic_worker/core/fallback");
const { canAcquireLease, isLeaseExpired } = require("../cloudfunctions/app_maic_worker/core/lease");

const input = {
  usageId: "usage-001",
  topic: "压力性损伤预防",
  audience: "临床护士",
  createdAt: "2026-07-19T00:00:00.000Z",
};

test("JSON 修复可移除代码围栏和尾随逗号", () => {
  assert.deepEqual(repairJson("```json\n{\"ok\":true,}\n```"), { ok: true });
});

test("normalizer 过滤 HTML、危险协议和 navigate", () => {
  const course = normalizeCourse({
    title: "<script>alert(1)</script>压疮预防",
    summary: "javascript:alert(1)",
    scenes: [{
      id: "scene-1",
      kind: "slide",
      title: "<b>风险识别</b>",
      blocks: [{ id: "content-1", type: "paragraph", text: "使用 <iframe> 不安全" }],
      actions: [
        { type: "navigate", sceneId: "scene-2" },
        { type: "speech", text: "先评估风险" },
      ],
    }],
  }, input);
  const serialized = JSON.stringify(course);
  assert.equal(serialized.includes("<script>"), false);
  assert.equal(serialized.includes("javascript:"), false);
  assert.equal(serialized.includes("iframe"), false);
  assert.deepEqual(course.scenes[0].actions.map((action) => action.type), ["speech"]);
  assert.doesNotThrow(() => assertSafeCourse(course));
});

test("PBL 无效引用会被过滤为空终点", () => {
  const course = normalizeCourse({
    title: "PBL",
    scenes: [{
      id: "pbl-1",
      kind: "pbl",
      title: "病例",
      initialNodeId: "missing",
      nodes: [{
        id: "node-1",
        title: "初始",
        narrative: "评估患者风险",
        choices: [{ id: "choice-1", label: "继续", nextNodeId: "missing-node" }],
      }],
    }],
  }, input);
  assert.equal(course.scenes[0].initialNodeId, "node-1");
  assert.equal(course.scenes[0].nodes[0].choices[0].nextNodeId, "");
  assert.doesNotThrow(() => assertSafeCourse(course));
});

test("确定性兜底课程包含四类原生场景且资产为空", () => {
  const first = generateFallbackCourse(input);
  const second = generateFallbackCourse(input);
  assert.deepEqual(first, second);
  assert.deepEqual(first.scenes.map((scene) => scene.kind), ["slide", "quiz", "interaction", "pbl"]);
  assert.deepEqual(first.assets, []);
  assert.doesNotThrow(() => assertSafeCourse(first));
});

test("Worker 租约仅在空闲或过期时可获取", () => {
  const now = Date.parse("2026-07-19T00:10:00.000Z");
  assert.equal(canAcquireLease(null, now), true);
  assert.equal(canAcquireLease({ leaseOwner: "worker-a", leaseExpiresAt: "2026-07-19T00:11:00.000Z" }, now), false);
  assert.equal(canAcquireLease({ leaseOwner: "worker-a", leaseExpiresAt: "2026-07-19T00:09:00.000Z" }, now), true);
  assert.equal(isLeaseExpired({ leaseExpiresAt: "2026-07-19T00:09:00.000Z" }, now), true);
});
