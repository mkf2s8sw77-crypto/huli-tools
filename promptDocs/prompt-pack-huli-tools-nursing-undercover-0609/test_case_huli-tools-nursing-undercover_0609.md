# Test Case: huli-tools nursing_undercover

## 1. 测试环境

仓库路径：

```bash
/Users/huli-dev/Documents/huli-tools
```

小程序：

- appid：`wx1654159e6e3bb334`
- CloudBase envId：`cloudbase-3gphz7fk0fe1b760`
- 小程序根目录：`miniprogram/`
- 新页面：`miniprogram/pages/apps/nursing_undercover/index`
- 新云函数：`app_nursing_undercover`
- 新 collection：`app_nursing_undercover_sessions`

测试账号：

- 小程序真机或预览测试需使用该小程序开发者或体验成员微信号。
- 云函数会用 `cloud.getWXContext().OPENID` 识别用户，不需要前端传 `openid`。
- 管理端不是本应用测试范围。

环境变量：

- `INTERNAL_API_SECRET` 必须在 `coreApp`、`corePoints`、`corePayment`、`adminCore`、`demoSum`、`app_ai_draw`、`app_nursing_undercover` 中保持一致。
- Phase 2 若接入 CloudBase AI，当前 CloudBase 环境必须有可用 Token Credits 和已启用模型。

数据准备：

1. 云开发控制台或初始化工具中创建 `app_nursing_undercover_sessions`。
2. 部署 `app_nursing_undercover`，并确认 `cloudbaserc.json` 已包含该函数。
3. 调用或运行现有 `adminCore.initSchema`，确保 `apps` 中存在 `nursing_undercover`。
4. 当前用户需要有可用积分账户；首版 `costPoints=0`，但仍要求 usage 创建成功。

通用 gate：

```bash
cd /Users/huli-dev/Documents/huli-tools
bash scripts/check-js.sh
bash scripts/check-boundaries.sh
bash scripts/check-admin-web-boundaries.sh
git diff --check
```

JSON 检查：

```bash
node -e "JSON.parse(require('fs').readFileSync('miniprogram/app.json','utf8')); JSON.parse(require('fs').readFileSync('cloudbaserc.json','utf8')); console.log('json ok')"
```

## 2. 自动/半自动用例

### TC-01 页面和函数注册

目标：确认新应用入口被小程序和 CloudBase 配置识别。

前置条件：Phase 1 已完成。

步骤：

1. 检查 `miniprogram/app.json`。
2. 检查 `cloudbaserc.json`。
3. 检查 `cloudfunctions/app_nursing_undercover/package.json` 和 `config.json`。

断言：

- `pages` 包含 `pages/apps/nursing_undercover/index`。
- `cloudbaserc.json` 包含 `app_nursing_undercover`。
- `app_nursing_undercover` timeout 为 `60` 或更高。
- `package.json` 不包含前端密钥或无关外部 API 配置。

### TC-02 应用目录 seed

目标：确认 `apps` 中可注册 `nursing_undercover`。

前置条件：`adminCore` 可调用，集合存在。

步骤：

1. 调用 `adminCore.initSchema`。
2. 调用 `coreApp.listApps`。
3. 在返回列表中查找 `appKey=nursing_undercover`。

断言：

- 应用名为 `谁是卧底（护理版）`。
- `entryPage` 为 `/pages/apps/nursing_undercover/index`。
- `cloudFunctionName` 为 `app_nursing_undercover`。
- `pricing.costPoints` 默认为 `0`。
- `status` 为 `active`。

### TC-03 usage 归属校验

目标：业务云函数不能复用其他应用 usage。

前置条件：可创建 `demo_sum` 或 `ai_draw` usage。

步骤：

1. 调用 `coreApp.createUsage("demo_sum", { a: 1, b: 2 })` 获取 usageId。
2. 用该 usageId 调用 `app_nursing_undercover.startGame`。

断言：

- 返回失败。
- 错误码为 `APP_MISMATCH` 或等价稳定错误码。
- 不创建 `app_nursing_undercover_sessions` 记录。

### TC-04 Phase 1 词语卧底最小闭环

