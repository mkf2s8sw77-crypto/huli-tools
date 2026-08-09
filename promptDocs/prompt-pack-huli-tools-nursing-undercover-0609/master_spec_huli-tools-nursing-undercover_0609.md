# Master Spec: huli-tools nursing_undercover

## 1. 背景与目标

`huli-tools` 是一个“平台底座 + 垂直应用”的微信小程序项目，并带有 `admin-web/` 管理端。平台底座提供用户、积分、应用目录、使用记录、充值支付和管理员能力；每个垂直应用拥有自己的页面、云函数和私有 collection。

本次新增第三个垂直应用：`谁是卧底（护理版）`。它是护理教学领域的互动推理小游戏：若干 AI 大模型 NPC 和玩家同局参与，规则类似“谁是卧底”。应用需要同时支持经典词语卧底训练和护理病例推理训练，让用户在游戏中辨别护理概念差异、不安全护理措施、遗漏风险点和关键线索。

最终应用必须从 0 落地为标准平台竖切：

- 显示名：`谁是卧底（护理版）`
- `appKey`：`nursing_undercover`
- 页面入口：`/pages/apps/nursing_undercover/index`
- 云函数：`app_nursing_undercover`
- 私有 collection：`app_nursing_undercover_sessions`
- 首页应用图标：使用现有 `.icon-tile` CSS-only 体系，不用单字或 emoji 占位

## 2. 产品决策

- 首版包含双模式：`词语卧底` 和 `病例推理卧底`。
- 首版包含三档难度：`护理学生`、`新护士规培`、`专科护士`，由用户开局选择。
- 首版内容源为内置场景库，不做教师端配置，不接外部病例库。
- AI NPC 由云函数服务端编排调用 CloudBase AI 大模型；客户端不得直连模型或保存模型密钥。
- 玩家也可能成为卧底，不只是旁观识别 AI NPC。
- 开局允许用户调整 AI NPC 数和发言轮数；首版限制为 AI NPC `4-6` 个、发言轮数 `2-3` 轮、卧底 `1` 名。
- 保存学习记录和复盘：对局、发言、投票、正确答案、胜负和 AI 点评必须可回看。
- 首版价格默认 `0` 积分，但仍必须完整走 `coreApp.createUsage` 到 `finishUsage` / `failUsage` 状态机。

## 3. 成功标准

- 首页应用目录出现 `谁是卧底（护理版）`，点击能进入 `/pages/apps/nursing_undercover/index`。
- 用户能选择模式、难度、AI NPC 数、轮数并开始一局。
- 用户能看到自己的身份密令，按轮次发言，等待 AI NPC 发言，最终投票并看到结果。
- 词语卧底模式能训练护理术语、护理措施或风险概念差异。
- 病例推理模式能围绕护理情境暴露错误判断、遗漏风险或不安全措施，并在复盘中解释正确护理思路。
- 玩家为卧底和玩家为平民两类局面都可完成。
- 对局结束后，`app_usage_records` 状态变为 `succeeded`；失败或取消路径释放或标记 usage，不能留下不可恢复的冻结状态。
- `app_nursing_undercover_sessions` 只保存当前应用私有数据，客户端不直连 collection。
- AI 调用失败、模型未启用、响应格式异常时返回稳定错误码，不静默吞错。
- 新增云函数、页面、collection 和测试说明同步更新到项目文档。

## 4. Phase Sizing

本次拆为 3 个 phase。

- **Phase 1：平台竖切与可玩最小对局**。新增应用骨架、云函数、私有 collection 契约和小程序页面；先用确定性模板 NPC 发言做词语卧底最小可玩闭环，验证平台状态机、页面流和数据写入。
- **Phase 2：CloudBase AI 编排、双模式和三档难度**。接入 CloudBase AI，补齐词语卧底和病例推理两个模式的内置场景库、AI NPC 发言、AI 投票和复盘。
- **Phase 3：历史回看、文档同步和完整验收**。补齐用户历史记录、异常状态恢复、体验打磨、项目文档、主测试清单和运行清单，完成全量 gate 与小程序预览准备。

为什么不是 2 个 phase：AI 大模型接入、护理场景质量、多人游戏状态机和小程序交互都是独立风险，压在两段里会让单个 coding Agent 难以闭环。为什么不是 4 个 phase：历史、文档和验收虽然必要，但没有独立到需要拆成单独大里程碑，应和最终收口合并。

## 5. 非目标

