"use strict";

// 模型 JSON 输出清洗：剥离推理模型的 <think> 思维链与 markdown 代码围栏。
// MiniMax-M3 等推理模型会在正文前输出 <think>...</think>，maxTokens 截断时
// 闭合标签可能缺失，两种形态都要剥掉，否则 JSON.parse 必败。

function cleanModelJsonText(text) {
  return String(text || "")
    .replace(/<think>[\s\S]*?(<\/think>|$)/gi, "")
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
}

module.exports = { cleanModelJsonText };
