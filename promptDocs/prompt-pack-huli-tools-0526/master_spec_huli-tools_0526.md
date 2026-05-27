# Master Spec: huli-tools

## 1. 项目目标

`huli-tools` 是一个微信小程序原生项目，定位为“沪里工具”总入口：一个小程序里承载多个不同类型的工具应用。用户用同一个微信账号进入所有工具，所有工具共享一个积分账户；每个工具可以有不同积分单价、不同业务页面、不同云函数和不同业务集合。

本轮开发不是做某一个具体业务工具，而是先把公共底座搭好，后续每个工具只需要注册到应用目录并接入统一扣费/记录协议。

首版必须覆盖：

- 用户账号：当前以小程序 `openid` 作为主身份，预留 `unionid` 和手机号字段。
- 应用目录：总入口展示可用工具，后台可配置工具名称、路由、状态和价格。
- 共享积分：所有工具共用一个余额，采用“冻结 -> 成功结算 / 失败释放”的扣费模型。
- 固定充值包和支付订单：先支持固定充值包，不支持自定义金额。
- 管理能力：用云函数管理接口和管理员 openid 白名单维护应用、充值包、积分调整，并写审计日志。
- 测试与交接：补齐脚本化静态检查、seed/reset 约定和人工验收清单。

## 2. 当前代码现状

仓库路径：`/Users/huli-dev/Documents/huli-tools`

当前是微信小程序原生骨架：

- `project.config.json`：`miniprogramRoot = miniprogram/`，`cloudfunctionRoot = cloudfunctions/`，当前 `appid` 为 `wx1654159e6e3bb334`。
- `miniprogram/app.js`：已调用 `wx.cloud.init`，环境 ID 为 `cloudbase-3gphz7fk0fe1b760`。
- 页面：只有 `pages/index/index` 和 `pages/profile/profile`。
- 自定义 tabbar：`custom-tab-bar/index`，包含“首页”“我的”。
- 云函数：`getOpenId` 返回 openid/appid/unionid；`sum` 是求和示例。
- `config/mcporter.json` 声明了 CloudBase MCP：`/opt/homebrew/bin/cloudbase-mcp`，但编码 Agent 不能假设它一定已登录或可用。
- 仓库没有根 `package.json`，没有自动化测试框架，没有实际 collection 初始化脚本。
- 本文档生成时仓库内没有实际 `AGENTS.md` 文件；后续实现若新增 `AGENTS.md`，应以仓库根目录最新文件为准，并保持“默认中文、只写长期工程规则、200 行以内”的约束。

## 3. 技术与安全约束

- 技术栈保持微信小程序原生语法，不引入 Taro、uni-app、React/Vue 或大型状态管理库。
- 后端使用微信云开发云函数和云数据库集合；不要引入独立外部服务或自建后端。
- 所有会改变积分、订单、应用配置、管理员权限的写操作必须走云函数；客户端不能直接写这些 collection。
- 客户端传入的 `openid`、价格、积分数量、用户角色一律不可信；云函数必须用 `cloud.getWXContext()` 获取调用者身份。
- 金额统一用整数“分”，积分统一用整数，时间统一保存 `Date` 或服务端时间；不要使用浮点金额。
- 所有积分和订单状态变更必须具备幂等键，重复请求或重复支付回调不能重复到账/扣费。
- 不把任何支付商户密钥、管理员 openid、私钥写死在前端代码里；本地 `.env*` 已被 `.gitignore` 忽略。
- 代码风格保持 CommonJS 云函数写法，优先复用项目现有两空格缩进和简单模块结构。
- 每个阶段完成后都要运行对应 gate，并用 `git status --short` 确认改动范围。

## 4. Collection 设计

编码 Agent 应创建或记录以下公共集合。若 CloudBase MCP/CLI 可以直接创建集合，则按此清单创建；若当前环境无法自动创建集合，则必须在仓库中新增 `docs/cloud_collections.md`，写清每个集合的创建方式、权限建议和 seed 数据，并让 `adminCore.initSchema` 在集合缺失时返回明确错误。

公共集合：

- `users`
  - `_id` 建议为 `openid`。
  - 字段：`openid`、`unionid`、`phoneNumber`、`nickname`、`avatarUrl`、`roles`、`status`、`lastLoginAt`、`createdAt`、`updatedAt`。
- `point_accounts`
  - 字段：`userId`、`availablePoints`、`frozenPoints`、`totalRechargedPoints`、`totalConsumedPoints`、`createdAt`、`updatedAt`。
  - 一个用户只能有一个积分账户。
