# CloudBase Collections 契约文档

> 本文档描述 `huli-tools` 公共集合的字段、权限建议、seed 数据及手工创建步骤。
> 若 CloudBase MCP/CLI 无法自动创建集合，请按以下清单在微信开发者工具云开发控制台手工创建。

## 公共集合清单

| 集合名 | 用途 | 首版是否必须创建 |
|---|---|---|
| `users` | 用户主档案 | 是 |
| `point_accounts` | 积分账户（余额、冻结） | 是 |
| `point_transactions` | 积分流水（不可变） | 是 |
| `apps` | 应用目录配置 | 是 |
| `app_usage_records` | 应用使用记录 | 是 |
| `recharge_packages` | 固定充值包 | 是 |
| `payment_orders` | 支付订单 | 是 |
| `admin_audit_logs` | 管理员操作审计 | 是 |
| `system_configs` | 系统配置（开关、白名单等） | 是 |

## 1. users

### 字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | 建议与 `openid` 一致 |
| `openid` | string | 微信 OPENID，主身份 |
| `unionid` | string | 微信 UNIONID，可为空 |
| `phoneNumber` | string | 手机号，预留 |
| `nickname` | string | 昵称 |
| `avatarUrl` | string | 头像 URL |
| `roles` | Array<string> | 角色列表，如 `["user"]` |
| `status` | string | `active` / `disabled` |
| `lastLoginAt` | Date | 最后登录时间 |
| `createdAt` | Date | 创建时间 |
| `updatedAt` | Date | 更新时间 |

### 权限建议

- 客户端：无直接读写权限（所有写操作走云函数）。
- 云函数：完全读写权限。

### seed 数据

无默认 seed，由 `coreUser.bootstrap` 在首次调用时自动创建。

## 2. point_accounts

### 字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | 建议与 `userId` 一致，降低重复账户风险 |
| `userId` | string | 关联 `users._id` |
| `availablePoints` | number | 可用积分，默认 `0` |
| `frozenPoints` | number | 冻结积分，默认 `0` |
| `totalRechargedPoints` | number | 累计充值积分，默认 `0` |
| `totalConsumedPoints` | number | 累计消费积分，默认 `0` |
| `createdAt` | Date | 创建时间 |
| `updatedAt` | Date | 更新时间 |

### 权限建议

- 客户端：无直接读写权限。
- 云函数：完全读写权限。

### seed 数据

无默认 seed，由 `coreUser.bootstrap` 在首次调用时自动创建；新账户建议使用 `_id = openid`。

## 3. point_transactions

### 字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `userId` | string | 关联用户 |
| `type` | string | `freeze` / `settle` / `release` / `recharge` / `admin_adjust` |
| `deltaAvailable` | number | 可用积分变化量 |
| `deltaFrozen` | number | 冻结积分变化量 |
| `availableAfter` | number | 变化后可用积分 |
| `frozenAfter` | number | 变化后冻结积分 |
| `relatedAppKey` | string | 关联应用（可选） |
| `relatedOrderId` | string | 关联订单（可选） |
| `relatedUsageId` | string | 关联使用记录（可选） |
| `idempotencyKey` | string | 幂等键 |
| `note` | string | 备注 |
| `createdAt` | Date | 创建时间 |

### 权限建议

- 客户端：无写权限，可只读自己的流水（可选）。
- 云函数：完全读写权限。

## 4. apps

### 字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `appKey` | string | 应用唯一标识，如 `demo_sum` |
| `name` | string | 应用名称 |
| `description` | string | 应用描述 |
| `entryPage` | string | 入口页面路径，如 `/pages/tools/demo-sum/index` |
| `cloudFunctionName` | string | 业务云函数名 |
| `status` | string | `active` / `disabled` / `coming_soon` |
| `pricing` | Object | `{ mode: "fixed", costPoints: number }` |
| `sortOrder` | number | 排序权重，越小越靠前 |
| `icon` | string | 图标 URL 或类名（可选） |
| `createdAt` | Date | 创建时间 |
| `updatedAt` | Date | 更新时间 |

### 权限建议

- 客户端：只读权限，只能读取 `active` 和 `coming_soon` 状态的应用。
- 云函数：完全读写权限。

### seed 数据（由 `adminCore.initSchema` 写入）

```json
{
  "appKey": "demo_sum",
  "name": "积分示例工具",
  "description": "输入两个数字求和，演示积分扣费链路",
  "entryPage": "/pages/tools/demo-sum/index",
  "cloudFunctionName": "demoSum",
  "status": "active",
  "pricing": { "mode": "fixed", "costPoints": 1 },
  "sortOrder": 1
}
```

## 5. app_usage_records

