# huli-tools Code Wiki

> 本文档为 `huli-tools` 项目的结构化代码百科，涵盖整体架构、模块职责、关键类与函数、数据契约、依赖关系及运行方式。维护本项目前建议先通读本文档与 [AGENTS.md](../AGENTS.md)。

---

## 1. 项目概述

| 属性 | 说明 |
|------|------|
| 项目名称 | huli-tools |
| 类型 | 微信小程序 + 微信云开发（CloudBase） |
| 小程序 APPID | `wx1654159e6e3bb334` |
| 云环境 ID | `cloudbase-3gphz7fk0fe1b760` |
| 技术栈 | 微信小程序原生语法、CommonJS、wx-server-sdk |
| 代码风格 | CommonJS，两空格缩进 |

### 1.1 核心定位

`huli-tools` 是一个**积分制工具平台小程序**。用户通过充值获得积分，使用平台内的各类工具时按固定积分扣费。系统提供完整的用户管理、积分账本、支付订单、应用目录、使用记录和管理后台能力。

### 1.2 目录结构总览

```
huli-tools/
├── AGENTS.md                     # 工程规则与长期约束
├── project.config.json           # 微信小程序项目配置
├── run_manifest_huli-tools_0526.toml   # 文档驱动开发清单
├── scripts/
│   └── check-js.sh               # JS 语法检查脚本
├── config/
│   └── mcporter.json             # 配置占位
├── docs/
│   ├── cloud_collections.md      # 数据库集合契约文档
│   ├── dev_setup.md              # 开发环境配置说明
│   ├── payment_setup.md          # 支付配置说明
│   ├── admin_operations.md       # 管理员操作说明
│   └── CODE_WIKI.md              # 本文档
├── admin-web/                    # Web 管理端（Vite + React + TS + Ant Design）
│   ├── src/services/cloudbase.ts  # CloudBase 初始化
│   ├── src/services/adminApi.ts   # 管理 API 统一封装
│   └── src/pages/                 # 页面组件
├── promptDocs/
│   └── prompt-pack-huli-tools-0526/    # LLM 提示词包
├── miniprogram/                  # 小程序前端代码
│   ├── app.js                    # 小程序入口，初始化云开发
│   ├── app.json                  # 全局页面与窗口配置
│   ├── app.wxss                  # 全局样式
│   ├── sitemap.json              # 站点地图
│   ├── services/api.js           # 前端 API 统一封装
│   ├── custom-tab-bar/           # 自定义底部 TabBar
│   └── pages/                    # 页面目录
│       ├── index/                # 首页（应用目录 + 用户摘要）
│       ├── profile/              # 我的（积分、菜单入口）
│       ├── recharge/             # 积分充值
│       ├── orders/               # 我的订单
│       ├── transactions/         # 积分流水
│       ├── usage-records/        # 使用记录
│       ├── apps/ai_draw/         # 护士职业定妆照应用
│       ├── apps/nursing_undercover/ # 谁是卧底（护理版）应用
│       └── tools/demo-sum/       # 示例工具：求和
└── cloudfunctions/               # 云函数目录
    ├── coreUser/                 # 用户身份与积分账户 bootstrap
    ├── coreApp/                  # 应用目录与使用记录生命周期
    ├── corePoints/               # 积分账本、冻结/结算/释放/充值
    ├── corePayment/              # 支付订单与充值包
    ├── adminCore/                # 管理接口与数据 seed
    ├── demoSum/                  # 示例业务云函数（求和）
    ├── app_ai_draw/              # 护士职业定妆照应用云函数
    ├── app_nursing_undercover/   # 谁是卧底（护理版）应用云函数
    ├── getOpenId/                # 获取用户 OPENID（示例）
    └── sum/                      # 求和示例（最简云函数）
```

---

## 2. 整体架构

### 2.1 架构分层

