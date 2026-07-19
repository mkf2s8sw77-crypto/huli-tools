const { z } = require("zod");

const PROTOCOL = "maic-miniapp/1";
const FORBIDDEN_PAYLOAD = /<\/?[a-z][^>]*>|javascript\s*:|data\s*:\s*text\/html|\b(?:iframe|webview|script)\b/i;
const SCENE_KINDS = new Set(["slide", "quiz", "interaction", "pbl"]);
const ACTION_TYPES = new Set(["speech", "highlight", "spotlight", "laser", "pause"]);
const BLOCK_TYPES = new Set(["paragraph", "list", "callout", "table", "steps", "diagram"]);

const actionSchema = z.object({
  type: z.enum(["speech", "highlight", "spotlight", "laser", "pause"]),
}).passthrough();

const sceneSchema = z.object({
  id: z.string().min(1).max(80),
  kind: z.enum(["slide", "quiz", "interaction", "pbl"]),
  title: z.string().min(1).max(200),
  actions: z.array(actionSchema).max(24).default([]),
}).passthrough();

const courseSchema = z.object({
  protocol: z.literal(PROTOCOL),
  courseId: z.string().min(1).max(120),
  title: z.string().min(1).max(200),
  summary: z.string().max(1000).default(""),
  language: z.string().min(2).max(20).default("zh-CN"),
  createdAt: z.string().min(1),
  assets: z.array(z.never()).length(0),
  scenes: z.array(sceneSchema).min(1).max(40),
});

function sanitizeText(value, maxLength) {
  const limit = maxLength || 4000;
  return String(value == null ? "" : value)
    .replace(/<[^>]*>/g, " ")
    .replace(/javascript\s*:/gi, "")
    .replace(/data\s*:\s*text\/html/gi, "")
    .replace(/\b(?:iframe|webview|script)\b/gi, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function safeId(value, fallback) {
  const normalized = sanitizeText(value, 80)
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return normalized || fallback;
}

function uniqueId(value, fallback, used) {
  const base = safeId(value, fallback);
  let current = base;
  let suffix = 2;
  while (used.has(current)) {
    current = `${base}-${suffix}`.slice(0, 80);
    suffix += 1;
  }
  used.add(current);
  return current;
}

function sanitizeList(values, maxItems, maxLength) {
  return (Array.isArray(values) ? values : [])
    .slice(0, maxItems)
    .map((item) => sanitizeText(item, maxLength))
    .filter(Boolean);
}

function normalizeActions(actions) {
  return (Array.isArray(actions) ? actions : [])
    .filter((action) => action && ACTION_TYPES.has(action.type))
    .slice(0, 24)
    .map((action) => {
      const normalized = { type: action.type };
      if (action.type === "speech") normalized.text = sanitizeText(action.text, 1200);
      if (["highlight", "spotlight"].includes(action.type)) {
        normalized.targetId = safeId(action.targetId, "content-1");
        normalized.durationMs = Math.min(8000, Math.max(200, Number(action.durationMs) || 900));
      }
      if (action.type === "laser") {
        normalized.x = Math.min(100, Math.max(0, Number(action.x) || 50));
        normalized.y = Math.min(100, Math.max(0, Number(action.y) || 50));
        normalized.durationMs = Math.min(8000, Math.max(200, Number(action.durationMs) || 800));
      }
      if (action.type === "pause") normalized.durationMs = Math.min(8000, Math.max(200, Number(action.durationMs) || 800));
      return normalized;
    })
    .filter((action) => action.type !== "speech" || action.text);
}

function normalizeBlocks(blocks) {
  const used = new Set();
  const result = [];
  (Array.isArray(blocks) ? blocks : []).slice(0, 12).forEach((block, index) => {
    if (!block || !BLOCK_TYPES.has(block.type)) return;
    const id = uniqueId(block.id, `content-${index + 1}`, used);
    if (block.type === "paragraph") {
      const text = sanitizeText(block.text, 1800);
      if (text) result.push({ id, type: "paragraph", text });
    } else if (block.type === "list") {
      const items = sanitizeList(block.items, 12, 300);
      if (items.length) result.push({ id, type: "list", ordered: Boolean(block.ordered), items });
    } else if (block.type === "callout") {
      const text = sanitizeText(block.text, 1000);
      if (text) result.push({ id, type: "callout", title: sanitizeText(block.title, 120), text, tone: ["info", "warning", "success"].includes(block.tone) ? block.tone : "info" });
    } else if (block.type === "table") {
      const headers = sanitizeList(block.headers, 6, 80);
      const rows = (Array.isArray(block.rows) ? block.rows : []).slice(0, 10).map((row) => sanitizeList(row, headers.length || 6, 120));
      if (headers.length && rows.length) result.push({ id, type: "table", headers, rows });
    } else if (block.type === "steps") {
      const items = (Array.isArray(block.items) ? block.items : []).slice(0, 10).map((item, itemIndex) => ({
        id: safeId(item && item.id, `step-${itemIndex + 1}`),
        title: sanitizeText(item && item.title, 100),
        detail: sanitizeText(item && item.detail, 500),
      })).filter((item) => item.title && item.detail);
      if (items.length) result.push({ id, type: "steps", items });
    } else if (block.type === "diagram") {
      const nodes = (Array.isArray(block.nodes) ? block.nodes : []).slice(0, 10).map((node, nodeIndex) => ({ id: safeId(node && node.id, `node-${nodeIndex + 1}`), label: sanitizeText(node && node.label, 100) })).filter((node) => node.label);
      const nodeIds = new Set(nodes.map((node) => node.id));
      const edges = (Array.isArray(block.edges) ? block.edges : []).slice(0, 16).map((edge) => ({ from: safeId(edge && edge.from, ""), to: safeId(edge && edge.to, ""), label: sanitizeText(edge && edge.label, 100) })).filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to));
      if (nodes.length) result.push({ id, type: "diagram", nodes, edges });
    }
  });
  if (!result.length) result.push({ id: "content-1", type: "paragraph", text: "请结合课程主题梳理关键概念，并在后续互动中完成应用。" });
  return result;
}

