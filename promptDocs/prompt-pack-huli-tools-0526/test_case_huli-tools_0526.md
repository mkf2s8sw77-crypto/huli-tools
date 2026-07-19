# Test Cases: huli-tools

## 1. 测试环境

- 项目根目录：`/Users/huli-dev/Documents/huli-tools`
- 小程序类型：微信小程序原生项目。
- 云环境 ID：`cloudbase-3gphz7fk0fe1b760`
- 启动方式：用微信开发者工具打开项目根目录；命令行只负责静态检查和文档/脚本验证。
- 测试账号：任意可登录微信开发者工具的微信号；管理员测试需要把该账号 openid 配入 `ADMIN_OPENIDS`。
- 支付模式：开发测试用 `PAYMENT_PROVIDER=mock`、`MOCK_PAYMENT_ENABLED=true`；线上虚拟支付用 `PAYMENT_PROVIDER=virtual` 并按 TC-08b/TC-08c 验收；真实微信支付未配置前不得按真实支付验收。
- 数据准备：先按 `docs/cloud_collections.md` 创建集合（含 `app_ai_draw_tasks`），再部署云函数，调用 `adminCore.initSchema` seed 默认应用和充值包。
- reset 方式：开发环境可清空公共集合后重新调用 `adminCore.initSchema`；不要在生产环境执行清空。

## 2. 自动 Gate

每个 phase 至少运行：

```bash
git status --short --branch
bash scripts/check-js.sh
bash scripts/check-boundaries.sh
git diff --check
```

如果后续阶段新增了 npm 脚本或更强测试命令，以 `run_manifest_huli-tools_0526.toml` 的最新内容为准。

## 3. 冒烟用例

### TC-01 首次进入创建账户

- 目标：验证用户 bootstrap 和积分账户初始化。
- 前置条件：`users`、`point_accounts` 已创建；`coreUser` 已部署。
- 步骤：
  1. 打开小程序首页，或调用 `coreUser.bootstrap`。
  2. 再次进入首页，重复触发 bootstrap。
- 断言：
  - `users` 中存在当前 openid 的用户记录。
  - `point_accounts` 中存在当前用户账户。
  - 第二次 bootstrap 不会重置积分余额。

### TC-02 应用目录 seed 和首页展示

- 目标：验证 `apps` seed 和首页总入口。
- 前置条件：已调用 `adminCore.initSchema`。
- 步骤：
  1. 调用 `coreApp.listApps`。
  2. 打开首页查看应用列表。
- 断言：
  - 返回至少一个 `active` 示例应用。
  - 首页能展示应用名称、描述和积分价格。
  - `disabled` 应用不展示。

### TC-03 积分不足拦截

- 目标：验证余额不足时不能使用付费应用。
- 前置条件：当前用户可用积分为 0。
- 步骤：
  1. 进入示例工具页。
  2. 输入两个数字并执行。
- 断言：
  - 前端提示余额不足或需要充值。
  - 不产生成功结算流水。
  - 如产生 usage，也必须是失败/释放状态，不得扣成负数。

### TC-04 管理员加测试积分

- 目标：验证管理员积分调整和审计。
- 前置条件：当前测试 openid 已配置为管理员。
- 步骤：
  1. 调用 `adminCore.adjustPoints` 给当前用户增加 10 积分。
  2. 调用 `corePoints.getBalance`。
  3. 查询积分流水和审计日志。
- 断言：
  - 可用积分增加 10。
  - `point_transactions` 有 `admin_adjust` 流水。
  - `admin_audit_logs` 有对应审计，包含 beforeSummary 和 afterSummary。

### TC-05 示例工具扣费成功

- 目标：验证冻结、业务成功、结算链路。
- 前置条件：当前用户可用积分不少于示例工具价格。
- 步骤：
  1. 打开示例工具页。
  2. 输入 `2` 和 `3`。
  3. 点击执行。
  4. 查看余额、流水和使用记录。
- 断言：
  - 工具返回 `5`。
  - 可用积分按价格减少，冻结积分最终为 0。
  - 流水包含 `freeze` 和 `settle`。
  - 使用记录状态为 `succeeded`。

### TC-06 示例工具失败释放积分

- 目标：验证业务失败后释放冻结积分。
- 前置条件：当前用户可用积分不少于示例工具价格。
- 步骤：
  1. 在示例工具页开启“模拟失败”开关。
  2. 输入任意数字并执行。
  3. 查看余额、流水和使用记录。
- 断言：
  - 可用积分恢复到调用前。
  - 冻结积分最终为 0。
  - 流水包含 `freeze` 和 `release`。
  - 使用记录状态为 `released`。

