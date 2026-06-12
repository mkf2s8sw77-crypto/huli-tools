"use strict";

const SCENARIOS = [
  // ── word_undercover × student ──
  {
    scenarioKey: "ws_vital_signs",
    mode: "word_undercover",
    difficulty: "student",
    title: "体温与脉搏",
    publicBrief: "围绕基础生命体征监测的两个常见概念展开讨论",
    civilianSecret: "腋下测温",
    undercoverSecret: "口腔测温",
    knowledgePoints: [
      "腋下测温正常值 36.0-37.0°C，口腔测温正常值 36.3-37.2°C",
      "测量时间和适用人群不同",
    ],
    answerExplanation: "腋下测温操作简单、无创，临床最常用；口腔测温更接近核心体温，但不适用于意识不清或呼吸困难患者。",
  },
  {
    scenarioKey: "ws_hand_hygiene",
    mode: "word_undercover",
    difficulty: "student",
    title: "洗手与手消毒",
    publicBrief: "围绕手卫生的两种常见方式展开讨论",
    civilianSecret: "七步洗手法",
    undercoverSecret: "快速手消毒液",
    knowledgePoints: [
      "七步洗手法适用于手部有可见污染时",
      "快速手消毒液适用于手部无明显污染的常规消毒",
    ],
    answerExplanation: "手部有可见污物或体液接触后必须流动水七步洗手，无可见污染时可使用快速手消毒液，两者不能完全替代。",
  },
  // ── word_undercover × new_nurse ──
  {
    scenarioKey: "wn_shift_handover",
    mode: "word_undercover",
    difficulty: "new_nurse",
    title: "床旁交接与书面交接",
    publicBrief: "围绕护理交接班的两种形式展开讨论",
    civilianSecret: "床旁交接班",
    undercoverSecret: "书面交接班",
    knowledgePoints: [
      "床旁交接班需面对患者核对管路、皮肤、意识等",
      "书面交接班侧重数据和医嘱信息的传递",
    ],
    answerExplanation: "床旁交接班能直观发现患者状态变化，是防止信息遗漏的关键环节；书面交接班确保数据完整可追溯，两者互补。",
  },
  {
    scenarioKey: "wn_medication",
    mode: "word_undercover",
    difficulty: "new_nurse",
    title: "口服给药与静脉给药",
    publicBrief: "围绕两种常见给药途径展开讨论",
    civilianSecret: "口服给药",
    undercoverSecret: "静脉给药",
    knowledgePoints: [
      "口服给药需核对五个R：正确患者、药物、剂量、时间、途径",
      "静脉给药需严格执行无菌操作和输液速度监测",
    ],
    answerExplanation: "口服给药方便安全但起效慢，静脉给药起效快但风险高，需严格核对医嘱和操作规范。",
  },
  // ── word_undercover × specialist ──
  {
    scenarioKey: "wsp_pressure_injury",
    mode: "word_undercover",
    difficulty: "specialist",
    title: "压力性损伤分期",
    publicBrief: "围绕皮肤压力性损伤的两个临床分期概念展开讨论",
    civilianSecret: "2期压力性损伤",
    undercoverSecret: "深部组织损伤",
    knowledgePoints: [
      "2期表现为部分皮层缺损，可见浅表溃疡",
      "深部组织损伤表面可能完整但深层组织已受损",
    ],
    answerExplanation: "2期压力性损伤表皮破损明显可见，而深部组织损伤初期可能仅表现为局部紫色或暗红色区域，需警惕进展。",
  },
  {
    scenarioKey: "wsp_ventilator",
    mode: "word_undercover",
    difficulty: "specialist",
    title: "呼吸机通气模式",
    publicBrief: "围绕ICU常用的两种通气模式展开讨论",
    civilianSecret: "辅助/控制通气（A/C）",
    undercoverSecret: "压力支持通气（PSV）",
    knowledgePoints: [
      "A/C模式每次呼吸都提供完整潮气量保障",
      "PSV模式由患者触发，支持自主呼吸脱机过渡",
    ],
    answerExplanation: "A/C模式适用于呼吸驱动不足的患者，PSV模式用于脱机准备阶段，护士需监测患者呼吸频率和潮气量变化。",
  },
  // ── case_reasoning × student ──
  {
    scenarioKey: "cs_fall_risk",
    mode: "case_reasoning",
    difficulty: "student",
    title: "老年患者跌倒风险",
    publicBrief: "一位70岁住院患者夜间需要如厕，讨论护理安全措施",
    caseBrief: "70岁女性患者，髋关节置换术后第3天，夜间自行下床如厕",
    civilianSecret: "协助患者使用床旁坐便器并拉起床栏",
    undercoverSecret: "让患者自行去卫生间即可",
    safePractice: "术后患者应评估跌倒风险，夜间使用床旁便器，保持床栏上升，确保呼叫器在手边",
    unsafePractice: "未评估活动能力就让术后老年患者独自行走去卫生间",
    riskSignals: ["术后早期活动受限", "夜间光线不足", "老年患者平衡能力下降"],
    knowledgePoints: [
      "术后患者跌倒风险评估（Morse量表）",
      "夜间护理安全措施",
    ],
    answerExplanation: "髋关节置换术后患者活动受限，夜间视线差、反应慢，必须协助如厕并使用防跌倒措施。",
  },
  {
    scenarioKey: "cs_medication_check",
    mode: "case_reasoning",
    difficulty: "student",
    title: "药物过敏核查",
    publicBrief: "患者即将接受抗生素治疗，讨论用药前的核查流程",
    caseBrief: "28岁男性患者因肺炎住院，医嘱静滴青霉素类抗生素",
    civilianSecret: "用药前核查过敏史并进行皮试",
    undercoverSecret: "直接按医嘱配药输液",
    safePractice: "使用青霉素类药物前必须询问过敏史、做皮试、备好急救药品",
    unsafePractice: "跳过过敏史询问和皮试直接给药",
    riskSignals: ["未核查过敏史", "未做皮试", "未备急救物品"],
    knowledgePoints: [
      "青霉素类药物皮试的必要性",
      "过敏性休克的应急处理流程",
    ],
    answerExplanation: "青霉素类药物过敏反应可能危及生命，用药前必须核查过敏史并做皮试，这是护理安全的基本要求。",
  },
  // ── case_reasoning × new_nurse ──
  {
    scenarioKey: "cn_insulin",
    mode: "case_reasoning",
    difficulty: "new_nurse",
    title: "胰岛素注射安全",
    publicBrief: "糖尿病患者需要注射胰岛素，讨论注射前后的护理要点",
    caseBrief: "62岁2型糖尿病患者，餐前需皮下注射门冬胰岛素",
    civilianSecret: "注射前测血糖、核对胰岛素种类和剂量、选择腹部注射并轮换部位",
    undercoverSecret: "抽好胰岛素直接注射即可",
    safePractice: "注射前监测血糖，核对胰岛素类型（速效/长效），选择正确注射部位并定期轮换",
    unsafePractice: "不测血糖、不核对胰岛素种类就直接注射",
    riskSignals: ["未测餐前血糖", "胰岛素种类混淆", "注射部位固定不轮换"],
    knowledgePoints: [
      "不同胰岛素类型的起效时间和使用时机",
      "注射部位轮换防止脂肪增生",
    ],
    answerExplanation: "速效和长效胰岛素使用时机不同，混淆可能导致低血糖或高血糖危象；注射部位需规律轮换。",
  },
  {
    scenarioKey: "cn_chest_tube",
    mode: "case_reasoning",
    difficulty: "new_nurse",
    title: "胸腔引流管护理",
    publicBrief: "胸外科患者留置胸腔闭式引流管，讨论日常护理观察要点",
    caseBrief: "55岁男性患者，肺叶切除术后留置胸腔闭式引流管",
    civilianSecret: "保持引流瓶低于胸腔，观察水柱波动和引流液性状",
    undercoverSecret: "定时夹闭引流管让患者休息",
    safePractice: "引流瓶必须低于胸腔引流口60cm以上，保持管路通畅，观察水柱波动和引流量",
    unsafePractice: "随意夹闭引流管可能导致气胸或纵隔移位",
    riskSignals: ["引流管受压折叠", "引流瓶高于胸腔", "随意夹管"],
    knowledgePoints: [
      "胸腔闭式引流的原理和护理要点",
      "水柱波动消失的可能原因和处理",
    ],
    answerExplanation: "胸腔闭式引流利用水封瓶负压原理排出气体和液体，随意夹管可能造成张力性气胸等严重后果。",
  },
  // ── case_reasoning × specialist ──
  {
    scenarioKey: "csp_central_line",
    mode: "case_reasoning",
    difficulty: "specialist",
    title: "中心静脉导管感染防控",
    publicBrief: "ICU患者留置中心静脉导管，讨论导管相关血流感染的预防措施",
    caseBrief: "48岁ICU患者，颈内静脉置管第7天，出现不明原因发热",
    civilianSecret: "评估导管留置必要性、检查穿刺点、采集血培养后考虑拔管",
    undercoverSecret: "继续使用导管并加用广谱抗生素",
    safePractice: "每日评估导管必要性，无菌换药，发热时采集外周和导管血培养配对送检",
    unsafePractice: "不评估导管必要性、不采血培养就经验性用药",
    riskSignals: ["导管留置超过必要时限", "穿刺点红肿未及时处理", "未做血培养"],
    knowledgePoints: [
      "CLABSI预防Bundle措施",
      "导管相关感染的鉴别诊断流程",
    ],
    answerExplanation: "中心静脉导管留置时间越长感染风险越高，ICU护士需每日评估留置必要性，发热时规范采集配对血培养。",
  },
  {
    scenarioKey: "csp_wound_assessment",
    mode: "case_reasoning",
    difficulty: "specialist",
    title: "慢性伤口评估",
    publicBrief: "一位糖尿病足患者的伤口需要专科评估，讨论评估要点和处理原则",
    caseBrief: "65岁糖尿病患者，右足底溃疡反复不愈合，已持续3周",
    civilianSecret: "全面评估伤口床、边缘、渗液、感染征象和周围皮肤，制定换药方案",
    undercoverSecret: "常规碘伏消毒后纱布覆盖即可",
    safePractice: "使用TIME框架评估伤口，关注组织类型、感染控制、湿度平衡和边缘上皮化",
    unsafePractice: "不做系统评估、千篇一律使用碘伏纱布换药",
    riskSignals: ["伤口床坏死组织未清创", "渗液管理不当", "未关注全身营养和血糖控制"],
    knowledgePoints: [
      "TIME伤口评估框架",
      "糖尿病足溃疡的多学科管理要点",
    ],
    answerExplanation: "慢性伤口需要系统评估而非简单换药，糖尿病足溃疡需关注血糖控制、营养支持和减压措施。",
  },
];