- `point_transactions`
  - 不可变流水。
  - 字段：`userId`、`type`、`deltaAvailable`、`deltaFrozen`、`availableAfter`、`frozenAfter`、`relatedAppKey`、`relatedOrderId`、`relatedUsageId`、`idempotencyKey`、`note`、`createdAt`。
- `apps`
  - 字段：`appKey`、`name`、`description`、`entryPage`、`cloudFunctionName`、`status`、`pricing`、`sortOrder`、`icon`、`createdAt`、`updatedAt`。
  - `status` 首版至少支持 `active`、`disabled`、`coming_soon`。
- `app_usage_records`
  - 字段：`userId`、`appKey`、`status`、`costPoints`、`freezeTransactionId`、`settleTransactionId`、`releaseTransactionId`、`inputSummary`、`resultRef`、`errorCode`、`errorMessage`、`startedAt`、`finishedAt`。
  - `status` 首版至少支持 `created`、`frozen`、`succeeded`、`failed`、`released`。
- `recharge_packages`
  - 字段：`packageKey`、`name`、`amountFen`、`basePoints`、`bonusPoints`、`status`、`sortOrder`、`createdAt`、`updatedAt`。
- `payment_orders`
  - 字段：`orderNo`、`userId`、`packageKey`、`amountFen`、`pointsTotal`、`status`、`provider`、`providerTradeNo`、`prepayInfo`、`paidAt`、`closedAt`、`idempotencyKey`、`callbackDigest`、`createdAt`、`updatedAt`。
  - `status` 首版至少支持 `created`、`pending_pay`、`paid`、`closed`、`failed`、`refunded`。
- `admin_audit_logs`
  - 字段：`adminUserId`、`action`、`targetCollection`、`targetId`、`beforeSummary`、`afterSummary`、`requestId`、`createdAt`。
- `system_configs`
  - 字段：`key`、`value`、`description`、`updatedAt`。
  - 可用于管理员白名单、支付开关、mock 支付开关等非敏感配置；敏感密钥仍必须来自云函数环境变量。

每个具体业务工具以后使用 `app_<appKey>_*` 命名自己的私有 collection，不要把业务工具私有字段塞进公共集合。

## 5. 云函数接口约定

公共云函数使用 action 风格，避免为薄 CRUD 创建过多函数。每个云函数都要统一返回：

```js
{
  ok: true,
  data: {},
  requestId: "server-generated-or-context-id"
}
```

失败时返回：

```js
{
  ok: false,
  error: {
    code: "BALANCE_NOT_ENOUGH",
    message: "余额不足"
  },
  requestId: "server-generated-or-context-id"
}
```

首版公共云函数：

- `coreUser`
  - `bootstrap`：获取调用者身份，创建/更新 `users` 和 `point_accounts`，返回用户摘要和积分余额。
  - `getProfile`：返回当前用户资料、角色、积分余额。
- `coreApp`
  - `listApps`：返回可展示应用列表。
  - `getAppDetail`：返回某个应用详情。
  - `createUsage`：为某应用创建使用记录并冻结积分。
  - `finishUsage`：业务成功后结算冻结积分，仅允许带 `_internalToken` 的应用云函数内部调用。
  - `failUsage`：业务失败后释放冻结积分，仅允许带 `_internalToken` 的应用云函数内部调用。
- `corePoints`
  - `getBalance`：查询余额。
  - `listTransactions`：分页查询积分流水。
  - 内部能力：冻结、结算、释放、充值到账、管理员调整。内部能力不要直接暴露给普通客户端任意调用。
- `corePayment`
  - `listPackages`：返回上架充值包。
  - `createOrder`：创建固定充值包订单。
  - `mockPayOrder`：仅开发/测试可用，模拟支付成功并到账。
  - `handlePayCallback`：为真实微信支付回调预留。
  - `listOrders`：查询当前用户订单。
- `adminCore`
  - `initSchema`：seed 公共配置、默认应用、默认充值包；集合缺失时返回明确清单。
  - `upsertApp`、`upsertPackage`、`adjustPoints`、`listAuditLogs`。
  - 必须校验管理员身份，并写入 `admin_audit_logs`。

示例业务云函数：

- 可以保留或替换 `sum`，但最终必须有一个可从首页进入的示例工具，用于验证“应用目录 -> 冻结积分 -> 业务成功 -> 结算 -> 使用记录”的完整链路。

## 6. 前端页面约定

首版页面可以保持简洁，但必须能完整验证底座：

