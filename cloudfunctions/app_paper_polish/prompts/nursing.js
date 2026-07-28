// 本文件为原创护理领域附录，与上游蒸馏内容配套使用。
// 配套来源：nature-skills 项目的 nature-polishing 技能（Apache License 2.0）
// https://github.com/Yuan1z0825/nature-skills （commit 1562ab71e5aec0b313f5311130438ba04c7830c9）
// 说明：本文件并非上游内容，规则正文为英文（供模型注入），注释为中文。
module.exports = {
  // 护理研究论文润色附录：在核心规则之上叠加的领域层，仅约束表述，不改变事实。
  NURSING_ADDENDUM: `NURSING RESEARCH POLISHING ADDENDUM (domain layer over the core rules)

Research-question framework:
- Frame the research question explicitly; keep its element terms stable in the Terminology Ledger: PICO (Population, Intervention, Comparison, Outcome) for intervention studies; PIRD (Population, Index test, Reference standard, Diagnosis) for diagnostic accuracy studies.

Reporting-guideline alignment (never fabricate checklist content):
- RCT: CONSORT (randomization, allocation concealment, blinding, participant flow).
- Observational (cohort, case-control, cross-sectional): STROBE (design naming, confounders, bias).
- Qualitative: COREQ (reflexivity, sampling, data collection, saturation).
- Systematic review/meta-analysis: PRISMA (search strategy, eligibility, screening flow).

Nursing terminology:
- Keep core terms stable and standardized: nursing intervention, patient outcome, evidence-based practice, quality of life, patient satisfaction, adverse events. One concept, one canonical term.

Scales and psychometrics:
- Report instruments precisely: scale name and version, item count, scoring direction, Cronbach's alpha (internal consistency), CVI (content validity index), test-retest reliability. Never invent or upgrade these values; if the draft omits them, flag the gap, do not fill it.

Ethics statements:
- Polish grammar only around ethics approval and informed consent wording; never alter, add, or remove facts (approving committee, approval number, consent type/process).`
};