### TC-07 固定充值包和 mock 支付到账

- 目标：验证充值订单和到账。
- 前置条件：`PAYMENT_PROVIDER=mock`，`MOCK_PAYMENT_ENABLED=true`。
- 步骤：
  1. 打开充值页。
  2. 选择 6 元固定充值包并创建订单。
  3. 点击模拟支付。
  4. 查看余额、订单和流水。
- 断言：
  - 订单金额和积分来自服务端套餐。
  - 订单状态变为 `paid`。
  - 可用积分增加 `basePoints + bonusPoints`。
  - 流水包含 `recharge`。

### TC-08 支付幂等

- 目标：验证重复支付回调不重复到账。
- 前置条件：已有一个已支付订单。
- 步骤：
  1. 对同一订单再次调用 `corePayment.mockPayOrder`。
  2. 查看余额和流水。
- 断言：
  - 可用积分不再增加。
  - 不新增重复 `recharge` 流水。
  - 接口返回稳定的已支付状态（`alreadyPaid: true`）。

### TC-08b 小程序虚拟支付到账

- 目标：验证 `PAYMENT_PROVIDER=virtual` 下虚拟支付全链路。
- 前置条件：`PAYMENT_PROVIDER=virtual`，已配置 `VIRTUAL_PAY_OFFER_ID` / `VIRTUAL_PAY_APP_KEY_SANDBOX` / `VIRTUAL_PAY_ENV=1` / `WX_MINIPROGRAM_APPSECRET`，充值包已配置 mp 后台已发布道具的 `productId`，云开发消息推送已配置 `xpay_goods_deliver_notify` → `corePayment`。
- 步骤：
  1. 打开充值页，选择带 `productId` 的充值包，点击「立即充值」。
  2. 完成沙箱支付（安卓/开发者工具，iOS 不支持沙箱）。
  3. 查看余额、订单和积分流水。
  4. 支付成功后立即重复调用 `corePayment.confirmVirtualOrder`。
- 断言：
  - `createVirtualOrder` 返回 `signData` / `paySig` / `signature`，`mode=short_series_goods`。
  - 订单状态变为 `paid`，可用积分增加 `basePoints + bonusPoints`，流水包含 `recharge`。
  - 查单与发货推送两条通道只到账一次（幂等键 `recharge_<orderNo>`）。
  - 未配置虚拟支付变量时返回 `PAYMENT_NOT_CONFIGURED` 并列出缺失变量。
  - `MOCK_PAYMENT_ENABLED=false` 时充值页不显示「模拟支付」入口。
  - 取消支付不产生任何积分/订单状态变更（订单保持 `created`）。

### TC-08c 虚拟支付发货推送幂等

- 目标：验证重复发货推送不重复到账。
- 步骤：
  1. 构造同一 `OutTradeNo` 的 `xpay_goods_deliver_notify` 事件重复触发 `corePayment`。
  2. 查看余额和流水。
- 断言：
  - 积分不重复增加，不新增重复流水。
  - 推送回包为 `{"ErrCode":0,"ErrMsg":"success"}`。
  - 推送中 `OpenId` 与订单用户不一致时不到账。
  - `Env` 与当前 `VIRTUAL_PAY_ENV` 不一致时忽略且回包成功。

### TC-09 普通用户不能管理

- 目标：验证管理员权限边界。
- 前置条件：当前 openid 不在 `ADMIN_OPENIDS`。
- 步骤：
  1. 调用 `adminCore.upsertApp`。
  2. 调用 `adminCore.adjustPoints`。
- 断言：
  - 均返回权限错误（`FORBIDDEN` 或 `ADMIN_NOT_CONFIGURED`）。
  - 不产生应用配置变更。
  - 不产生积分余额变更。

### TC-10 前端页面完整路径

- 目标：验证普通用户端主要页面可用。
- 前置条件：已部署所有公共云函数和页面。
- 步骤：
  1. 首页查看应用列表。
  2. 我的页查看余额。
  3. 充值页 mock 支付到账。
  4. 示例工具成功执行。
  5. 查看订单、积分流水、使用记录。
- 断言：
  - 页面无白屏。
  - 加载态、空状态、错误态可理解。
  - 文本不明显溢出按钮或卡片。
  - tabbar “首页/我的”跳转正常。

### TC-11 coming_soon 应用展示但不可进入

- 目标：验证 `coming_soon` 状态应用的行为。
- 前置条件：管理员已新增一个 `coming_soon` 应用。
- 步骤：
  1. 调用 `adminCore.upsertApp` 新增 `status=coming_soon` 的应用。
  2. 打开首页查看应用列表。
  3. 尝试点击该应用。