```
┌─────────────────────────────────────────────────────────────┐
│                      小程序前端层                            │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐           │
│  │  首页   │ │  我的   │ │ 充值页  │ │ 工具页  │  ...       │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘           │
│       └─────────────┴──────────┴──────────┘                 │
│                     services/api.js                          │
└──────────────────────────┬──────────────────────────────────┘
                           │ wx.cloud.callFunction
┌──────────────────────────▼──────────────────────────────────┐
│                      云函数层（BaaS）                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ coreUser │ │ coreApp  │ │corePoints│ │corePayment│       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                    │
│  │ adminCore│ │ demoSum  │ │app_ai_draw│ │app_nursing...│   │
│  └──────────┘ └──────────┘ └──────────┘ └───────────────┘   │
└──────────────────────────┬──────────────────────────────────┘
                           │ wx-server-sdk
┌──────────────────────────▼──────────────────────────────────┐
│                    微信云开发基础设施                        │
│         云数据库（MongoDB）+ 云存储 + 云函数运行时           │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 核心设计原则

1. **客户端不可信**：所有写操作必须走云函数，客户端不能直接写敏感 collection。
2. **身份必须从上下文获取**：云函数使用 `cloud.getWXContext().OPENID` 获取调用者身份，禁止信任客户端传入的 `openid`、角色、价格、积分数量。
3. **金额与积分**：金额统一用整数"分"，积分统一用整数，时间统一用服务端 `Date`。
4. **内部接口隔离**：`corePoints` 的冻结、结算、释放、充值、管理员调整等接口仅供其他云函数内部调用，必须校验 `_internalToken`。
5. **幂等与状态机**：所有改变余额、订单、使用记录状态的写操作必须具备幂等键；重复支付回调不能重复到账；重复 finish/fail usage 不能重复结算或释放。

---

## 3. 前端模块（miniprogram）

### 3.1 全局入口

#### app.js

- **职责**：小程序生命周期入口，初始化微信云开发环境。
- **关键代码**：
  ```js
  App({
    onLaunch() {
      wx.cloud.init({
        env: "cloudbase-3gphz7fk0fe1b760",
        traceUser: true,
      });
    },
  });
  ```

#### app.json

- **页面列表**：`pages/index/index`、`pages/profile/profile`、`pages/tools/demo-sum/index`、`pages/apps/ai_draw/index`、`pages/recharge/recharge`、`pages/orders/orders`、`pages/transactions/transactions`、`pages/usage-records/usage-records`
- **TabBar**：自定义 TabBar（`custom: true`），包含首页和我的两个入口。
- **云开发**：`"cloud": true`

### 3.2 API 封装层（services/api.js）

这是前端与云函数交互的唯一通道，统一处理响应格式和错误提示。

#### 核心函数

| 函数 | 说明 |
|------|------|
| `callCloud(functionName, data)` | 通用云函数调用，自动解析 `{ ok, data, error }` 格式 |
| `toastError(err)` | 统一错误提示，显示 `wx.showToast` |

#### 业务 API 列表

| API | 对应云函数 | action | 说明 |
|-----|-----------|--------|------|
| `bootstrapUser()` | `coreUser` | `bootstrap` | 首次登录创建用户和积分账户 |
| `getProfile()` | `coreUser` | `getProfile` | 获取用户档案和积分余额 |
| `listApps()` | `coreApp` | `listApps` | 获取应用目录 |
| `getAppDetail(appKey)` | `coreApp` | `getAppDetail` | 获取应用详情 |
| `createUsage(appKey, inputSummary)` | `coreApp` | `createUsage` | 创建使用记录并冻结积分 |
| `getBalance()` | `corePoints` | `getBalance` | 查询积分余额 |
| `listTransactions(page, pageSize)` | `corePoints` | `listTransactions` | 查询积分流水 |
| `listPackages()` | `corePayment` | `listPackages` | 查询充值包 |
| `createOrder(packageKey)` | `corePayment` | `createOrder` | 创建支付订单 |
| `listOrders(page, pageSize)` | `corePayment` | `listOrders` | 查询订单列表 |
| `mockPayOrder(orderNo)` | `corePayment` | `mockPayOrder` | 模拟支付 |
| `listUsageRecords(page, pageSize)` | `coreApp` | `listUsageRecords` | 查询使用记录 |

### 3.3 页面模块

#### 首页（pages/index/index）

- **职责**：展示用户积分摘要和应用目录列表。
- **核心逻辑**：
  - `onLoad` 调用 `loadHomeData()`，并行请求 `bootstrapUser()` 和 `listApps()`。
  - 点击应用卡片时校验 `status === "active"`，然后 `wx.navigateTo` 跳转到对应 `entryPage`。

#### 我的（pages/profile/profile）

- **职责**：展示用户身份、积分余额，提供充值、订单、流水、使用记录入口。
- **核心逻辑**：
  - `onShow` 自动刷新用户档案。
  - `maskOpenid()` 对 openid 做脱敏展示。

#### 充值页（pages/recharge/recharge）

- **职责**：展示充值包列表，创建订单，模拟支付。
- **核心逻辑**：
  - `loadPackages()` 加载 `active` 状态的充值包，金额分转元展示。
  - `onCreateOrder()` 创建订单后弹出确认框。
  - `onMockPay()` 调用模拟支付，成功后刷新上一页余额。

#### 订单页（pages/orders/orders）

- **职责**：分页展示支付订单，支持下拉刷新和上拉加载。
- **状态映射**：`created`→已创建、`pending_pay`→待支付、`paid`→已支付、`closed`→已关闭、`failed`→失败、`refunded`→已退款。

#### 积分流水（pages/transactions/transactions）

- **职责**：分页展示积分变动流水。
- **类型映射**：`freeze`→冻结积分（橙）、`settle`→结算扣费（红）、`release`→释放积分（绿）、`recharge`→充值到账（绿）、`admin_adjust`→管理员调整（蓝）。

#### 使用记录（pages/usage-records/usage-records）

- **职责**：分页展示工具使用记录及状态。
- **状态映射**：`created`→已创建、`frozen`→已冻结、`succeeded`→成功、`failed`→失败、`released`→已释放。

#### 示例工具（pages/tools/demo-sum/index）

- **职责**：演示完整的积分扣费链路。
- **交互流程**：
  1. 用户输入 A、B，点击计算。
  2. 前端调用 `createUsage("demo_sum", {a, b})` 创建使用记录并冻结积分。
  3. 调用 `demoSum` 云函数执行业务（求和）。
  4. 业务成功 → `demoSum` 内部调用 `finishUsage` 结算积分。
  5. 业务失败 → `demoSum` 内部调用 `failUsage` 释放积分。
  6. 支持 `triggerFail` 开关模拟失败场景。

### 3.4 自定义 TabBar（custom-tab-bar/index）

- **类型**：微信小程序自定义组件（`Component({...})`）。
- **配置**：两个 Tab 项——首页（`/pages/index/index`）和我的（`/pages/profile/profile`）。
- **交互**：点击切换时调用 `wx.switchTab`，并更新 `selected` 状态。

---

## 4. 后端模块（cloudfunctions）

### 4.1 统一接口规范

所有公共云函数采用 **action 风格**，统一返回格式：

```js
// 成功
{ ok: true, data: { ... }, requestId: "..." }

