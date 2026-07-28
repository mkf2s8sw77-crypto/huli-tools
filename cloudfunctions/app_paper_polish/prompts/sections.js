// 本文件内容蒸馏自 nature-skills 项目的 nature-polishing 技能（Apache License 2.0）
// 来源：https://github.com/Yuan1z0825/nature-skills （commit 1562ab71e5aec0b313f5311130438ba04c7830c9）
// 改动声明：经裁剪压缩以适配服务端 prompt 注入，仅保留本应用所需规则；router/LaTeX/深参考内容未纳入。
//
// 蒸馏范围：fragments/section/ 下 7 个章节片段与 fragments/journal/generic.md 的压缩改写。
module.exports = {
  SECTION_RULES: {
    abstract: `The abstract is a mini-paper: context/problem -> gap/objective -> approach -> key results -> implication. It must answer: What question was addressed? How was it addressed? What was found? Why should anyone care?
Polishing priorities:
- Cut sentences that summarize background the title already implies.
- Make the gap and the contribution one short, locatable sentence each.
- The last sentence states significance, not a repeat of the result.
- If the target journal requires a strict abstract format, follow the journal over this generic pattern.`,

    intro: `The Introduction should: tell the reader why the work matters; explain what gap it fills and why that gap matters; state what is already known; state what remains unresolved; state what question the paper asks; indicate how the study addresses it. Do not summarize the Results or the Conclusion here.
Common failure modes:
- Opening paragraph reads as a textbook rather than a positioning move.
- The gap is implied but never explicitly named.
- The transition from 'what is known' to 'what this paper does' is missing.
- Methods previewed in detail; keep that for the Methods section.`,

    results: `Results summarize the data collected to address the problem stated in the Introduction: report what was observed, under what conditions, and with what quantitative support. Stay mainly in past tense. Use statistics correctly and sparingly; use supplementary data sparingly. Results answer 'what happened', not 'what it ultimately means'.
Results syntax reports: was detected, increased, showed, enabled, achieved. Do not let a Results paragraph drift into Discussion syntax (may reflect, suggests that, is likely due to) unless the transition is intentional.
Common failure modes:
- Interpreting findings inline instead of in the Discussion.
- Citing supplementary data when the result should stand in the main text.
- Vague comparisons ('higher than control') without effect size or statistical test.`,

    discussion: `The Discussion answers: how the work fits within the broader field; what has been added to understanding; who should be credited for earlier work; whether the findings support, complicate, or revise earlier results; how the findings are interpreted; when that interpretation may fail.
Short rule: Results = what we observed; Discussion = how we understand it, and when it may fail.
Discussion syntax interprets: may reflect, suggests that, could indicate, is likely due to, may facilitate. Hedging strength must match evidence strength; never promote a 'consistent with' finding to 'demonstrates' wording.
Common failure modes:
- Re-summarizing Results instead of interpreting them.
- Skipping rival explanations.
- Omitting boundaries: state when the interpretation stops holding.`,

    conclusion: `Use the three-part close: (1) restate the central contribution; (2) summarize the key evidence or outcome; (3) state the implication with a boundary. Introduce no new data in the conclusion.
Overclaim check, always run:
- Does each claim trace back to evidence in this paper?
- Are mechanism words (demonstrates, proves, establishes) backed by the right study design?
- Is the scope of the implication narrower than or equal to the scope of the evidence?`,

    title: `A strong title: tells the reader what to expect; avoids unnecessary technical language; is easy to search; is substantiated by data; creates curiosity without sacrificing credibility. Curiosity with credibility, not empty cleverness: a hook is acceptable only if the claim remains fully defensible.
Polishing approach:
- If asked for alternatives, generate 3-5 candidates spanning declarative, question, and finding-led patterns; mark the most defensible.
- Strip jargon the target journal's general audience would not recognize.
- Verify every quantitative claim in the title against the manuscript.`,

    methods: `Methods should be specific, complete, transparent, and reproducible. Another group should be able to determine: whether the work conforms to ethical norms; what materials and conditions were used; which key parameters, controls, and replicates were used; how data were processed and analysed; which statistical tests and software versions were used. Abbreviating by citing an earlier report is acceptable only when that report truly contains the necessary detail.
Forbidden vague phrases, never leave in place: 'under standard conditions', 'using routine methods', 'data were analyzed statistically', 'differences were significant', 'samples were randomly assigned', 'the method was validated'. Replace them with the actual reproducible information.`
  },

  JOURNAL_GENERIC_RULES: `GENERIC JOURNAL DEFAULTS (no specific target journal named, or journal not otherwise modeled)
- Apply Nature-leaning style without enforcing Nature's strictest length or significance-framing demands.
- Keep the core defaults on em dashes and hedging.
- If the user later names a journal, ask whether to re-polish under that journal's conventions instead of guessing.
Before final polish, ask the user:
- Target journal and section format: structured vs unstructured abstract, word limits, reference style.
- Audience breadth: subfield vs broad readership.
- Whether the draft will go through a separate copy-edit pass; this decides how aggressively to rewrite vs flag.`
};