function normalizeQuiz(scene, base) {
  const used = new Set();
  const options = (Array.isArray(scene.options) ? scene.options : []).slice(0, 8).map((option, index) => ({
    id: uniqueId(option && option.id, `option-${index + 1}`, used),
    text: sanitizeText(option && option.text, 300),
  })).filter((option) => option.text);
  if (options.length < 2) {
    options.splice(0, options.length,
      { id: "option-1", text: "先评估情境并识别核心问题" },
      { id: "option-2", text: "跳过评估并直接执行操作" });
  }
  const valid = new Set(options.map((option) => option.id));
  const answers = sanitizeList(scene.answers, options.length, 80).filter((id) => valid.has(id));
  return {
    ...base,
    prompt: sanitizeText(scene.prompt, 800) || "面对该主题，哪项做法更符合安全、循证的决策顺序？",
    questionType: scene.questionType === "multiple" ? "multiple" : "single",
    options,
    answers: answers.length ? answers : [options[0].id],
    explanation: sanitizeText(scene.explanation, 1000) || "应先完成评估，再结合证据与具体情境选择行动。",
  };
}

function normalizeInteraction(scene, base) {
  const config = scene.config && typeof scene.config === "object" ? scene.config : {};
  const requested = ["tabs", "matching", "sorting", "steps"].includes(scene.interactionType) ? scene.interactionType : "steps";
  const prompt = sanitizeText(scene.prompt, 800) || "依次完成下面的练习。";
  if (requested === "tabs") {
    const tabs = (Array.isArray(config.tabs) ? config.tabs : []).slice(0, 8).map((item, index) => ({ id: safeId(item && item.id, `tab-${index + 1}`), label: sanitizeText(item && item.label, 80), content: sanitizeText(item && item.content, 800) })).filter((item) => item.label && item.content);
    if (tabs.length) return { ...base, prompt, interactionType: "tabs", config: { tabs } };
  }
  if (requested === "matching") {
    const left = (Array.isArray(config.left) ? config.left : []).slice(0, 8).map((item, index) => ({ id: safeId(item && item.id, `left-${index + 1}`), text: sanitizeText(item && item.text, 180) })).filter((item) => item.text);
    const right = (Array.isArray(config.right) ? config.right : []).slice(0, 8).map((item, index) => ({ id: safeId(item && item.id, `right-${index + 1}`), text: sanitizeText(item && item.text, 180) })).filter((item) => item.text);
    const leftIds = new Set(left.map((item) => item.id));
    const rightIds = new Set(right.map((item) => item.id));
    const pairs = (Array.isArray(config.pairs) ? config.pairs : []).map((pair) => ({ leftId: safeId(pair && pair.leftId, ""), rightId: safeId(pair && pair.rightId, "") })).filter((pair) => leftIds.has(pair.leftId) && rightIds.has(pair.rightId));
    if (left.length && right.length && pairs.length === left.length) return { ...base, prompt, interactionType: "matching", config: { left, right, pairs } };
  }
  if (requested === "sorting") {
    const items = (Array.isArray(config.items) ? config.items : []).slice(0, 8).map((item, index) => ({ id: safeId(item && item.id, `item-${index + 1}`), text: sanitizeText(item && item.text, 200) })).filter((item) => item.text);
    const valid = new Set(items.map((item) => item.id));
    const correctOrder = sanitizeList(config.correctOrder, items.length, 80).filter((id) => valid.has(id));
    if (items.length > 1 && correctOrder.length === items.length) return { ...base, prompt, interactionType: "sorting", config: { items, correctOrder } };
  }
  const steps = (Array.isArray(config.steps) ? config.steps : []).slice(0, 8).map((item, index) => ({ id: safeId(item && item.id, `step-${index + 1}`), title: sanitizeText(item && item.title, 100), detail: sanitizeText(item && item.detail, 500) })).filter((item) => item.title && item.detail);
  if (!steps.length) steps.push(
    { id: "step-1", title: "识别", detail: "识别当前情境中的核心问题和风险。" },
    { id: "step-2", title: "判断", detail: "结合证据、资源和对象偏好形成判断。" },
    { id: "step-3", title: "行动", detail: "执行后复评结果，并记录需要调整的环节。" },
  );
  return { ...base, prompt, interactionType: "steps", config: { steps } };
}