const NPC_NAMES = [
  "林护士", "陈护士", "周护士", "张护士",
  "王护士", "李护士", "赵护士", "吴护士",
];

function getScenarios(mode, difficulty) {
  return SCENARIOS.filter(
    (s) => s.mode === mode && s.difficulty === difficulty
  );
}

function getScenarioByKey(key) {
  return SCENARIOS.find((s) => s.scenarioKey === key) || null;
}

function getAllScenarios() {
  return SCENARIOS;
}

function pickRandomScenario(mode, difficulty) {
  const list = getScenarios(mode, difficulty);
  if (!list.length) return null;
  return list[Math.floor(Math.random() * list.length)];
}

function getNpcNames(count) {
  const shuffled = NPC_NAMES.slice().sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function getConfigMeta() {
  const modes = [
    { key: "word_undercover", label: "词语卧底", desc: "两个相近护理概念，找出拿到不同密令的卧底" },
    { key: "case_reasoning", label: "病例推理卧底", desc: "围绕护理情境，找出持有不安全措施的卧底" },
  ];
  const difficulties = [
    { key: "student", label: "护理学生", desc: "基础护理、安全核查" },
    { key: "new_nurse", label: "新护士规培", desc: "临床操作、交接、风险预警" },
    { key: "specialist", label: "专科护士", desc: "ICU、伤口、糖尿病等专科场景" },
  ];
  const npcRange = { min: 4, max: 6 };
  const roundRange = { min: 2, max: 3 };

  const scenarioMeta = {};
  for (const m of modes) {
    scenarioMeta[m.key] = {};
    for (const d of difficulties) {
      const list = getScenarios(m.key, d.key);
      scenarioMeta[m.key][d.key] = list.map((s) => ({
        scenarioKey: s.scenarioKey,
        title: s.title,
        publicBrief: s.publicBrief,
      }));
    }
  }

  return { modes, difficulties, npcRange, roundRange, scenarioMeta };
}

module.exports = {
  getScenarios,
  getScenarioByKey,
  getAllScenarios,
  pickRandomScenario,
  getNpcNames,
  getConfigMeta,
  NPC_NAMES,
};