- 断言：
  - 首页列表中能看到该应用。
  - 点击后提示“该应用暂未开放”，不能进入。

### TC-12 内部接口不可直接调用

- 目标：验证 `corePoints` 内部接口已加固。
- 前置条件：已部署 `corePoints`。
- 步骤：
  1. 从前端直接调用 `corePoints` 的 `creditPoints` action（不传 `_internalToken`）。
- 断言：
  - 返回 `FORBIDDEN` 错误，提示“内部接口，禁止直接调用”。

### TC-13 管理员操作审计日志

- 目标：验证所有管理操作均留痕。
- 前置条件：当前用户为管理员。
- 步骤：
  1. 调用 `adminCore.upsertApp` 更新一个应用。
  2. 调用 `adminCore.upsertPackage` 更新一个充值包。
  3. 调用 `adminCore.listAuditLogs` 查看日志。
- 断言：
  - 审计日志中包含 `upsertApp` 和 `upsertPackage` 记录。
  - 每条记录包含 `adminUserId`、`action`、`targetId`、`beforeSummary`、`afterSummary`。

### TC-14 边界检查脚本通过

- 目标：验证边界检查脚本能在当前代码库通过。
- 前置条件：项目根目录有 `scripts/check-boundaries.sh`。
- 步骤：
  1. 执行 `bash scripts/check-boundaries.sh`。
- 断言：
  - 脚本退出码为 0。
  - 输出"边界检查全部通过"。

### TC-15 新应用接入边界：客户端不可直接写公共集合

- 目标：验证边界检查脚本能发现客户端越界写操作。
- 前置条件：临时在 `miniprogram/` 某 js 文件中添加 `db.collection("point_accounts").add(...)`。
- 步骤：
  1. 执行 `bash scripts/check-boundaries.sh`。
- 断言：
  - 脚本退出码为 1。
  - 输出中包含违规文件和集合名。
- 善后：恢复临时修改。

### TC-16 新应用接入边界：客户端不可调用内部 action

- 目标：验证边界检查脚本能发现客户端直接调用内部 action。
- 前置条件：临时在 `miniprogram/` 某 js 文件中添加 `action: "freezePoints"` 或 `action: "finishUsage"`。
- 步骤：
  1. 执行 `bash scripts/check-boundaries.sh`。
- 断言：
  - 脚本退出码为 1。
  - 输出中包含违规文件和 action 名。
- 善后：恢复临时修改。

### TC-17 coreApp finish/fail 仅限内部调用

- 目标：验证客户端不能绕过业务云函数直接结算或释放 usage。
- 前置条件：已部署 `coreApp`，且存在当前用户的 `usageId`。
- 步骤：
  1. 从前端或开发者工具直接调用 `coreApp.finishUsage`，不传 `_internalToken`。
  2. 从前端或开发者工具直接调用 `coreApp.failUsage`，不传 `_internalToken`。
- 断言：
  - 均返回 `FORBIDDEN` 或 `INTERNAL_SECRET_NOT_CONFIGURED`。
  - 使用记录和积分余额不发生结算/释放变化。

### TC-18 新应用竖切模板完整性

- 目标：验证竖切模板文件齐全且可用。
- 步骤：
  1. 检查 `templates/app_vertical_slice/` 目录结构。
  2. 确认包含 README.md、云函数模板、页面模板（js/wxml/wxss/json）、交付说明模板。
  3. 按 README.md 步骤模拟复制一个 `test_app`（不注册到 app.json）。
- 断言：
  - 所有模板文件存在。
  - 复制后的云函数模板文件能通过 `node --check`（语法检查）。

### TC-19 公共底座 RFC 模板存在

- 目标：验证 RFC 模板文件完整。
- 步骤：
  1. 检查 `docs/templates/core_change_rfc.md` 存在。
  2. 确认包含：标题、背景、涉及云函数/集合、兼容性、迁移方案、安全影响、测试计划、回滚方案等章节。
- 断言：
  - 文件存在且章节齐全。

### TC-20 护士职业定妆照 usage/job 绑定、上传素材与状态机

