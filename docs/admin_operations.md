# 管理员操作说明

## 正式入口

- Web 管理端：<https://huli-tools-admin-cloudbase-3gphz7fk0fe1b760.webapps.tcloudbase.com/>
- CloudBase Web 应用服务名：`huli-tools-admin`
- 当前启用用户名/密码登录；管理员仍须满足下方 `ADMIN_WEB_UIDS` 或首次自动准入规则。

## 前置条件

### 小程序管理员

1. 将管理员微信号的小程序 openid 配置到云函数环境变量 `ADMIN_OPENIDS`（逗号分隔）。
2. 在 `adminCore` 和 `corePoints` 中配置相同的 `INTERNAL_API_SECRET` 随机字符串。
3. 部署 `adminCore` 和 `corePoints` 云函数。
4. 数据库集合 `admin_audit_logs` 已创建。

### Web 管理员

1. 在 CloudBase 控制台启用 Web Auth 登录方式（用户名/密码或邮箱/密码）。
2. **方式 A：环境变量手动配置**
   - 创建或登录首个管理员账号，获取 CloudBase Auth `uid`。
   - 将 `uid` 配置到 `adminCore` 环境变量 `ADMIN_WEB_UIDS`（逗号分隔）。
   - 重新部署 `adminCore` 云函数。
3. **方式 B：微信扫码首次自动准入**
   - 在 CloudBase 控制台启用"微信开放平台登录"，填入网站应用 AppID/AppSecret。
   - 配置 `admin-web` 环境变量 `VITE_WECHAT_LOGIN_ENABLED=true`。
   - 当 `ADMIN_OPENIDS`、`ADMIN_WEB_UIDS` 均为空且无任何持久化 Web 管理员时，第一个成功扫码的用户 uid 自动写入 `system_configs/admin_web_auto_admins` 成为管理员。
   - 之后的微信扫码用户需已在管理员列表中才能进入。

> 未配置 `ADMIN_OPENIDS` 且未配置 `ADMIN_WEB_UIDS` 且无持久化管理员时，所有管理操作返回 `ADMIN_NOT_CONFIGURED`。
> Web uid 必须由 `adminCore` 在服务端从 CloudBase Auth 上下文读取，前端不得传入 uid 作为鉴权依据。

## 环境变量

| 变量名 | 必填场景 | 用途 |
|---|---|---|
| `ADMIN_OPENIDS` | 小程序管理入口 | 小程序 openid 管理员白名单，逗号分隔 |
| `ADMIN_WEB_UIDS` | Web 管理端 | CloudBase Auth 用户 uid 管理员白名单，逗号分隔 |
| `INTERNAL_API_SECRET` | 必填 | 云函数间内部调用凭据，不允许暴露给 Web 前端 |

## 管理接口一览

所有管理接口通过 `adminCore` 云函数调用，action 如下：

### 只读接口

| Action | 说明 |
|---|---|
| `getAdminMe` | 返回当前管理员身份、来源（`miniProgram`/`web`）、环境 ID |
| `dashboardSummary` | 返回用户数、订单数、积分账户汇总、最近订单/使用记录/审计 |
| `listUsers` | 分页查询用户，支持 keyword 模糊搜索 |
| `getUserDetail` | 查询用户详情：基础信息、积分账户、最近流水/订单/使用记录 |
| `listPointTransactions` | 分页查询积分流水，支持 userId、type、startAt、endAt |
| `listOrders` | 分页查询订单，支持 userId、orderNo、status、startAt、endAt |
| `listUsageRecords` | 分页查询使用记录，支持 userId、appKey、status、startAt、endAt |
| `listApps` | 管理端应用列表，包含 disabled 应用 |
| `listPackages` | 管理端充值包列表，包含 disabled 套餐 |
| `listAuditLogs` | 分页查询审计日志，支持 adminUserId、actionFilter、时间范围 |

### 写操作接口

