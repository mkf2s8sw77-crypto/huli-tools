# LLM Prompt: huli-tools nursing_undercover Phase 1/3

## 阶段目标

完成 `谁是卧底（护理版）` 的平台竖切和可玩最小对局。Phase 1 不接入 CloudBase AI，先用确定性模板 NPC 发言实现词语卧底最小闭环，验证页面流、云函数、私有 collection、usage 状态机和基础文档都能跑通。

本阶段完成后，仓库应新增一个可从首页进入的新应用。用户能选择基础配置、开始一局、发言、看到模板 NPC 发言、投票、得到结果，且 usage 能正确结算。

## 必读输入

- `/Users/huli-dev/Documents/huli-tools/AGENTS.md`
- `/Users/huli-dev/Documents/huli-tools/promptDocs/prompt-pack-huli-tools-nursing-undercover-0609/master_spec_huli-tools-nursing-undercover_0609.md`
- `/Users/huli-dev/Documents/huli-tools/promptDocs/prompt-pack-huli-tools-nursing-undercover-0609/test_case_huli-tools-nursing-undercover_0609.md`
- `docs/app_boundary_and_onboarding.md`
- `docs/cloud_collections.md`
- `templates/app_vertical_slice/README.md`
- `miniprogram/pages/apps/ai_draw/`
- `cloudfunctions/demoSum/index.js`
- `cloudfunctions/app_ai_draw/index.js`

## 当前代码现状

- 现有应用包括历史示例 `demo_sum` 和标准应用 `ai_draw`。
- 新应用必须走标准命名：页面 `miniprogram/pages/apps/nursing_undercover/`，云函数 `cloudfunctions/app_nursing_undercover/`，私有 collection `app_nursing_undercover_sessions`。
- `miniprogram/services/api.js` 已有 `createUsage` 和 `callCloud`，无需新增公共 API 才能调用应用云函数。

## 任务清单

1. 创建应用云函数骨架。
   - 参考 `templates/app_vertical_slice/cloudfunctions/app___appKey__/` 或现有 `demoSum`。
   - 新增 `cloudfunctions/app_nursing_undercover/`，包含 `index.js`、`package.json`、`config.json`。
   - Phase 1 只依赖 `wx-server-sdk`，不要引入 AI SDK。
   - `config.json` timeout 使用 `60`。
   - 在 `cloudbaserc.json` 注册 `app_nursing_undercover`，runtime `Nodejs18.15`，`installDependency: true`。

2. 实现 Phase 1 云函数 action。
   - `listConfig`：返回两个模式和三档难度的配置，但标记 Phase 1 只有 `word_undercover` 的基础场景可玩。
   - `startGame`：校验 `usageId` 属于当前用户、`appKey` 是 `nursing_undercover`、状态是 `created` 或 `frozen`；同一 `usageId` 重复调用返回已有 session。
   - `submitSpeech`：校验 session 归属和状态，记录玩家发言，用确定性模板为每个 AI NPC 生成一句发言，推进轮次或进入 `voting`。
   - `submitVote`：记录玩家投票，用确定性规则生成 AI NPC 投票，计算胜负，生成简短复盘，调用 `coreApp.finishUsage`。
   - `getGame`：返回当前用户自己的 session；未结束时隐藏 NPC 密令和卧底答案。
   - `cancelGame`：未完成 session 置为 `cancelled`，调用 `coreApp.failUsage`。
   - `listMyGames` 可先返回空数组或最近已完成记录的最小列表；完整历史 UI 留给 Phase 3。

3. 实现最小内置场景和规则引擎。
   - 新增 `cloudfunctions/app_nursing_undercover/scenarios.js`。
   - Phase 1 至少提供 `word_undercover` + `student` 的 2 个护理词语场景。
   - 场景字段按 master spec 设计，先不要求病例推理模式完整可玩。
   - 随机分配卧底时，玩家也可能成为卧底。
   - NPC 显示名使用护理场景中性名称，例如 `林护士`、`陈护士`、`周护士`，不要使用真实姓名或患者信息。