- 目标：验证 `app_ai_draw` 不允许复用其他应用 usage，主体照必传，参考图归属校验正确，且异步任务能在成功、失败、取消时正确结算或释放积分。
- 前置条件：已创建 `app_ai_draw_tasks` 集合；`app_ai_draw`、`coreApp`、`corePoints` 已部署并配置相同 `INTERNAL_API_SECRET`；`ai_draw` 当前内测价格为 0 积分。
- 步骤：
  1. 调用 `app_ai_draw.prepareUpload` 获取主体照 `cloudPath`，客户端上传后得到 `fileID`。
  2. 可选调用 `app_ai_draw.prepareUpload` 获取 1-8 张参考图 `cloudPath`，客户端上传后得到对应 `fileID`。
  3. 调用 `api.createUsage("ai_draw", { mode: "nurse_portrait", subject: true, referenceCount, composition })` 获取 `usageId`。
  4. 调用 `app_ai_draw.generate`，传入该 `usageId`、`subjectAsset`、`referenceAssets` 和 `options`。
  5. 若返回 `processing`，继续调用 `app_ai_draw.query`，必须同时传入 `usageId` 和返回的 `jobId`。
  6. 临时尝试缺少 `subjectAsset` 调用 `app_ai_draw.generate`。
  7. 临时尝试用非当前用户前缀的 `cloudPath/fileID` 调用 `app_ai_draw.generate`。
  8. 临时尝试用 `demo_sum` 的 `usageId` 调用 `app_ai_draw.generate`。
  9. 临时尝试用不匹配的 `jobId` 调用 `app_ai_draw.query`。
- 断言：
  - 正常成功时 usage 状态为 `succeeded`；0 积分内测不产生实际扣减。
  - 失败或取消时 usage 状态为 `failed` 或 `released`，不会产生余额扣减。
  - 缺少主体照返回 `MISSING_SUBJECT`，不会触发外部绘图任务。
  - 非当前用户素材返回 `ASSET_FORBIDDEN`，不会触发外部绘图任务。
  - 其他应用 usage 返回 `APP_MISMATCH`，不触发外部绘图任务。
  - 不匹配的 `jobId` 返回 `JOB_MISMATCH`，不会结算积分。

### TC-21 业务云函数必须校验 usage.appKey

- 目标：验证示例和后续业务云函数不能复用其他应用的 usage。
- 前置条件：已部署 `demoSum`、`app_ai_draw`、`coreApp`，当前用户可创建两个应用的 usage，并已准备合法主体照素材。
- 步骤：
  1. 调用 `api.createUsage("ai_draw", { mode: "nurse_portrait" })` 获取 `usageId`。
  2. 用该 `usageId` 调用 `demoSum`，传入合法数字参数。
  3. 调用 `api.createUsage("demo_sum", { a: 1, b: 2 })` 获取另一个 `usageId`。
  4. 用该 `usageId` 调用 `app_ai_draw.generate`，传入合法主体照和参数。
  5. 调用 `api.createUsage("demo_sum", { a: 1, b: 2 })` 获取第三个 `usageId`。
  6. 用该 `usageId` 调用 `app_nursing_undercover.startGame`，传入合法模式和难度。
- 断言：
  - 三次跨应用调用均返回 `APP_MISMATCH`。
  - 被误用的 usage 不会被结算为 `succeeded`。

### TC-22 谁是卧底（护理版）对局、AI fallback 与历史回看

- 目标：验证 `app_nursing_undercover` 的 usage 归属、对局状态机、投票结算、取消释放和历史复盘。
- 前置条件：已创建 `app_nursing_undercover_sessions` 集合；`app_nursing_undercover`、`coreApp`、`corePoints` 已部署并配置相同 `INTERNAL_API_SECRET`；如需真实 AI NPC，`app_nursing_undercover` 还需配置已启用的 `CLOUDBASE_AI_MODEL`。
- 步骤：
  1. 调用 `api.createUsage("nursing_undercover", { mode: "word_undercover", difficulty: "student" })` 获取 `usageId`。
  2. 调用 `app_nursing_undercover.startGame`，传入 `usageId`、`mode=word_undercover`、`difficulty=student`、`npcCount=4`、`roundCount=2`。
  3. 调用 `submitSpeech` 完成第 1 轮和第 2 轮发言，每次传入不同 `clientActionId`。
  4. 临时重复调用一次相同 `clientActionId` 的 `submitSpeech`。
  5. 调用 `submitVote`，传入任一非玩家角色和 `clientActionId`。
  6. 调用 `listMyGames` 和 `getGame` 查看历史复盘。
  7. 新建另一局，在未完成时调用 `cancelGame`。
- 断言：
  - 未结束时返回客户端的 NPC `secretLabel` 为 `***`，且不返回 `undercoverRoleId`。
  - 重复 `submitSpeech` 不会重复生成 NPC 发言。
  - 投票成功后 usage 状态为 `succeeded`，session 状态为 `finished`。
  - 未配置或不可用 AI 时允许返回 `fallback=true`，但不得伪装为真实 AI 输出。
  - 历史回看只返回当前用户自己的对局。
  - 取消对局后 usage 状态为 `failed` 或 `released`，session 状态为 `cancelled`。