目标：不用 AI 时也能完成最小对局，验证状态机。

前置条件：Phase 1 已部署，`nursing_undercover` usage 可创建。

步骤：

1. 在小程序进入 `谁是卧底（护理版）`。
2. 选择 `词语卧底`、`护理学生`、AI NPC 数 `4`、轮数 `2`。
3. 创建 usage 并开始对局。
4. 查看玩家身份密令。
5. 输入第 1 轮发言并提交。
6. 等待模板 NPC 发言出现。
7. 输入第 2 轮发言并提交。
8. 投票给任一角色。

断言：

- 页面能显示对局结果。
- `app_nursing_undercover_sessions.status` 为 `finished`。
- `app_usage_records.status` 为 `succeeded`。
- 未结束前页面不泄露正确卧底答案。

### TC-05 玩家也可能成为卧底

目标：验证角色分配不是固定 AI NPC 当卧底。

前置条件：可重复创建新对局。

步骤：

1. 连续创建多局，或临时使用可控随机种子测试角色分配。
2. 观察 `undercoverRoleId`。

断言：

- 至少存在玩家为卧底的可达路径。
- 玩家为卧底时，页面正确显示玩家自己的卧底密令。
- 结果判定按 `playerWon` 区分玩家个人胜负。

### TC-06 submitSpeech 幂等

目标：重复提交同一发言不会重复生成 NPC 发言。

前置条件：存在 `in_progress` session。

步骤：

1. 用相同 `clientActionId` 调用 `submitSpeech` 两次。
2. 查询 session transcript。

断言：

- 玩家发言只记录一次。
- 同一轮 NPC 发言只生成一次。
- 第二次调用返回成功或等价重复结果，不推进额外轮次。

### TC-07 submitVote 幂等

目标：重复投票不会重复结算 usage。

前置条件：存在 `voting` session。

步骤：

1. 用相同 `clientActionId` 调用 `submitVote` 两次。
2. 查询 session 和 usage。

断言：

- votes 中玩家投票只记录一次。
- `coreApp.finishUsage` 不重复结算。
- usage 最终状态稳定为 `succeeded`。

### TC-08 取消对局释放 usage

目标：用户显式取消未完成对局时，状态正确收口。

前置条件：存在未完成 session。

步骤：

1. 点击页面取消或调用 `cancelGame`。
2. 查询 session 和 usage。

断言：

- session 状态为 `cancelled`。
- usage 状态为失败或已释放冻结积分的等价状态。
- 页面隐藏或返回不自动取消，只有显式取消才触发。

### TC-09 CloudBase AI preflight

目标：Phase 2 接入 AI 前确认环境资源。

前置条件：coding Agent 可使用 CloudBase MCP。

步骤：

1. 查询当前 envId。
2. 调用 `DescribeEnvPostpayPackage`。
3. 调用 `DescribeAIModels`。
4. 如需要，调用 `DescribeManagedAIModelList` 并启用模型。

断言：

- preflight 结果记录在 Phase 2 交接说明中。
- 代码中不猜测模型 ID。
- 没有把 SecretId、SecretKey、临时凭据写入仓库。

### TC-10 双模式三难度场景覆盖

目标：内置场景库达到首版覆盖要求。

前置条件：Phase 2 已完成。

步骤：

1. 检查 `cloudfunctions/app_nursing_undercover/scenarios.js`。
2. 统计 `mode` 和 `difficulty`。

断言：

- `word_undercover` 每档难度至少 2 个场景。
- `case_reasoning` 每档难度至少 2 个场景。
- 总场景数至少 12。
- 场景不包含真实患者姓名、住院号、身份证号、电话。

### TC-11 AI 发言不泄露答案

目标：AI NPC 发言保持游戏规则。

前置条件：Phase 2 AI 可用。

步骤：

1. 完成一局词语卧底第 1 轮发言。
2. 完成一局病例推理第 1 轮发言。
3. 阅读 NPC 发言。

断言：

- NPC 不直接说出自己的密令。
- NPC 不直接说“我是卧底”或“某某是卧底”。
- 病例推理 NPC 发言围绕护理安全线索，不输出真实医疗建议。

