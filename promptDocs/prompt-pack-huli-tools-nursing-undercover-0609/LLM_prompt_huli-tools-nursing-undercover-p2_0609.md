# LLM Prompt: huli-tools nursing_undercover Phase 2/3

## 阶段目标

在 Phase 1 已完成的平台竖切上，接入 CloudBase AI 大模型，补齐 `词语卧底` 和 `病例推理卧底` 双模式、三档难度、AI NPC 发言、AI NPC 投票和教学复盘。

本阶段完成后，应用应从“模板 NPC 最小闭环”升级为“AI NPC 参与的护理教学卧底游戏”。用户能选择任一模式和难度开始一局，AI NPC 根据隐藏身份发言，投票后生成有教学价值的复盘。

## 必读输入

- `/Users/huli-dev/Documents/huli-tools/AGENTS.md`
- `/Users/huli-dev/Documents/huli-tools/promptDocs/prompt-pack-huli-tools-nursing-undercover-0609/master_spec_huli-tools-nursing-undercover_0609.md`
- `/Users/huli-dev/Documents/huli-tools/promptDocs/prompt-pack-huli-tools-nursing-undercover-0609/test_case_huli-tools-nursing-undercover_0609.md`
- Phase 1 实际交接说明和当前代码
- `/Users/huli-dev/.codex/skills/cloudbase/SKILL.md`
- `/Users/huli-dev/.codex/skills/cloudbase/references/miniprogram-development/SKILL.md`
- `/Users/huli-dev/.codex/skills/cloudbase/references/ai-model-nodejs/SKILL.md`

## 前置检查

在写 CloudBase AI SDK 调用前，必须完成 CloudBase AI preflight：

1. 确认当前环境 ID 是 `cloudbase-3gphz7fk0fe1b760`。如果 MCP 未绑定环境，先用 CloudBase MCP 的 `auth` / `envQuery` 按技能说明处理。
2. 调用 `DescribeEnvPostpayPackage` 检查 Token Credits 资源包。
3. 调用 `DescribeAIModels` 检查 `cloudbase` GroupName 和已启用模型。
4. 如目标模型未启用，先查 `DescribeManagedAIModelList`，确认官方模型 ID 和价格，再按技能说明启用。

如果无法完成 MCP 登录、环境绑定、资源包检查或模型启用，不要猜模型、不硬编码密钥、不写会误导用户的“假 AI 已接入”。此时应在交接说明中记录阻塞，并保留 Phase 1 的确定性模板能力。

## 任务清单

1. 引入 CloudBase AI SDK。
   - 在 `cloudfunctions/app_nursing_undercover/package.json` 增加 `@cloudbase/node-sdk`，版本需满足技能要求。
   - 新增独立 AI 编排模块，例如 `cloudfunctions/app_nursing_undercover/ai.js`。
   - `ai.createModel("cloudbase")` 的参数只能是 GroupName；具体模型 ID 放入调用参数。
   - 模型 ID 不要从记忆猜，使用 preflight 确认后的模型 ID；建议在模块顶部集中常量化并注释来源。

2. 扩展内置场景库。
   - `word_undercover` 每档难度至少 2 个场景。
   - `case_reasoning` 每档难度至少 2 个场景。
   - 总数至少 12 个场景。
   - 场景不要包含真实患者隐私。
   - `护理学生` 偏基础护理、安全核查、沟通和常见护理措施。
   - `新护士规培` 加入班次交接、医嘱执行、风险预警、临床情境判断。
   - `专科护士` 可涉及 ICU、伤口、糖尿病、肿瘤等专科场景，但避免编造具体医嘱剂量或指南条款。

3. 实现 AI NPC 发言。
   - `submitSpeech` 记录玩家发言后，为本轮未发言的 AI NPC 生成发言。
   - 每个 NPC 的 prompt 只能拿到自己角色需要的信息；不要在 prompt 中要求模型泄露答案。
   - 模型输出必须要求 JSON 结构，例如 `{ "speech": "...", "privateReasoning": "..." }`；服务端只保存和返回可公开发言。
   - 严格限制发言长度，避免小程序卡片溢出。建议每个 NPC 发言 60-120 字。
   - 如果 AI 返回非 JSON 或缺字段，返回 `AI_RESPONSE_INVALID`，不要静默用空发言。

4. 实现 AI NPC 投票与复盘。
   - `submitVote` 记录玩家投票后，AI NPC 基于公开 transcript 生成投票和理由。
   - 计算票数，平票使用稳定规则：优先选择玩家投票目标；仍平票则按 roleId 排序最小者。
   - 生成 `debrief`：包括 `summary`、`keyClues`、`knowledgePoints`、`safetyNotes`。
   - 对局完成后调用 `coreApp.finishUsage`，`resultRef` 至少包含 `sessionId`、`mode`、`difficulty`、`playerWon`。

5. 补齐小程序双模式体验。
   - 开局配置开放两种模式和三档难度。
   - 根据 mode 展示不同说明：词语卧底强调不能直接说出密令；病例推理强调从护理安全角度找异常。
   - 发言、投票、结果区能兼容两种模式。
   - 错误提示展示稳定错误码的用户友好文案，例如模型未就绪、生成失败、对局状态异常。

6. 异常与状态处理。
   - AI 生成失败导致无法继续时，将 session 标记为 `failed`，并调用 `coreApp.failUsage`。
   - 不要自动重试轰炸模型。最多允许一次短路的格式修复尝试；如果失败，返回错误。
   - 已完成 session 不允许重新生成复盘或重复结算。

## 范围边界

要做：

- CloudBase AI 服务端编排。
- 双模式和三档难度内容。
- AI NPC 发言、投票、复盘。
- 对局数据结构兼容历史回看。

不要做：

- 不做教师配置后台。
- 不做 admin-web。
- 不做外部大模型 provider。
- 不让小程序端直接调用 AI。
- 不为了 AI 接入修改公共积分和支付状态机。

## 实现约束

- AI 编排模块必须可单独阅读，prompt 构造、JSON 解析、错误分类清晰。
- 所有模型输入都要剔除不应泄露的隐藏答案；未结束前客户端也不得拿到答案。
- `submitSpeech` 和 `submitVote` 的幂等行为不能被 AI 接入破坏。
- 如果 Phase 1 的确定性模板保留为 fallback，必须只用于 `AI_NOT_READY` 明确场景，并在响应中标记 `fallback: true`；不要把 fallback 伪装为 AI 输出。
- 复盘文案必须写明“仅用于护理教学训练”。

## 验证要求

至少运行：

```bash
cd /Users/huli-dev/Documents/huli-tools
bash scripts/check-js.sh
bash scripts/check-boundaries.sh
bash scripts/check-admin-web-boundaries.sh
git diff --check
```

如 CloudBase MCP 和环境可用，还需验证：

- `DescribeEnvPostpayPackage` 有可用 Token Credits。
- `DescribeAIModels` 中目标模型已启用。
- 部署或本地调用 `app_nursing_undercover` 后，至少完成一局词语卧底和一局病例推理。

人工检查：

- AI NPC 发言没有泄露密令或直接说出“我是卧底”。
- 病例推理复盘没有输出真实医疗建议或患者隐私。
- 模型异常路径不会让 usage 长期卡在 `frozen`。

## 交接说明

Phase 2 完成后交接给 Phase 3 时必须说明：

- 实际使用的 CloudBase AI GroupName 和模型 ID。
- preflight 结果和是否启用过模型。
- AI 失败路径如何落库、如何释放 usage。
- 已覆盖的内置场景数量和分布。
- 仍需 Phase 3 打磨的 UI、历史记录或文档项。
