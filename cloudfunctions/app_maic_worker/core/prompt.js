const { sanitizeText } = require("./contract");

const SYSTEM_PROMPT = `你是 MAIC 原生小程序课程生成器。只返回一个 JSON 对象，不要 Markdown，不要解释。
协议必须为 maic-miniapp/1，assets 必须是空数组。课程包含 4-10 个 scenes，kind 仅允许 slide、quiz、interaction、pbl。
slide.blocks 仅允许 paragraph、list、callout、table、steps、diagram；禁止 image、HTML、脚本、WebView 和 URL。
actions 仅允许 speech、highlight、spotlight、laser、pause，绝对不要输出 navigate。
quiz 必须包含 prompt、questionType(single|multiple)、options、answers、explanation。
interactionType 仅允许 tabs、matching、sorting、steps，config 必须能完成互动。
pbl 必须包含 caseSummary、initialNodeId、nodes、review；choice.nextNodeId 只能引用同一场景已有 node，空字符串表示结束。
所有 id 仅使用英文、数字、下划线或短横线。内容使用简体中文，强调安全、循证和可执行性。`;

function buildUserPrompt(input) {
  return JSON.stringify({
    task: "生成一门可在微信小程序原生播放器中直接执行的互动课程",
    usageId: sanitizeText(input.usageId, 120),
    topic: sanitizeText(input.topic, 500),
    audience: sanitizeText(input.audience, 200),
    durationMinutes: Number(input.durationMinutes || 10),
    requirements: sanitizeText(input.requirements, 3000),
  });
}

function buildCorrectionPrompt(input, previousText, errorMessage) {
  return `${buildUserPrompt(input)}\n上一次响应未通过协议校验。错误：${sanitizeText(errorMessage, 500)}。请重新输出完整、合法的单个 JSON 对象。不要复述错误，也不要输出 Markdown。上次响应摘要：${sanitizeText(previousText, 1200)}`;
}

module.exports = { SYSTEM_PROMPT, buildCorrectionPrompt, buildUserPrompt };