### TC-23 MAIC CloudBase 原生课程、协议执行与 usage 幂等闭环

- 目标：验证 `maic` 的 CloudBase 队列、单并发 Worker、后台恢复、原生播放器、用户隔离和 usage 闭环。
- 前置条件：7 个 `app_maic_*` 集合均为 PRIVATE；任务索引已创建；`app_maic_worker.modelSmoke` 使用 `MiniMax-M2.7` 成功；每分钟 Worker 与每 5 分钟 reconcile timer 已启用；应用注册状态为 `active` 且 `costPoints=0`。
- 步骤：
  1. 创建 0 积分 usage 并提交课程主题，确认任务立即进入 `queued` 且兼容字段 `jobId=""`。
  2. 退出小程序并等待 `app_maic_worker` 推进，再返回查看结果；停止页面轮询期间任务仍应完成。
  3. 在播放器依次触发 speech、highlight、spotlight、laser、pause，并完成测验、互动和 PBL；另用旧 fixture 注入 `navigate`。
  4. 重复提交同一 `usageId`；再分别验证显式取消、MiniMax 限流/网络失败三次、协议错误纠错/兜底、租约恢复和 45 分钟超时。
  5. 同一用户当天创建 3 门后尝试第 4 门；使用另一微信用户尝试读取任务、课程、进度和既有媒体。
- 断言：
  - 日志只记录 requestId、状态、重试次数和 token 用量，模型为 `MiniMax-M2.7`，不包含 Key、完整 Prompt 或完整课程。
  - `app_maic_runtime/worker` 保证全局同时最多一个任务进入执行窗口，任务可在退出、网络中断和 Worker 租约过期后恢复。
  - 同一 `usageId` 只产生一个任务和课程；免费模式不产生积分冻结、结算或释放流水，但 usage 必须进入明确终态。
  - 四类场景与五类运行时动作均由原生舞台执行，无 WebView、HTML 或脚本；旧 `navigate` 被忽略且不会翻页。
  - quiz、interaction、PBL 完成前“继续”不可用；页面隐藏、退出或手动切页后，旧动作不会继续执行。
  - 课程呈现包含章节轨道、舞台标题、教师旁白层和场景模板，不退化为单一纵向白卡。
  - 新课程 `assets=[]`，课程和场景全部导入后才完成 usage；既有课程资产仍可播放、删除；失败、取消和超时均正确结束 usage。
  - 第 4 门返回 `DAILY_LIMIT_REACHED`，不留下可继续执行的 usage 或任务。
  - 跨用户访问均返回 `FORBIDDEN`，无法获取临时媒体 URL。

## 4. 设计系统视觉一致性验收

- 首页、我的、充值、订单、积分流水、使用记录、`demo-sum`、`ai_draw`、`nursing_undercover` 页面无白屏。
- 所有页面使用 `ui-page` 组件统一页面壳，标题样式一致。
- 卡片使用 `card` class 或 `ui-card` 组件，圆角 16rpx、阴影一致。
- 状态标签颜色统一：成功绿、警告黄、危险红、默认灰。
- 积分数值使用陶土棕 `--color-points`，价格使用陶橙 `--color-price`，不使用旧的微信绿。
- 空状态（`ui-empty`）和错误态（`ui-error`）布局一致。
- Tab bar 选中色为平台陶土棕（`--color-primary`），非微信绿。
- 页面内无硬编码的 `#07c160`、`#1890ff`、`#52c41a` 等非 Token 颜色值。
- 模板 `templates/app_vertical_slice/` 复制新应用后，页面默认使用设计系统组件。

## 5. 人工检查项

- 微信开发者工具中无明显编译错误。
- `project.config.json` 当前 APPID 应为 `wx1654159e6e3bb334`；如复制为其他小程序项目，需要替换为对应 APPID。
- 云开发控制台 collection 权限符合“客户端只读必要公开数据，敏感写入走云函数”的原则。
- mock 支付入口在生产配置中关闭（`MOCK_PAYMENT_ENABLED=false`）。
- 管理员 openid 未配置时，管理接口不会放开权限（返回 `ADMIN_NOT_CONFIGURED`）。
- 真实微信支付未配置时，界面和接口不能误导用户以为已真实支付。
- `INTERNAL_API_SECRET` 已显式配置为随机字符串，且所有公共云函数保持一致。

## 6. 缺陷记录规则

每个失败用例都记录：

- 用例编号。
- 现象。
- 复现步骤。
- 期望结果。
- 实际结果。
- 云函数日志、控制台错误或截图位置。
- 是否阻塞下一 phase。