- 不做真人多人联机。
- 不做教师端、题库后台或 admin-web 配置页面。
- 不做支付、充值、积分账本、订单或管理员权限模型改造。
- 不接外部大模型 API，不新增独立业务后端。
- 不采集真实患者隐私，不允许用户输入患者姓名、住院号、身份证号、电话等敏感信息。
- 不把护理内容当作医疗建议输出；复盘文案必须定位为教学训练。
- 不发布正式线上版本，除非用户在执行阶段另行要求。

## 6. 当前仓库事实

项目根目录：

```bash
/Users/huli-dev/Documents/huli-tools
```

必须先读：

- `/Users/huli-dev/Documents/huli-tools/AGENTS.md`
- `/Users/huli-dev/Documents/huli-tools/docs/app_boundary_and_onboarding.md`
- `/Users/huli-dev/Documents/huli-tools/docs/cloud_collections.md`
- `/Users/huli-dev/Documents/huli-tools/docs/design_system.md`
- 本 prompt pack 的 `master_spec`、当前 phase prompt 和 `test_case`

关键入口：

- 小程序配置：`project.config.json`
- 小程序 appid：`wx1654159e6e3bb334`
- CloudBase envId：`cloudbase-3gphz7fk0fe1b760`
- 云函数清单：`cloudbaserc.json`
- 小程序全局页面：`miniprogram/app.json`
- 小程序 API 封装：`miniprogram/services/api.js`
- 首页应用卡片：`miniprogram/pages/index/`
- 现有垂直应用：`miniprogram/pages/apps/ai_draw/`
- 新应用模板：`templates/app_vertical_slice/`
- 云函数模板：`templates/app_vertical_slice/cloudfunctions/app___appKey__/`
- 应用接入文档：`docs/app_boundary_and_onboarding.md`
- 公共 collection 文档：`docs/cloud_collections.md`
- 公共 UI 组件：`miniprogram/components/ui/`
- 公共样式和 icon-tile：`miniprogram/styles/common.wxss`

现有平台规则：

- 微信小程序原生语法，不引入 Taro、uni-app、React/Vue 或大型状态管理库。
- 云函数使用 CommonJS，两空格缩进。
- 客户端不可信；所有写操作走云函数。
- 云函数通过 `cloud.getWXContext().OPENID` 获取身份，禁止信任客户端传入 `openid`、`userId`、角色、价格、积分数量。
- 应用云函数只允许只读当前 `usageId` 对应的 `app_usage_records` 做归属和状态校验，不能写公共集合。
- 业务私有 collection 必须以 `app_<appKey>_` 开头。
- `INTERNAL_API_SECRET` 必须在 `coreApp`、`corePoints`、`corePayment`、`adminCore`、`demoSum` 和所有 `app_*` 云函数中保持一致。

## 7. 数据模型

新增 collection：`app_nursing_undercover_sessions`。

建议文档字段：

```js
{
  _id: "sessionId",
  userId: "OPENID",
  usageId: "app_usage_records._id",
  appKey: "nursing_undercover",
  mode: "word_undercover" | "case_reasoning",
  difficulty: "student" | "new_nurse" | "specialist",
  scenarioKey: "string",
  scenarioTitle: "string",
  npcCount: 4,
  roundCount: 2,
  currentRound: 1,
  status: "created" | "in_progress" | "voting" | "finished" | "cancelled" | "failed",
  roles: [
    {
      roleId: "player" | "npc_1",
      displayName: "我" | "林护士",
      actorType: "player" | "ai",
      team: "civilian" | "undercover",
      secretLabel: "只给当前用户或服务端使用",
      publicProfile: "不泄露答案的角色简介"
    }
  ],
  playerRoleId: "player",
  undercoverRoleId: "player" | "npc_1",
  transcript: [
    {
      roundNo: 1,
      roleId: "player",
      actorType: "player" | "ai",
      text: "发言内容",
      createdAt: Date
    }
  ],
  votes: [
    {
      roleId: "player",
      targetRoleId: "npc_2",
      reason: "投票理由",
      createdAt: Date
    }
  ],
  result: {
    winner: "civilian" | "undercover",
    playerWon: true,
    votedOutRoleId: "npc_2",
    correctUndercoverRoleId: "npc_2"
  },
  debrief: {
    summary: "教学复盘",
    keyClues: ["线索"],
    knowledgePoints: ["知识点"],
    safetyNotes: ["安全提醒"]
  },
  actionReceipts: [
    {
      clientActionId: "string",
      action: "submitSpeech",
      resultDigest: "string",
      createdAt: Date
    }
  ],
  errorCode: "",
  errorMessage: "",
  createdAt: Date,
  updatedAt: Date,
  finishedAt: Date
}
```