// 失败
{ ok: false, error: { code: "...", message: "..." }, requestId: "..." }
```

### 4.2 核心云函数

#### coreUser — 用户身份与积分账户

| Action | 权限 | 说明 |
|--------|------|------|
| `bootstrap` | 登录用户 | 首次访问自动创建 `users` 和 `point_accounts` 记录；非首次更新 `lastLoginAt` |
| `getProfile` | 登录用户 | 返回用户档案和积分余额 |

**关键函数**：

- `ensurePointAccount(openid, now)`：幂等创建积分账户，`_id` 与 `openid` 一致，处理并发重复创建。
- `bootstrap(event, context)`：用户登录入口，自动完成用户注册 + 积分账户初始化。

#### coreApp — 应用目录与使用记录

| Action | 权限 | 说明 |
|--------|------|------|
| `listApps` | 任意用户 | 查询 `active` 和 `coming_soon` 状态的应用列表 |
| `getAppDetail` | 任意用户 | 根据 `appKey` 查询应用详情 |
| `createUsage` | 登录用户 | 创建使用记录，若需扣费则调用 `corePoints.freezePoints` 冻结积分 |
| `finishUsage` | **内部调用** | 结算使用记录，调用 `corePoints.settleFrozenPoints`，需 `_internalToken` |
| `failUsage` | **内部调用** | 失败使用记录，调用 `corePoints.releaseFrozenPoints` 释放积分，需 `_internalToken` |
| `listUsageRecords` | 登录用户 | 分页查询当前用户的使用记录 |

**关键函数**：

- `resolveUsageActor(event)`：解析调用者身份。若传入 `userId` 或 `_internalToken`，则校验内部凭据，允许内部云函数代操作。
- `createUsage(event, context)`：先创建 `app_usage_records`（状态 `created`），再用 `usageId` 作为幂等键冻结积分，最后更新状态为 `frozen`。若冻结后更新记录失败，自动回滚释放积分。

#### corePoints — 积分账本与流水

| Action | 权限 | 说明 |
|--------|------|------|
| `getBalance` | 登录用户 | 查询可用积分、冻结积分、累计充值/消费 |
| `listTransactions` | 登录用户 | 分页查询积分流水 |
| `freezePoints` | **内部调用** | 可用积分 → 冻结积分，需 `_internalToken` |
| `settleFrozenPoints` | **内部调用** | 冻结积分 → 扣费（累计消费增加），需 `_internalToken` |
| `releaseFrozenPoints` | **内部调用** | 冻结积分 → 恢复可用积分，需 `_internalToken` |
| `creditPoints` | **内部调用** | 充值到账（可用积分增加），需 `_internalToken` |
| `adminAdjustPoints` | **内部调用** | 管理员调整积分，需 `_internalToken` |

**关键函数**：

- `getInternalAuthError(event)`：校验 `_internalToken` 是否匹配环境变量 `INTERNAL_API_SECRET`。
- `freezePoints` / `settleFrozenPoints` / `releaseFrozenPoints` / `creditPoints` / `adminAdjustPoints`：均具备幂等检查（通过 `idempotencyKey` 的哈希文档 ID 和历史查询兼容），账户与流水在同一事务内更新。

#### corePayment — 支付订单与充值

| Action | 权限 | 说明 |
|--------|------|------|
| `listPackages` | 任意用户 | 查询 `active` 状态的充值包 |
| `createOrder` | 登录用户 | 创建支付订单，校验充值包状态和支付配置 |
| `listOrders` | 登录用户 | 分页查询当前用户的订单 |
| `mockPayOrder` | 登录用户 / 管理员 | 模拟支付成功，先调用 `corePoints.creditPoints` 到账，再更新订单状态为 `paid` |
| `handlePayCallback` | 服务端 | 微信支付回调（当前为预留结构） |
| `closeOrder` | 登录用户 | 关闭未支付订单 |

**关键函数**：

- `generateOrderNo()`：生成订单号，格式 `ORD{yyyyMMddHHmmss}{6位随机数}`。
- `isMockEnabled()` / `getPaymentProvider()`：读取环境变量判断支付模式。
- `mockPayOrder`：严格幂等，已 `paid` 订单返回 `alreadyPaid`；先到账再改状态，若改状态失败可重复调用补齐。

#### adminCore — 管理接口

| Action | 权限 | 说明 |
|--------|------|------|
| `getAdminMe` | 管理员 | 返回管理员身份、来源、环境 ID |
| `dashboardSummary` | 管理员 | 运营概览 |
| `listUsers` | 管理员 | 分页查询用户 |
| `getUserDetail` | 管理员 | 用户详情 |
| `listPointTransactions` | 管理员 | 积分流水 |
| `listOrders` | 管理员 | 订单查询 |
| `listUsageRecords` | 管理员 | 使用记录 |
| `listApps` | 管理员 | 应用列表（含 disabled） |
| `listPackages` | 管理员 | 充值包列表 |
| `listAuditLogs` | 管理员 | 审计日志 |
| `initSchema` | 管理员 | 初始化 seed 数据 |
| `adjustPoints` | 管理员 | 手动调整用户积分 |
| `upsertApp` | 管理员 | 新增或更新应用 |
| `upsertPackage` | 管理员 | 新增或更新充值包 |
| `bootstrapFirstWebAdmin` | 已登录 Web 用户 | 无任何管理员时，将当前 CloudBase Auth uid 自动准入为首位 Web 管理员 |

支持小程序 openid（`ADMIN_OPENIDS`）和 Web uid（`ADMIN_WEB_UIDS` + `system_configs/admin_web_auto_admins`）双通道鉴权。Web uid 由 `@cloudbase/node-sdk` 在云函数服务端通过 `auth.getUserInfo().uid` 读取，不能由前端传入。

**关键函数**：

- `resolveAdminIdentity(wxContext, requestId)`：统一身份解析，兼容小程序 openid 和 CloudBase Web Auth uid。
- `validateAdmin(wxContext, requestId)`：兼容层，内部调用 `resolveAdminIdentity`。
- `writeAuditLog(...)`：写审计日志，Web 管理员使用 `web:<uid>` 格式。
- `pickFields(obj, fields)`：字段白名单过滤。

### 4.3 业务示例云函数

#### demoSum — 积分示例工具

- **职责**：演示完整的"创建 usage → 执行业务 → 结算/释放"链路。
- **流程**：
  1. 校验 `usageId` 存在、属于当前用户、`appKey` 为 `demo_sum`，且状态为 `frozen` 或 `created`。
  2. 若 `triggerFail=true`，调用 `coreApp.failUsage` 模拟失败并释放积分。
  3. 若输入非数字，调用 `coreApp.failUsage` 释放积分。
  4. 业务成功（求和），调用 `coreApp.finishUsage` 结算积分。

#### app_ai_draw — 护士职业定妆照应用

- **职责**：接收主体形象照和多张参考图，服务端组装护士职业标准照 prompt，调用 `gpt-image-2-web` 异步生图。
- **关键约束**：
  1. `usageId` 必须属于当前用户且 `appKey` 必须为 `ai_draw`。
  2. `prepareUpload` 只签发当前用户前缀下的受控 `cloudPath`；`generate` 必须校验 `fileID/cloudPath` 归属。
  3. `app_ai_draw_tasks` 使用 `usageId` 作为文档 ID，绑定 `userId`、`usageId`、`jobId`、主体照、参考图、任务状态和 `expiresAt`。
  4. `query` 必须同时校验 `usageId` 和 `jobId`，避免跨任务结算。
  5. 生成失败、外部任务失败或前端超时取消时调用 `coreApp.failUsage` 释放或标记失败。

#### app_nursing_undercover — 谁是卧底（护理版）

- **职责**：提供护理教学版“谁是卧底”对局，支持词语卧底和病例推理卧底，AI NPC 参与发言、投票和复盘。
- **关键约束**：
  1. `usageId` 必须属于当前用户且 `appKey` 必须为 `nursing_undercover`。
  2. `app_nursing_undercover_sessions` 保存对局、角色、发言、投票、结果和教学复盘。
  3. 未结束对局返回客户端时必须隐藏 NPC 密令、阵营和 `undercoverRoleId`。
  4. `submitSpeech` / `submitVote` 使用 `clientActionId` 做幂等，避免重复生成 NPC 发言或重复结算。
  5. 投票成功必须先完成 `coreApp.finishUsage`，再把 session 标记为 `finished`；取消对局必须先 `failUsage`，再标记 `cancelled`。
  6. CloudBase AI 模型 ID 通过 `CLOUDBASE_AI_MODEL` 环境变量配置，未配置或不可用时使用模板 fallback，不在代码中猜测模型 ID。

### 4.4 遗留/示例云函数

| 云函数 | 说明 |
|--------|------|
| `getOpenId` | 返回当前用户的 `openid`、`appid`、`unionid` |
| `sum` | 最简云函数示例，求和 `a + b` |

---

## 5. 数据契约（CloudBase Collections）

### 5.1 公共集合清单

| 集合名 | 用途 | 客户端权限 |
|--------|------|-----------|
| `users` | 用户主档案 | 无直接读写 |
| `point_accounts` | 积分账户（余额、冻结） | 无直接读写 |
| `point_transactions` | 积分流水（不可变） | 无写，可选只读自己 |
| `apps` | 应用目录配置 | 只读 active/coming_soon |
| `app_usage_records` | 应用使用记录 | 无写，只读自己 |
| `recharge_packages` | 固定充值包 | 只读 active |
| `payment_orders` | 支付订单 | 无写，只读自己 |
| `admin_audit_logs` | 管理员操作审计 | 无权限 |
| `system_configs` | 系统配置 | 无权限 |

### 5.2 关键字段速查

#### point_accounts

```js
{
  _id: "openid",           // 与 userId 一致
  userId: "openid",
  availablePoints: 0,      // 可用积分
  frozenPoints: 0,         // 冻结积分
  totalRechargedPoints: 0, // 累计充值
  totalConsumedPoints: 0,  // 累计消费
  createdAt: Date,
  updatedAt: Date,
}
```

#### point_transactions

```js
{
  userId: "openid",
  type: "freeze|settle|release|recharge|admin_adjust",
  deltaAvailable: -1,      // 可用积分变化量
  deltaFrozen: 1,          // 冻结积分变化量
  availableAfter: 99,      // 变化后可用积分
  frozenAfter: 1,          // 变化后冻结积分
  relatedAppKey: "demo_sum",
  relatedOrderId: "ORD...",
  relatedUsageId: "usage_id",
  idempotencyKey: "freeze_usage_id", // 幂等键
  note: "冻结积分",
  createdAt: Date,
}
```

#### app_usage_records

```js
{
  userId: "openid",
  appKey: "demo_sum",
  status: "created|frozen|succeeded|failed|released",
  costPoints: 1,
  freezeTransactionId: "tx_id",
  settleTransactionId: "tx_id",
  releaseTransactionId: "tx_id",
  inputSummary: { a: 1, b: 2 },
  resultRef: "1 + 2 = 3",
  errorCode: "DEMO_FAIL",
  errorMessage: "模拟业务失败",
  startedAt: Date,
  finishedAt: Date,
}
```

#### payment_orders

```js
{
  orderNo: "ORD20240526120000000001",
  userId: "openid",
  packageKey: "pkg_6yuan",
  amountFen: 600,          // 金额（分）
  pointsTotal: 60,         // 到账总积分
  status: "created|pending_pay|paid|closed|failed|refunded",
  provider: "mock|wechat",
  providerTradeNo: "MOCK_...",
  prepayInfo: {},
  paidAt: Date,
  closedAt: Date,
  idempotencyKey: "order_ORD...",
  callbackDigest: "mock_payment",
  createdAt: Date,
  updatedAt: Date,
}
```

### 5.3 状态机

#### 使用记录状态机

```
created ──[需扣费]──> frozen ──[业务成功]──> succeeded
   │                      │
   │                      └─[业务失败]──> released
   │
   └──[无需扣费]──> [直接成功/失败]