### 字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `userId` | string | 关联用户 |
| `appKey` | string | 关联应用 |
| `status` | string | `created` / `frozen` / `succeeded` / `failed` / `released` |
| `costPoints` | number | 消耗积分 |
| `freezeTransactionId` | string | 冻结流水 ID |
| `settleTransactionId` | string | 结算流水 ID |
| `releaseTransactionId` | string | 释放流水 ID |
| `inputSummary` | Object | 输入摘要 |
| `resultRef` | string | 结果引用（可选） |
| `errorCode` | string | 错误码（可选） |
| `errorMessage` | string | 错误信息（可选） |
| `startedAt` | Date | 开始时间 |
| `finishedAt` | Date | 结束时间 |

### 权限建议

- 客户端：无写权限，可只读自己的记录。
- 云函数：完全读写权限。

## 6. recharge_packages

### 字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `packageKey` | string | 充值包唯一标识 |
| `name` | string | 显示名称 |
| `amountFen` | number | 金额（分） |
| `basePoints` | number | 基础积分 |
| `bonusPoints` | number | 赠送积分 |
| `status` | string | `active` / `disabled` |
| `sortOrder` | number | 排序权重 |
| `createdAt` | Date | 创建时间 |
| `updatedAt` | Date | 更新时间 |

### 权限建议

- 客户端：只读 `active` 状态的充值包。
- 云函数：完全读写权限。

### seed 数据（由 `adminCore.initSchema` 写入）

```json
[
  {
    "packageKey": "pkg_6yuan",
    "name": "6元充值包",
    "amountFen": 600,
    "basePoints": 60,
    "bonusPoints": 0,
    "status": "active",
    "sortOrder": 1
  },
  {
    "packageKey": "pkg_30yuan",
    "name": "30元充值包",
    "amountFen": 3000,
    "basePoints": 300,
    "bonusPoints": 30,
    "status": "active",
    "sortOrder": 2
  }
]
```

## 7. payment_orders

### 字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `orderNo` | string | 订单编号 |
| `userId` | string | 下单用户 |
| `packageKey` | string | 关联充值包 |
| `amountFen` | number | 订单金额（分） |
| `pointsTotal` | number | 到账总积分 |
| `status` | string | `created` / `pending_pay` / `paid` / `closed` / `failed` / `refunded` |
| `provider` | string | `mock` / `wechat` |
| `providerTradeNo` | string | 第三方支付流水号 |
| `prepayInfo` | Object | 预支付信息 |
| `paidAt` | Date | 支付时间 |
| `closedAt` | Date | 关闭时间 |
| `idempotencyKey` | string | 幂等键 |
| `callbackDigest` | string | 回调摘要 |
| `createdAt` | Date | 创建时间 |
| `updatedAt` | Date | 更新时间 |

### 权限建议

- 客户端：无写权限，可只读自己的订单。
- 云函数：完全读写权限。

## 8. admin_audit_logs

### 字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `adminUserId` | string | 管理员用户 ID |
| `action` | string | 操作类型 |
| `targetCollection` | string | 目标集合 |
| `targetId` | string | 目标记录 ID |
| `beforeSummary` | Object | 变更前摘要 |
| `afterSummary` | Object | 变更后摘要 |
| `requestId` | string | 请求 ID |
| `createdAt` | Date | 创建时间 |

### 权限建议

- 客户端：无权限。
- 云函数：完全读写权限（仅管理员接口写入）。

## 9. system_configs

### 字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `key` | string | 配置键 |
| `value` | any | 配置值 |
| `description` | string | 配置说明 |
| `updatedAt` | Date | 更新时间 |

### 权限建议

- 客户端：无权限。
- 云函数：完全读写权限。

### seed 数据（由 `adminCore.initSchema` 写入）

```json
[
  {
    "key": "payment_provider",
    "value": "mock",
    "description": "支付提供商: mock 或 wechat"
  },
  {
    "key": "mock_payment_enabled",
    "value": true,
    "description": "是否启用模拟支付（仅开发测试环境）"
  }
]
```

## 手工创建步骤

若当前环境无法通过脚本自动创建集合，请按以下步骤操作：

1. 打开微信开发者工具，进入「云开发」控制台。
2. 在「数据库」面板中，依次点击「添加集合」。
3. 按上表创建 9 个集合。
4. 为每个集合设置权限：
   - `apps`、`recharge_packages`：可设置「所有用户可读，仅创建者可写」或「所有用户可读，仅管理端可写」。
   - 其余集合（`users`、`point_accounts`、`point_transactions`、`app_usage_records`、`payment_orders`、`admin_audit_logs`、`system_configs`）：建议设置为「仅管理端可读写」，所有客户端写操作必须走云函数。
5. 创建完成后，部署 `coreUser`、`coreApp`、`adminCore` 云函数。
6. 调用 `adminCore.initSchema` 写入 seed 数据。
