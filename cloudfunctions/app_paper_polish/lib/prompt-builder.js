// prompt 组装纯函数：语言检测、章节归一化、消息构建、模型输出解析
// 规则文本来自 prompts/ 下的蒸馏模块（nature-polishing，Apache-2.0）与护理领域附录
const { CORE_RULES } = require("../prompts/core");
const { EN_RULES, ZH_TO_EN_RULES } = require("../prompts/language");
const { SECTION_RULES, JOURNAL_GENERIC_RULES } = require("../prompts/sections");
const { NURSING_ADDENDUM } = require("../prompts/nursing");

const MAX_INPUT_CHARS = 20000;
const MAX_SECTIONS = 7;
const SECTION_KEYS = ["abstract", "intro", "results", "discussion", "conclusion", "title", "methods"];

// 中文字符在非空白字符中的占比超过该阈值时，按"中译英"模式处理
const ZH_RATIO_THRESHOLD = 0.1;
const MIN_ZH_CHARS = 20;

function detectLanguage(text) {
  const source = typeof text === "string" ? text : "";
  const compact = source.replace(/\s/g, "");
  if (!compact) return "en";
  const zhChars = (compact.match(/[一-龥]/g) || []).length;
  if (zhChars >= MIN_ZH_CHARS && zhChars / compact.length >= ZH_RATIO_THRESHOLD) {
    return "zh-to-en";
  }
  return "en";
}

function normalizeSections(input) {
  const list = Array.isArray(input) ? input : [];
  const seen = {};
  const result = [];
  for (let i = 0; i < list.length; i += 1) {
    const key = typeof list[i] === "string" ? list[i].trim() : "";
    if (SECTION_KEYS.indexOf(key) === -1 || seen[key]) continue;
    seen[key] = true;
    result.push(key);
    if (result.length >= MAX_SECTIONS) break;
  }
  return result;
}

function validateInput(text) {
  if (typeof text !== "string" || !text.trim()) {
    return { code: "POLISH_EMPTY_INPUT", message: "请先粘贴需要润色的论文草稿" };
  }
  if (text.length > MAX_INPUT_CHARS) {
    return { code: "POLISH_INPUT_TOO_LONG", message: "草稿最长支持 " + MAX_INPUT_CHARS + " 字符，请分段提交" };
  }
  return null;
}

const OUTPUT_CONTRACT = [
  "## Output contract (strict)",
  "Return ONLY a JSON object with no markdown fences and no extra text:",
  '{ "polished": "<the polished English manuscript>", "summary": ["<改动要点1（中文）>", "..."] }',
  "- polished: the full polished English text. Preserve the original academic meaning exactly; do not invent content, data, citations or references.",
  "- summary: 3-8 concise Chinese bullet points describing the main improvements made (structure, logic, language).",
  "- If a paragraph has a structural problem that cannot be fixed without inventing content, keep the text faithful and mention the issue in summary instead.",
].join("\n");

function buildSystemPrompt(language, sections) {
  const parts = [CORE_RULES];
  parts.push(language === "zh-to-en" ? ZH_TO_EN_RULES : EN_RULES);
  const picked = sections && sections.length ? sections : SECTION_KEYS;
  const sectionRules = picked
    .map((key) => SECTION_RULES[key])
    .filter((rule) => typeof rule === "string" && rule);
  if (sections && sections.length) {
    parts.push("The draft should be treated as the following section(s): " + sections.join(", ") + ".");
  } else {
    parts.push("The draft may contain one or more manuscript sections. Detect section boundaries yourself and apply the matching per-section rules below.");
  }
  parts.push(sectionRules.join("\n\n"));
  parts.push(JOURNAL_GENERIC_RULES);
  parts.push(NURSING_ADDENDUM);
  parts.push(OUTPUT_CONTRACT);
  return parts.filter((part) => typeof part === "string" && part).join("\n\n");
}

function buildMessages(options) {
  const text = options && typeof options.text === "string" ? options.text : "";
  const sections = normalizeSections(options && options.sections);
  const language = (options && options.language) || detectLanguage(text);
  const system = buildSystemPrompt(language, sections);
  const user = language === "zh-to-en"
    ? "请将以下中文论文草稿翻译并润色为 Nature 风格英文，保持学术含义完全不变：\n\n" + text
    : "Please polish the following academic draft into publication-quality English, preserving the exact academic meaning:\n\n" + text;
  return {
    language,
    sections,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
}

// 解析模型输出：优先严格 JSON，兼容代码围栏，失败时降级为纯文本
function parseModelOutput(raw) {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) {
    return { ok: false, error: { code: "POLISH_OUTPUT_EMPTY", message: "模型未返回有效内容" } };
  }
  const candidates = [text];
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch && fenceMatch[1]) {
    candidates.unshift(fenceMatch[1].trim());
  }
  for (let i = 0; i < candidates.length; i += 1) {
    try {
      const parsed = JSON.parse(candidates[i]);
      if (parsed && typeof parsed.polished === "string" && parsed.polished.trim()) {
        const summary = Array.isArray(parsed.summary)
          ? parsed.summary.filter((item) => typeof item === "string" && item.trim()).slice(0, 10)
          : [];
        return { ok: true, polished: parsed.polished.trim(), summary, degraded: false };
      }
    } catch (err) {
      // 继续尝试下一个候选
    }
  }
  return { ok: true, polished: text, summary: [], degraded: true };
}

module.exports = {
  MAX_INPUT_CHARS,
  SECTION_KEYS,
  detectLanguage,
  normalizeSections,
  validateInput,
  buildMessages,
  parseModelOutput,
};