4. 创建小程序页面。
   - 新增 `miniprogram/pages/apps/nursing_undercover/index.js|wxml|wxss|json`。
   - 在 `miniprogram/app.json` 的 `pages` 中注册 `"pages/apps/nursing_undercover/index"`。
   - 页面使用 `ui-page`、`ui-form-field`、`ui-action-button` 等公共组件。
   - 页面包含应用头部、开局配置、身份卡、发言输入、NPC 发言列表、投票区和结果区。
   - Phase 1 UI 可先只开放词语卧底基础场景；病例推理和高阶难度可展示为“下一阶段补齐”或禁用，不要做假功能。

5. 接入首页应用目录。
   - 在 `cloudfunctions/adminCore/index.js` 的 seed 中加入 `nursing_undercover`。
   - 默认 `pricing: { mode: "fixed", costPoints: 0 }`，`sortOrder` 放在 `ai_draw` 后。
   - 在 `miniprogram/pages/index/index.js` 增加 `nursing_undercover` 的 `iconClass`。
   - 如需新增 CSS-only 图标，在 `miniprogram/styles/common.wxss` 添加 `.icon-tile--undercover`，不得使用 emoji 或单字图标。

6. 更新 collection 和测试文档的最小说明。
   - `docs/cloud_collections.md` 增加 `app_nursing_undercover_sessions`。
   - 如 `adminCore.initSchema` 有 collection 必需清单，也要加入新 collection。
   - 本阶段可不更新 `docs/CODE_WIKI.md`，留给 Phase 3 统一收口。

## 范围边界

要做：

- 标准新应用竖切。
- 可玩的词语卧底最小闭环。
- 私有 collection 读写和 usage 状态机。
- 页面基础交互和错误提示。

不要做：

- 不接入 CloudBase AI。
- 不实现完整病例推理模式。
- 不做教师配置、admin-web 页面或真人多人联机。
- 不改 `coreApp`、`corePoints`、`corePayment` 的公共接口，除非发现明确 bug；如需改公共底座，先停止并写 RFC 说明。
- 不新增客户端直连数据库逻辑。

## 实现约束

- 云函数 CommonJS，两空格缩进。
- 业务云函数只能只读 `app_usage_records`，不能写公共 collection。
- `finishUsage` / `failUsage` 必须通过 `cloud.callFunction({ name: "coreApp" })` 并带 `_internalToken`。
- `INTERNAL_API_SECRET` 未配置时，内部回调必须失败，不要绕过。
- `submitSpeech` 和 `submitVote` 必须支持 `clientActionId` 幂等。
- 页面隐藏或离开时不要自动取消对局；只有用户点击取消才调用 `cancelGame`。

## 验证要求

至少运行：

```bash
cd /Users/huli-dev/Documents/huli-tools
bash scripts/check-js.sh
bash scripts/check-boundaries.sh
bash scripts/check-admin-web-boundaries.sh
git diff --check
```

人工或半人工检查：

- `miniprogram/app.json` JSON 有效，并包含新页面路径。
- `cloudbaserc.json` JSON 有效，并包含 `app_nursing_undercover`。
- 首页应用目录 seed 包含 `nursing_undercover`。
- 页面没有使用 emoji 作为核心 UI 图标。
- `app_nursing_undercover` 不直接写公共 collection。

## 交接说明

Phase 1 完成后交接给 Phase 2 时必须说明：

- 新增文件和已更新文件。
- `app_nursing_undercover_sessions` 当前字段实际落地情况。
- Phase 1 哪些地方仍是确定性模板，等待 Phase 2 替换为 AI。
- 所有 gate 命令结果。
- 如果因缺少本地 CloudBase 环境未能真机调用云函数，要明确说明缺口。