function normalizePbl(scene, base) {
  const used = new Set();
  let nodes = (Array.isArray(scene.nodes) ? scene.nodes : []).slice(0, 12).map((node, index) => ({
    id: uniqueId(node && node.id, `case-${index + 1}`, used),
    title: sanitizeText(node && node.title, 120),
    narrative: sanitizeText(node && node.narrative, 1200),
    choices: Array.isArray(node && node.choices) ? node.choices.slice(0, 6) : [],
  })).filter((node) => node.title && node.narrative);
  if (!nodes.length) nodes = [{ id: "case-1", title: "初始评估", narrative: "请先识别关键风险，并选择下一步行动。", choices: [] }];
  const nodeIds = new Set(nodes.map((node) => node.id));
  nodes = nodes.map((node, nodeIndex) => ({
    ...node,
    choices: node.choices.map((choice, choiceIndex) => ({
      id: safeId(choice && choice.id, `choice-${nodeIndex + 1}-${choiceIndex + 1}`),
      label: sanitizeText(choice && choice.label, 240),
      feedback: sanitizeText(choice && choice.feedback, 600),
      score: Math.min(100, Math.max(-100, Number(choice && choice.score) || 0)),
      nextNodeId: nodeIds.has(safeId(choice && choice.nextNodeId, "")) ? safeId(choice.nextNodeId, "") : "",
    })).filter((choice) => choice.label),
  }));
  const initialNodeId = nodeIds.has(safeId(scene.initialNodeId, "")) ? safeId(scene.initialNodeId, "") : nodes[0].id;
  return {
    ...base,
    caseSummary: sanitizeText(scene.caseSummary, 1000) || "围绕课程主题完成一次情境判断。",
    initialNodeId,
    nodes,
    review: sanitizeText(scene.review, 1200) || "复盘时请比较评估依据、决策过程和结果反馈。",
  };
}