- 首页：展示 `apps` 中 `active` 和 `coming_soon` 应用；`disabled` 不展示。点击 `active` 应用进入对应页面。
- 我的：展示用户 openid 后四位或摘要、积分余额、冻结积分、充值入口、订单入口、积分流水入口。
- 充值页：展示固定充值包；开发阶段若真实支付未配置，展示“模拟支付”能力，并清楚限制为开发/测试。
- 示例工具页：展示应用名称、消耗积分、输入区域、执行按钮、扣费结果和使用记录状态。
- 管理能力首版不强制做完整管理 UI；可以先通过 `adminCore` 云函数和测试步骤完成。

## 7. 支付与环境变量

当前仓库没有真实微信支付配置。编码 Agent 需要实现支付订单状态机和 mock 支付闭环，真实微信支付接入只做可插拔结构和配置校验，不要硬编码密钥。

建议云函数环境变量：

- `WX_CLOUD_ENV=cloudbase-3gphz7fk0fe1b760`
- `ADMIN_OPENIDS=openid1,openid2`
- `PAYMENT_PROVIDER=mock` 或 `wechat`
- `MOCK_PAYMENT_ENABLED=true` 仅开发/测试环境使用
- 真实微信支付预留：`WX_PAY_MCH_ID`、`WX_PAY_APPID`、`WX_PAY_API_V3_KEY`、`WX_PAY_SERIAL_NO`、`WX_PAY_PRIVATE_KEY`、`WX_PAY_NOTIFY_URL`

如果真实微信支付变量不完整，`corePayment.createOrder` 可以创建 `pending_pay` 订单但不能声称已发起真实支付；`mockPayOrder` 只能在 `MOCK_PAYMENT_ENABLED=true` 且调用者是管理员或当前订单所属用户时使用。

## 8. Phase Sizing

本开发包拆成 5 个 phase，不宜合并为 3 个的原因：

- 账号/应用目录、积分账本、支付订单、前端体验、管理与验收分别有不同失败模式。
- 支付和积分都需要幂等与状态机，和普通页面开发放在同一阶段会让单个 coding session 难以验证。
- 前端页面必须基于前序云函数和 seed 数据，后做更容易闭环。
- 管理、安全、审计和最终验收属于上线边界，应该单独收口，避免被业务 UI 开发稀释。

阶段顺序：

1. Phase 1：工程底座、集合契约、用户 bootstrap、应用目录 seed。
2. Phase 2：共享积分账本、冻结/结算/释放、示例工具扣费链路。
3. Phase 3：固定充值包、支付订单、mock 支付到账、真实支付预留。
4. Phase 4：首页/我的/充值/订单/流水/示例工具前端体验。
5. Phase 5：管理员接口、审计、安全加固、集成测试和交接文档。

## 9. 运行与验证

编码 Agent 必须在 Phase 1 补齐脚本化静态检查，例如 `scripts/check-js.sh`，覆盖 `miniprogram/**/*.js` 和 `cloudfunctions/**/*.js` 的语法检查。由于微信开发者工具和云开发控制台不一定能在命令行完整自动化，文档和测试用例必须同时包含：

- 可自动运行的静态 gate。
- 云函数部署后的手工/半自动验收步骤。
- 集合缺失、支付未配置、管理员未配置时的明确失败提示。

推荐命令：

```bash
git status --short --branch
bash scripts/check-js.sh
git diff --check
```

如编码 Agent 新增 package 脚本或测试框架，必须同步更新 `run_manifest_huli-tools_0526.toml` 和 `test_case_huli-tools_0526.md`。

## 10. 非目标

- 不实现多个独立小程序或公众号之间的统一 unionid 账号合并。
- 不实现手机号强绑定登录。
- 不实现自定义金额充值。
- 不做复杂会员体系、优惠券、分销、订阅、发票或退款后台。
- 不在首版接入具体业务工具的复杂私有逻辑；只做一个用于验证底座的示例工具。
- 不引入外部数据库、独立 Node 服务或 Web 管理后台。

## 11. 未决问题

- 当前微信小程序 `appid` 已配置为 `wx1654159e6e3bb334`；如复制为其他小程序项目，需在微信开发者工具或项目配置中替换。
- 真实微信支付商户号和证书变量暂未提供；首版以 mock 支付完成开发验收。
- 管理员 openid 需要用户提供或在测试环境通过云函数环境变量配置。
- 是否要把 collection 直接创建到线上云环境，取决于 coding Agent 当时是否具备 CloudBase MCP/CLI 登录态；若不具备，必须交付手工创建清单。