隐私与权限要求：

- 客户端只通过 `app_nursing_undercover` 读写，不直接访问 collection。
- `secretLabel` 可以存库，但任何 `getGame` / `listMyGames` 返回前必须按当前阶段过滤：未结束时只能返回玩家自己的密令，不得泄露 NPC 或卧底答案。
- 对局结束后可返回完整复盘、正确答案和关键线索。
- 所有时间用服务端 `Date`。

## 8. 云函数接口

云函数：`app_nursing_undercover`。统一返回平台格式：

```js
{ ok: true, data: {}, requestId: "" }
{ ok: false, error: { code: "", message: "" }, requestId: "" }
```

需要实现的 action：

- `listConfig`：返回模式、难度、NPC 数、轮数范围和可展示场景元数据；不暴露答案。
- `startGame`：参数 `usageId, mode, difficulty, npcCount, roundCount, scenarioKey?`；校验 usage 后创建 session。
- `submitSpeech`：参数 `sessionId, roundNo, text, clientActionId`；记录玩家发言，生成本轮 AI NPC 发言，推进轮次。
- `suggestSpeech`：参数 `sessionId`；只读 action，为当前轮尚未发言的玩家生成 3 条候选发言（经 coreModel 网关，capability `speech_suggestion`），不写库、无需幂等键；模型不可用时按场景知识点模板降级，返回 `{ suggestions, fallback }`。
- `submitVote`：参数 `sessionId, targetRoleId, clientActionId`；记录玩家投票，生成 AI NPC 投票，计算结果，生成复盘，调用 `coreApp.finishUsage`。
- `getGame`：参数 `sessionId`；返回当前用户自己的对局，未结束时隐藏答案。
- `listMyGames`：分页返回当前用户自己的最近对局。
- `cancelGame`：未完成对局可取消，并调用 `coreApp.failUsage`。

幂等要求：

- `startGame` 对同一 `usageId` 重复调用应返回既有 session，不新建第二局。
- `submitSpeech` 和 `submitVote` 必须校验 `clientActionId`，重复请求返回已记录结果，不重复生成 NPC 发言、不重复投票、不重复结算。
- 已 `finished`、`cancelled`、`failed` 的 session 不能继续发言或投票。

稳定错误码建议：

- `UNAUTHORIZED`
- `INVALID_PARAM`
- `USAGE_NOT_FOUND`
- `FORBIDDEN`
- `APP_MISMATCH`
- `INVALID_STATUS`
- `SESSION_NOT_FOUND`
- `SESSION_LOCKED`
- `DUPLICATE_ACTION`
- `AI_NOT_READY`
- `AI_RESPONSE_INVALID`
- `AI_GENERATION_FAILED`
- `DB_ERROR`
- `FINISH_USAGE_FAILED`
- `FAIL_USAGE_FAILED`

## 9. AI 与场景规则

Phase 2 才接入 CloudBase AI。实现前必须读取相关技能：

- `/Users/huli-dev/.codex/skills/cloudbase/SKILL.md`
- `/Users/huli-dev/.codex/skills/cloudbase/references/miniprogram-development/SKILL.md`
- `/Users/huli-dev/.codex/skills/cloudbase/references/ai-model-nodejs/SKILL.md`

AI 调用规则：

- 服务端云函数使用 `@cloudbase/node-sdk`，不要在小程序端调用模型。
- `ai.createModel(...)` 参数只能是 GroupName，默认使用 `"cloudbase"`；具体模型 ID 放在 `generateText` / `streamText` 的 `model` 字段。
- 不要猜模型 ID。先用 CloudBase MCP 查询当前环境可用模型，再写入配置或代码默认值。
- 写 SDK 调用前必须做 Token Credits 与模型启用预检。若当前 session 无法完成 MCP 登录或环境绑定，停止在 Phase 2 说明阻塞，不要硬编码密钥。
- 如果环境没有可用 Token Credits 或目标模型未启用，不要假装 AI 可用；返回 `AI_NOT_READY` 或在交接说明中记录阻塞。

内置场景库要求：

- 使用 CommonJS 模块，例如 `cloudfunctions/app_nursing_undercover/scenarios.js`。
- 每种模式、每档难度至少 2 个场景，共至少 12 个场景。
- 场景必须是教学训练素材，不要包含真实患者个人信息。
- 每个场景包含 `scenarioKey`、`mode`、`difficulty`、`title`、`publicBrief`、`civilianSecret`、`undercoverSecret`、`knowledgePoints`、`answerExplanation`。
- 病例推理模式还应包含 `caseBrief`、`safePractice`、`unsafePractice`、`riskSignals`。