```

#### 支付订单状态机

```
created / pending_pay
       │
       │ 支付成功
       v
     paid
       │
       │ 关闭（未支付时）
       v
    closed
       │
       │ 退款（未来扩展）
       v
   refunded
```

---

## 6. 依赖关系

### 6.1 云函数间调用关系

```
coreUser
  └─ 读写: users, point_accounts

coreApp
  ├─ 读写: apps, app_usage_records
  ├─ 调用: corePoints.freezePoints (内部)
  ├─ 调用: corePoints.settleFrozenPoints (内部)
  └─ 调用: corePoints.releaseFrozenPoints (内部)

corePoints
  ├─ 读写: point_accounts, point_transactions
  └─ 内部接口: freezePoints, settleFrozenPoints, releaseFrozenPoints, creditPoints, adminAdjustPoints

corePayment
  ├─ 读写: recharge_packages, payment_orders
  ├─ 调用: corePoints.creditPoints (内部)
  └─ 预留: handlePayCallback (微信支付)

adminCore
  ├─ 读写: apps, recharge_packages, admin_audit_logs, system_configs
  ├─ 调用: corePoints.adminAdjustPoints (内部)
  └─ 校验: ADMIN_OPENIDS 白名单

demoSum (业务示例)
  ├─ 读写: app_usage_records
  ├─ 调用: coreApp.finishUsage (内部)
  └─ 调用: coreApp.failUsage (内部)