### TC-12 AI 异常路径

目标：模型异常不会卡住 usage。

前置条件：可临时模拟 AI 返回非 JSON 或模型不可用。

步骤：

1. 触发 `submitSpeech` 或 `submitVote` 的 AI 异常。
2. 查询 session 和 usage。

断言：

- 返回 `AI_NOT_READY`、`AI_RESPONSE_INVALID` 或 `AI_GENERATION_FAILED`。
- session 状态为 `failed` 或保持可恢复状态。
- 如果对局无法继续，已调用 `coreApp.failUsage`。
- 页面展示友好错误，不展示堆栈或密钥。

### TC-13 历史记录回看

目标：用户能查看自己的已完成复盘。

前置条件：Phase 3 已完成，当前用户至少完成一局。

步骤：

1. 进入 `谁是卧底（护理版）`。
2. 查看最近记录。
3. 打开一条已完成记录。

断言：

- 只展示当前用户自己的 session。
- 历史详情展示胜负、正确卧底、关键线索、知识点和安全提醒。
- 未完成或失败记录状态显示清楚。

### TC-14 小程序 UI 适配

目标：检查首屏和关键流程没有明显视觉问题。

前置条件：微信开发者工具或真机预览可用。

步骤：

1. 打开首页。
2. 进入应用。
3. 完成开局、发言、投票、复盘。
4. 在较小手机视口检查长文本。

断言：

- 页面使用柔彩多巴胺设计系统。
- 按钮文字不溢出。
- NPC 发言和复盘不遮挡。
- 没有 emoji 或单字占位图标。

### TC-15 边界扫描

目标：确保没有越权访问和敏感信息。

前置条件：所有 phase 完成。

步骤：

1. 运行通用 gate。
2. 搜索 `miniprogram/` 下是否直接引用敏感 collection。
3. 搜索是否出现密钥、Secret 或模型凭据。

断言：

- `check-boundaries.sh` 通过。
- 客户端没有 `collection("app_nursing_undercover_sessions")`。
- 仓库没有新增真实密钥。

### TC-16 候选发言（suggestSpeech）

目标：发言环节为玩家提供 3 条 LLM 候选发言，且模型不可用时优雅降级。

前置条件：已开始一局且处于发言环节；管理端已配置 `nursing_undercover__speech_suggestion` 绑定（未配置时验证降级路径）。

步骤：

1. 进入对局，观察发言输入区上方。
2. 点选一条候选，确认文字填入输入框且可继续编辑，再提交。
3. 进入下一轮，确认候选自动重新生成。
4. 移除/停用 `speech_suggestion` 绑定后重复步骤 1，确认展示模板候选（`fallback: true`）而不是报错。

断言：

- 每轮自动生成 3 条候选，候选不直接包含玩家密令原文。
- 候选与模板兜底均不得包含平民/卧底任一密令原文（服务端 `filterLeakSuggestions` 硬过滤 + 模板知识点预过滤）。
- 候选应有具体细节、三条角度各异，不出现"很重要/值得重视/格外注意"类空话。
- 点选候选只填入输入框，不直接提交；自由输入始终可用。
- 候选请求失败时输入区静默隐藏候选，不影响正常发言提交。
- 玩家本轮已发言或进入投票后，`suggestSpeech` 返回 `DUPLICATE_ACTION` / `INVALID_STATUS`。
- 配置页「AI 对手 / 发言轮数」用步进按钮调整，到边界值时对应按钮禁用；不存在 slider。

## 3. 可选预览

只有本地存在私钥且账号有权限时运行：

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

断言：

- 命令成功生成 `/tmp/huli-tools-nursing-undercover-preview.png`。
- 真机扫码能进入小程序，首页和新应用无白屏。

## 4. 人工检查项

- 护理内容是教学训练，不是医疗建议。
- 病例推理场景没有真实患者隐私。
- 复盘解释能指出关键线索和正确护理思路。
- 玩家为卧底时，游戏体验不是单纯找 AI，而是需要玩家伪装并接受投票结果。
- 文档命令都能在 `/Users/huli-dev/Documents/huli-tools` 解析。