function normalizeScene(scene, index, usedSceneIds) {
  const kind = SCENE_KINDS.has(scene && scene.kind) ? scene.kind : "slide";
  const id = uniqueId(scene && scene.id, `scene-${index + 1}`, usedSceneIds);
  const base = {
    id,
    kind,
    title: sanitizeText(scene && scene.title, 200) || `课程场景 ${index + 1}`,
    presentation: {
      layout: sanitizeText(scene && scene.presentation && scene.presentation.layout, 40),
      eyebrow: sanitizeText(scene && scene.presentation && scene.presentation.eyebrow, 80),
    },
    actions: normalizeActions(scene && scene.actions),
  };
  if (kind === "slide") return { ...base, blocks: normalizeBlocks(scene && scene.blocks) };
  if (kind === "quiz") return normalizeQuiz(scene || {}, base);
  if (kind === "interaction") return normalizeInteraction(scene || {}, base);
  return normalizePbl(scene || {}, base);
}

function assertSafeCourse(course) {
  const serialized = JSON.stringify(course);
  if (FORBIDDEN_PAYLOAD.test(serialized)) throw Object.assign(new Error("课程包含禁止的 HTML、脚本或 WebView 内容"), { code: "INVALID_PROTOCOL" });
  if (serialized.length > 900000) throw Object.assign(new Error("课程协议过大"), { code: "INVALID_PROTOCOL" });
  const sceneIds = new Set(course.scenes.map((scene) => scene.id));
  if (sceneIds.size !== course.scenes.length) throw Object.assign(new Error("课程场景 ID 重复"), { code: "INVALID_PROTOCOL" });
  course.scenes.forEach((scene) => {
    if ((scene.actions || []).some((action) => action.type === "navigate")) throw Object.assign(new Error("课程包含禁止的 navigate 动作"), { code: "INVALID_PROTOCOL" });
    if (scene.kind === "pbl") {
      const nodeIds = new Set((scene.nodes || []).map((node) => node.id));
      if (!nodeIds.has(scene.initialNodeId)) throw Object.assign(new Error("PBL 初始节点不存在"), { code: "INVALID_PROTOCOL" });
      (scene.nodes || []).forEach((node) => (node.choices || []).forEach((choice) => {
        if (choice.nextNodeId && !nodeIds.has(choice.nextNodeId)) throw Object.assign(new Error("PBL 跳转节点不存在"), { code: "INVALID_PROTOCOL" });
      }));
    }
  });
}

function normalizeCourse(raw, input) {
  const source = raw && raw.course && typeof raw.course === "object" ? raw.course : raw;
  if (!source || typeof source !== "object") throw Object.assign(new Error("模型未返回课程对象"), { code: "INVALID_PROTOCOL" });
  const usedSceneIds = new Set();
  const scenes = (Array.isArray(source.scenes) ? source.scenes : []).slice(0, 40).map((scene, index) => normalizeScene(scene, index, usedSceneIds));
  if (!scenes.length) throw Object.assign(new Error("模型未返回有效场景"), { code: "INVALID_PROTOCOL" });
  const course = {
    protocol: PROTOCOL,
    courseId: safeId(source.courseId, safeId(input && input.usageId, `course-${Date.now()}`)),
    title: sanitizeText(source.title, 200) || sanitizeText(input && input.topic, 200) || "智慧课程",
    summary: sanitizeText(source.summary, 1000),
    language: sanitizeText(source.language, 20) || "zh-CN",
    createdAt: sanitizeText(source.createdAt, 80) || new Date().toISOString(),
    assets: [],
    scenes,
  };
  const parsed = courseSchema.safeParse(course);
  if (!parsed.success) throw Object.assign(new Error(`课程协议校验失败: ${parsed.error.issues[0] && parsed.error.issues[0].message}`), { code: "INVALID_PROTOCOL" });
  assertSafeCourse(parsed.data);
  return parsed.data;
}

function repairJson(text) {
  const value = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start < 0 || end <= start) throw Object.assign(new Error("模型响应中没有 JSON 对象"), { code: "INVALID_PROTOCOL" });
  const candidate = value.slice(start, end + 1).replace(/,\s*([}\]])/g, "$1");
  try {
    return JSON.parse(candidate);
  } catch (err) {
    throw Object.assign(new Error("模型返回的 JSON 无法解析"), { code: "INVALID_PROTOCOL", cause: err });
  }
}

module.exports = {
  FORBIDDEN_PAYLOAD,
  PROTOCOL,
  assertSafeCourse,
  normalizeCourse,
  repairJson,
  sanitizeText,
};
