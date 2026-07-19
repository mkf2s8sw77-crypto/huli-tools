const { normalizeCourse, sanitizeText } = require("./contract");

function generateFallbackCourse(input) {
  const topic = sanitizeText(input && input.topic, 160) || "课程主题";
  const audience = sanitizeText(input && input.audience, 120) || "学习者";
  const raw = {
    courseId: input && input.usageId,
    title: `${topic}：精简互动课`,
    summary: `面向${audience}的精简兜底课程，帮助建立概念、判断与行动闭环。`,
    language: "zh-CN",
    createdAt: new Date((input && input.createdAt) || 0).toISOString(),
    scenes: [
      {
        id: "overview",
        kind: "slide",
        title: `认识${topic}`,
        presentation: { layout: "hero", eyebrow: "核心概念" },
        blocks: [
          { id: "content-1", type: "paragraph", text: `${topic}的学习应从目标、风险、证据和反馈四个方面展开。` },
          { id: "content-2", type: "steps", items: [
            { id: "step-1", title: "识别", detail: "明确对象、场景和需要解决的问题。" },
            { id: "step-2", title: "判断", detail: "结合证据、资源与偏好形成判断。" },
            { id: "step-3", title: "行动", detail: "执行后观察结果，及时复评并调整。" },
          ] },
        ],
        actions: [{ type: "speech", text: `先用识别、判断、行动三个步骤理解${topic}。` }],
      },
      {
        id: "check",
        kind: "quiz",
        title: "关键判断",
        presentation: { layout: "challenge", eyebrow: "知识挑战" },
        prompt: `学习${topic}时，较稳妥的第一步是什么？`,
        questionType: "single",
        options: [
          { id: "option-1", text: "先评估具体情境和风险" },
          { id: "option-2", text: "忽略差异，直接套用固定做法" },
        ],
        answers: ["option-1"],
        explanation: "先评估能帮助后续决策与实际情境保持一致。",
        actions: [],
      },
      {
        id: "workshop",
        kind: "interaction",
        title: "行动闭环",
        presentation: { layout: "process", eyebrow: "动手练习" },
        prompt: "依次展开下面三个步骤，形成可执行的行动闭环。",
        interactionType: "steps",
        config: { steps: [
          { id: "step-1", title: "观察", detail: "记录当前表现、风险信号和影响因素。" },
          { id: "step-2", title: "行动", detail: "选择与目标一致、风险可控的措施。" },
          { id: "step-3", title: "复评", detail: "比较行动前后变化，决定维持或调整。" },
        ] },
        actions: [],
      },
      {
        id: "case",
        kind: "pbl",
        title: "情境决策",
        presentation: { layout: "caseboard", eyebrow: "临床推演" },
        caseSummary: `${audience}需要把${topic}应用到一个信息尚不完整的真实情境中。`,
        initialNodeId: "case-1",
        nodes: [
          {
            id: "case-1",
            title: "信息不完整",
            narrative: "你发现现有信息不足以支持直接行动。下一步如何处理？",
            choices: [
              { id: "choice-1", label: "补充评估并确认关键风险", feedback: "先补充信息有助于降低决策偏差。", score: 10, nextNodeId: "case-2" },
              { id: "choice-2", label: "不做确认直接执行", feedback: "缺少评估会放大不确定性。", score: -5, nextNodeId: "" },
            ],
          },
          {
            id: "case-2",
            title: "完成闭环",
            narrative: "信息已补充完整，你需要形成行动与复评安排。",
            choices: [
              { id: "choice-3", label: "执行合适措施并设置复评节点", feedback: "行动与复评共同构成闭环。", score: 10, nextNodeId: "" },
            ],
          },
        ],
        review: "高质量决策不是追求一次命中，而是持续完成评估、行动、复评和调整。",
        actions: [],
      },
    ],
  };
  return normalizeCourse(raw, input);
}

module.exports = { generateFallbackCourse };
