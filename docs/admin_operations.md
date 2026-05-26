# 管理员操作说明

## 前置条件

1. 将管理员微信号的小程序 openid 配置到云函数环境变量 `ADMIN_OPENIDS`（逗号分隔）。
2. 部署 `adminCore` 云函数。
3. 数据库集合 `admin_audit_logs` 已创建。

> 未配置 `ADMIN_OPENIDS` 时，所有管理操作返回 `ADMIN_NOT_CONFIGURED`。

## 管理接口一览

所有管理接口通过 `adminCore` 云函数调用，action 如下：

### initSchema

初始化系统配置、默认应用和默认充值包。首次部署后执行一次即可，重复执行会更新已有 seed 数据，不会删除用户数据。

```js
wx.cloud.callFunction({
  name: "adminCore",
  data: { action: "initSchema" },
});
```

### upsertApp

新增或更新应用目录。

```js
wx.cloud.callFunction({
  name: "adminCore",
  data: {
    action: "upsertApp",
    appKey: "demo_sum",
    name: "积分示例工具",
    description: "演示积分扣费",
    entryPage: "/pages/tools/demo-sum/index",
    cloudFunctionName: "demoSum",
    status: "active",          // active / disabled / coming_soon
    pricing: { mode: "fixed", costPoints: 1 },
    sortOrder: 1,
  },
});
```

校验规则：
- `appKey`、`entryPage` 不能为空
- `status` 必须是 `active`、`disabled`、`coming_soon`
- `pricing.mode` 必须为 `fixed`，`costPoints` 必须为非负整数

### upsertPackage

新增或更新固定充值包。

```js
wx.cloud.callFunction({
  name: "adminCore",
  data: {
    action: "upsertPackage",
    packageKey: "pkg_6yuan",
    name: "6元充值包",
    amountFen: 600,
    basePoints: 60,
    bonusPoints: 0,
    status: "active",          // active / disabled
    sortOrder: 1,
  },
});
```

校验规则：
- `packageKey` 不能为空
- `amountFen` 必须是正整数
- `basePoints`、`bonusPoints` 必须为非负整数
- `status` 必须是 `active` 或 `disabled`

### adjustPoints

管理员手动增减用户积分。

```js
wx.cloud.callFunction({
  name: "adminCore",
  data: {
    action: "adjustPoints",
    targetUserId: "目标用户 openid",
    deltaPoints: 10,           // 正数增加，负数减少
    note: "测试补积分",
  },
});
```

约束：
- `deltaPoints` 必须为整数且不能为 0
- 减少积分时，不能使目标余额变为负数
- 自动写入 `point_transactions`（type=`admin_adjust`）和 `admin_audit_logs`

### listAuditLogs

分页查看管理员操作审计日志。

```js
wx.cloud.callFunction({
  name: "adminCore",
  data: {
    action: "listAuditLogs",
    page: 1,
    pageSize: 20,
  },
});
```

## 审计日志字段

| 字段 | 说明 |
|---|---|
| `adminUserId` | 执行操作的管理员 openid |
| `action` | 操作类型，如 `upsertApp`、`adjustPoints`、`initSchema` |
| `targetCollection` | 目标集合名 |
| `targetId` | 目标记录标识（如 appKey、userId） |
| `beforeSummary` | 变更前摘要（JSON 字符串） |
| `afterSummary` | 变更后摘要（JSON 字符串） |
| `requestId` | 关联请求 ID |
| `createdAt` | 操作时间 |

## 权限错误码

| 错误码 | 说明 |
|---|---|
| `ADMIN_NOT_CONFIGURED` | `ADMIN_OPENIDS` 未配置 |
| `FORBIDDEN` | 当前用户不在管理员白名单中 |
| `UNAUTHORIZED` | 无法获取调用者身份 |