| Action | 说明 |
|---|---|
| `initSchema` | 初始化系统配置、默认应用和默认充值包的 seed 数据 |
| `adjustPoints` | 管理员手动增减用户积分，自动写审计日志 |
| `upsertApp` | 新增或更新应用目录 |
| `upsertPackage` | 新增或更新充值包 |
| `bootstrapFirstWebAdmin` | 首次自动准入：当无任何管理员时，将当前用户 uid 写入持久化管理员列表 |

### 统一分页与筛选

- 分页参数：`page`（从 1 开始）、`pageSize`（最大 100）
- 时间范围：`startAt`、`endAt`（ISO 8601 或时间戳）
- 返回结构：`{ list, total, page, pageSize }`

### 字段白名单

所有列表返回结果均经过字段白名单过滤，不返回内部 token、支付私钥、回调密文等敏感字段。

## 调用示例

### 小程序端调用

```js
wx.cloud.callFunction({
  name: "adminCore",
  data: { action: "getAdminMe" },
});
```

### Web 管理端调用

Web 管理端通过 `@cloudbase/js-sdk` 调用：

```js
const app = cloudbase.init({ env: "cloudbase-3gphz7fk0fe1b760" });
await app.auth().signInWithUsernameAndPassword(username, password);
const res = await app.callFunction({ name: "adminCore", data: { action: "getAdminMe" } });
```

### adjustPoints

```js
{
  action: "adjustPoints",
  targetUserId: "目标用户 openid",
  deltaPoints: 10,           // 正数增加，负数减少
  note: "测试补积分",
  idempotencyKey: "可选幂等键"
}
```

约束：
- `deltaPoints` 必须为整数且不能为 0
- 减少积分时，不能使目标余额变为负数
- 自动写入 `point_transactions`（type=`admin_adjust`）和 `admin_audit_logs`
- 返回 `availableAfter`、`frozenAfter`、`transactionId`

### upsertApp

```js
{
  action: "upsertApp",
  appKey: "demo_sum",
  name: "积分示例工具",
  description: "演示积分扣费",
  entryPage: "/pages/tools/demo-sum/index",
  cloudFunctionName: "demoSum",
  status: "active",          // active / disabled / coming_soon
  pricing: { mode: "fixed", costPoints: 1 },
  sortOrder: 1,
}
```

### upsertPackage

```js
{
  action: "upsertPackage",
  packageKey: "pkg_6yuan",
  name: "6元充值包",
  amountFen: 600,
  basePoints: 60,
  bonusPoints: 0,
  status: "active",          // active / disabled
  sortOrder: 1,
}
```

## 审计日志字段

| 字段 | 说明 |
|---|---|
| `adminUserId` | 执行操作的管理员标识；小程序为 openid，Web 为 `web:<uid>` |
| `action` | 操作类型 |
| `targetCollection` | 目标集合名 |
| `targetId` | 目标记录标识 |
| `beforeSummary` | 变更前摘要 |
| `afterSummary` | 变更后摘要 |
| `requestId` | 关联请求 ID |
| `createdAt` | 操作时间 |

## 权限错误码

| 错误码 | 说明 |
|---|---|
| `ADMIN_NOT_CONFIGURED` | `ADMIN_OPENIDS` 和 `ADMIN_WEB_UIDS` 均未配置且无持久化管理员 |
| `FORBIDDEN` | 当前用户不在管理员白名单中 |
| `UNAUTHORIZED` | 无法获取调用者身份 |
| `WEB_ADMIN_ALREADY_CONFIGURED` | 已有管理员存在，无法自动准入 |
| `INVALID_PARAM` | 参数校验失败 |
| `NOT_FOUND` | 目标资源不存在 |
| `DB_ERROR` | 数据库操作失败 |
| `MISSING_COLLECTION` | 目标集合不存在 |
| `INTERNAL_SECRET_NOT_CONFIGURED` | `INTERNAL_API_SECRET` 未配置 |