复盘定位：

- 使用“教学训练复盘”，不要输出诊疗建议。
- 对专科护士难度也要保持审慎，不编造药物剂量、医嘱或指南条款。

## 10. 小程序体验要求

页面必须使用平台柔彩多巴胺设计系统：

- 页面放在 `miniprogram/pages/apps/nursing_undercover/`。
- 页面壳使用全局 `ui-page`。
- 表单区优先用 `ui-form-field`。
- 主要操作用 `ui-action-button`。
- 状态展示用 `ui-status` 或现有公共状态样式。
- 页面 wxss 只写业务私有布局，颜色用 token，不硬编码平台主色。
- 不使用 emoji 作为按钮、身份、NPC 或应用图标。

建议页面结构：

- 应用头部：图标、名称、价格。
- 开局配置：模式、难度、AI NPC 数、轮数（数值调整用步进按钮，不用 slider——iOS 微信左缘右滑返回手势会抢占滑杆拖动，导致"一滑就返回"）。
- 当前身份卡：显示玩家密令和是否卧底，只给玩家自己看。
- 发言区：当前轮次、玩家输入、AI NPC 发言列表；玩家发言前展示 3 条 LLM 候选发言 chips（每轮进入发言环节自动生成，点选填入输入框可编辑，自由输入始终可用；加载失败静默隐藏）。
- 投票区：角色列表、投票理由可选。
- 结果复盘：胜负、正确卧底、关键线索、知识点、安全提醒。
- 最近记录：Phase 3 补齐。

## 11. 环境变量与部署

开发最小环境变量仍以 `AGENTS.md` 为准：

- `ADMIN_OPENIDS`
- `ADMIN_WEB_UIDS`
- `PAYMENT_PROVIDER`
- `MOCK_PAYMENT_ENABLED`
- `INTERNAL_API_SECRET`

新云函数 `app_nursing_undercover` 必须配置同一份 `INTERNAL_API_SECRET`。若 Phase 2 接入 CloudBase AI，不要新增前端密钥；CloudBase AI 资源和模型在云端环境配置。

`cloudbaserc.json` 需要新增函数：

```json
{
  "name": "app_nursing_undercover",
  "runtime": "Nodejs18.15",
  "handler": "index.main",
  "timeout": 60,
  "installDependency": true
}
```

## 12. 常用命令

项目根目录：

```bash
cd /Users/huli-dev/Documents/huli-tools
```

提交前 gate：

```bash
bash scripts/check-js.sh
bash scripts/check-boundaries.sh
bash scripts/check-admin-web-boundaries.sh
git diff --check
```

可选小程序预览命令。只有本地存在私钥且当前微信号有体验权限时运行，不得提交或打印私钥内容：

```bash
NODE_OPTIONS=--no-experimental-webstorage npx -y miniprogram-ci preview \
  --appid wx1654159e6e3bb334 \
  --project-path /Users/huli-dev/Documents/huli-tools \
  --private-key-path /Users/huli-dev/Documents/huli-tools/private.wx1654159e6e3bb334.key \
  --use-project-config \
  --upload-version nursing-undercover-preview \
  --threads 0 \
  --qrcode-format image \
  --qrcode-output-dest /tmp/huli-tools-nursing-undercover-preview.png
```

## 13. 跨阶段规则

- 每个 phase 开始前先读 `AGENTS.md`、本文件、当前 phase prompt 和相关代码。
- 不要修改用户未要求的 admin-web 业务逻辑。
- 不要把测试用临时日志、真实密钥、二维码图片或 `.playwright-cli/`、`output/` 等临时产物提交。
- 涉及新增云函数、页面或 collection 时，同步更新 `docs/`、`promptDocs/prompt-pack-huli-tools-0526/test_case_huli-tools_0526.md` 和 `run_manifest_huli-tools_0526.toml`。
- `AGENTS.md` 只写长期、全局、架构性规则。本次业务应用落地本身不需要更新 `AGENTS.md`，除非实现过程中发现新的全局约束。
- 如果当前代码与本 spec 有冲突，先以 `AGENTS.md` 和真实代码为准，并在交接说明中记录差异。

## 14. 未决问题

- 无需继续询问用户产品方向。用户已确认：双模式、三档难度、用户可调 NPC 数和轮数、玩家也可能成为卧底、保存复盘。
- CloudBase AI 具体模型 ID 需要在 Phase 2 根据当前环境实时查询确认，不能从记忆或旧文档猜测。
