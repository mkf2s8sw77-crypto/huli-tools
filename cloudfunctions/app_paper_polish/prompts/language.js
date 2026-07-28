// 本文件内容蒸馏自 nature-skills 项目的 nature-polishing 技能（Apache License 2.0）
// 来源：https://github.com/Yuan1z0825/nature-skills （commit 1562ab71e5aec0b313f5311130438ba04c7830c9）
// 改动声明：经裁剪压缩以适配服务端 prompt 注入，仅保留本应用所需规则；router/LaTeX/深参考内容未纳入。
//
// 蒸馏范围：fragments/language/en.md 与 zh-to-en.md 的压缩改写。
module.exports = {
  EN_RULES: `ENGLISH POLISHING RULES (English-source drafts)

Sentence rules:
- Aim for 10-30 words per sentence; keep every sentence at or under 30 words.
- Do not produce full sentences under 10 words unless the user asks for a terse style, or the item is a heading, label, or fixed technical expression.
- If a sentence exceeds 20 words, check whether it contains more than one main proposition. Prefer one core subject-verb proposition per sentence.
- Split overloaded sentences rather than polishing them cosmetically.
- The last sentence of a paragraph often becomes the longest and weakest; check it explicitly.
- No em dashes as prose punctuation unless the user explicitly requests them; rewrite with commas, parentheses, or shorter sentences. Use colons only when they add clear structural value.

Paragraph rules:
- Each paragraph has one controlling idea followed by support: data, comparison, explanation, consequence, literature, or limitation.
- If a new idea appears, start a new paragraph instead of stacking it onto the old one.
- Link paragraphs thematically; avoid repetitive 'This suggests ...' openings.`,

  ZH_TO_EN_RULES: `CHINESE-TO-ENGLISH POLISHING RULES
Apply when the source is Chinese or strongly Chinese-influenced English. Do not translate clause-by-clause.

Workflow:
1. Extract the core propositions first; list them in plain English before drafting prose.
2. Reconstruct explicit logical links: contrast, cause, implication, limitation. Chinese academic prose often elides these connectives; restore them.
3. Verify terminology, causality, and hedging strength against the source.
4. Keep technical terms, gene/protein names, model names, dataset names, and statistical terms stable; never 'translate' them into rough paraphrases.
5. Apply the English sentence and paragraph rules only after the logic is rebuilt.

Common Chinese-influenced patterns to fix:
- Topic-comment chains: rewrite as subject-verb sentences with an explicit grammatical subject.
- Strings of short clauses joined by commas: split into separate sentences or add explicit connectives.
- Vague generalizations ('many studies have shown'): convert to specific citations or remove.
- Hedging asymmetry: Chinese drafts often understate; use precise hedging matched to evidence strength, neither over- nor under-claiming.
- Repetition of the topic noun where English would use a pronoun or omit it.`
};
