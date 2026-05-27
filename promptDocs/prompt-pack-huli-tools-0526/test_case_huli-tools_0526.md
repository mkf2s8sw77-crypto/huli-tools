# Test Cases: huli-tools

## 1. 测试环境

- 项目根目录：`/Users/huli-dev/Documents/huli-tools`
- 小程序类型：微信小程序原生项目。
- 云环境 ID：`cloudbase-3gphz7fk0fe1b760`
- 启动方式：用微信开发者工具打开项目根目录；命令行只负责静态检查和文档/脚本验证。
- 测试账号：任意可登录微信开发者工具的微信号；管理员测试需要把该账号 openid 配入 `ADMIN_OPENIDS`。
- 支付模式：首版默认 `PAYMENT_PROVIDER=mock`、`MOCK_PAYMENT_ENABLED=true`；真实微信支付未配置前不得按真实支付验收。
- 数据准备：先按 `docs/cloud_collections.md` 创建公共集合，再部署云函数，调用 `adminCore.initSchema` seed 默认应用和充值包。
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

## 4. 人工检查项

- 微信开发者工具中无明显编译错误。
- `project.config.json` 当前 APPID 应为 `wx1654159e6e3bb334`；如复制为其他小程序项目，需要替换为对应 APPID。
- 云开发控制台 collection 权限符合“客户端只读必要公开数据，敏感写入走云函数”的原则。
- mock 支付入口在生产配置中关闭（`MOCK_PAYMENT_ENABLED=false`）。
- 管理员 openid 未配置时，管理接口不会放开权限（返回 `ADMIN_NOT_CONFIGURED`）。
- 真实微信支付未配置时，界面和接口不能误导用户以为已真实支付。
- `INTERNAL_API_SECRET` 已显式配置为随机字符串，且所有公共云函数保持一致。

## 5. 缺陷记录规则

每个失败用例都记录：

- 用例编号。
- 现象。
- 复现步骤。
- 期望结果。
- 实际结果。
- 云函数日志、控制台错误或截图位置。
- 是否阻塞下一 phase。