```

### 6.2 前端与云函数对应关系

| 前端页面 | 调用云函数 | 主要 action |
|---------|-----------|------------|
| 首页 | `coreUser`, `coreApp` | `bootstrap`, `listApps` |
| 我的 | `coreUser` | `getProfile` |
| 充值页 | `corePayment` | `listPackages`, `createOrder`, `mockPayOrder` |
| 订单页 | `corePayment` | `listOrders` |
| 流水页 | `corePoints` | `listTransactions` |
| 使用记录 | `coreApp` | `listUsageRecords` |
| 示例工具 | `coreApp`, `demoSum` | `createUsage`, `demoSum` |

### 6.3 外部依赖

所有云函数仅依赖 `wx-server-sdk`（`latest`），无其他 npm 依赖。

---

## 7. 环境变量

### 7.1 开发最小集

| 变量名 | 说明 | 建议值 |
|--------|------|--------|
| `ADMIN_OPENIDS` | 管理员白名单，逗号分隔 | `openid1,openid2` |
| `PAYMENT_PROVIDER` | 支付提供商 | `mock`（开发阶段） |
| `MOCK_PAYMENT_ENABLED` | 是否启用模拟支付 | `true`（开发阶段） |
| `INTERNAL_API_SECRET` | 云函数间调用凭据 | 必须显式配置为随机字符串 |

### 7.2 真实微信支付额外需要

| 变量名 | 说明 |
|--------|------|
| `WX_PAY_MCH_ID` | 微信支付商户号 |
| `WX_PAY_APPID` | 微信支付 APPID |
| `WX_PAY_API_V3_KEY` | API v3 密钥 |
| `WX_PAY_SERIAL_NO` | 商户证书序列号 |
| `WX_PAY_PRIVATE_KEY` | 商户私钥 |
| `WX_PAY_NOTIFY_URL` | 支付回调通知地址 |

### 7.3 配置路径

微信开发者工具 → 云开发 → 云函数 → 选中函数 → 版本与配置 → 环境变量

> 注意：`INTERNAL_API_SECRET` 必须在 `coreApp`、`corePoints`、`corePayment`、`adminCore`、`demoSum`、`app_ai_draw`、`app_nursing_undercover` 中配置为**相同的随机字符串**。`app_nursing_undercover` 如需启用 AI NPC，还需配置经过 CloudBase AI preflight 确认的 `CLOUDBASE_AI_MODEL`。

---

## 8. 项目运行方式

### 8.1 前置要求

- 微信开发者工具（最新稳定版）
- Node.js 16+（用于本地静态检查）
- 已开通微信云开发的环境（环境 ID：`cloudbase-3gphz7fk0fe1b760`）

### 8.2 首次部署步骤

1. **打开项目**：用微信开发者工具打开项目根目录。
2. **配置 APPID**：在 `project.config.json` 中将 `appid` 替换为真实小程序 APPID。
3. **部署云函数**：右键以下云函数 → 「创建并部署：云端安装依赖」
   - `coreUser`、`coreApp`、`corePoints`、`corePayment`、`adminCore`、`demoSum`、`app_ai_draw`、`app_nursing_undercover`
4. **配置环境变量**：为上述云函数配置 `ADMIN_OPENIDS`、`INTERNAL_API_SECRET`、`PAYMENT_PROVIDER`、`MOCK_PAYMENT_ENABLED`。
5. **创建数据库集合**：在微信开发者工具云开发控制台中创建 11 个集合（详见 `docs/cloud_collections.md`）。
6. **初始化 seed 数据**：调用 `adminCore.initSchema`：
   ```js
   wx.cloud.callFunction({
     name: "adminCore",
     data: { action: "initSchema" },
   });
   ```
7. **验证运行**：访问首页，确认应用列表和积分余额正常加载。

### 8.3 本地静态检查

```bash
bash scripts/check-js.sh
```

此命令递归检查 `miniprogram/**/*.js` 和 `cloudfunctions/**/*.js` 的语法，排除 `node_modules`。

### 8.4 日常开发流程

1. 修改代码后运行 `bash scripts/check-js.sh` 确保无语法错误。
2. 修改云函数后重新部署对应云函数。
3. 新增云函数、页面或 collection 时，同步更新 `docs/`、`test_case_huli-tools_0526.md` 和 `run_manifest_huli-tools_0526.toml`。

---

## 9. 安全要点

1. **客户端不可信**：所有写操作必须走云函数；客户端不能直接写敏感 collection。
2. **身份必须从上下文获取**：禁止信任客户端传入的 `openid`、角色、价格、积分数量。
3. **内部接口隔离**：`corePoints` 的 `freezePoints`、`settleFrozenPoints`、`releaseFrozenPoints`、`creditPoints`、`adminAdjustPoints` 必须校验 `_internalToken`。
4. **mock 支付控制**：生产环境必须关闭 `MOCK_PAYMENT_ENABLED`。
5. **敏感密钥管理**：微信支付私钥等敏感信息仅通过云函数环境变量注入，不得写入代码仓库。

---

## 10. 扩展指南

### 10.1 新增业务工具

1. **创建业务云函数**：在 `cloudfunctions/` 下新建 `app_<appKey>` 云函数（如 `app_my_tool`）。
2. **注册应用**：调用 `adminCore.upsertApp` 注册应用信息，包括 `appKey`、`name`、`entryPage`、`cloudFunctionName`、`pricing`。
3. **实现业务逻辑**：参考 `demoSum` 实现 `createUsage` → 校验 `usage.appKey` → 执行业务 → `finishUsage`/`failUsage` 的完整链路。
4. **创建前端页面**：在 `miniprogram/pages/apps/<appKey>/` 下新建页面，调用 `api.createUsage` 和对应的业务云函数。
5. **更新文档**：同步更新本文档、`cloud_collections.md`、`test_case_huli-tools_0526.md`。

### 10.2 业务工具私有 Collection

业务工具如需独立数据存储，collection 命名必须以 `app_<appKey>_` 为前缀，例如 `app_demo_sum_logs`。不得把业务字段塞进公共集合。

---

## 11. 相关文档索引

| 文档 | 路径 | 说明 |
|------|------|------|
| 工程规则 | [AGENTS.md](../AGENTS.md) | 长期约束与架构规则 |
| 数据库契约 | [cloud_collections.md](cloud_collections.md) | 集合字段、权限、seed 数据 |
| 开发配置 | [dev_setup.md](dev_setup.md) | 环境搭建与部署步骤 |
| 支付配置 | [payment_setup.md](payment_setup.md) | Mock/微信支付配置详解 |
| 管理操作 | [admin_operations.md](admin_operations.md) | 管理员接口使用说明 |
| 测试用例 | `promptDocs/prompt-pack-huli-tools-0526/test_case_huli-tools_0526.md` | 功能测试清单 |
| 开发规约 | `promptDocs/prompt-pack-huli-tools-0526/master_spec_huli-tools_0526.md` | 产品规格与开发规约 |
