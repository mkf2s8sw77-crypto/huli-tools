# 应用接入边界与底座治理

> 本文档面向所有后续开发者（含 coding Agent），描述公共底座、接入层、业务应用三层边界和新应用接入流程。

## 1. 三层架构边界

```
┌─────────────────────────────────────────────┐
│  业务应用私有层                                │
│  页面: miniprogram/pages/apps/<appKey>/...    │
│  云函数: app_<appKey>                         │
│  私有集合: app_<appKey>_*                     │
├─────────────────────────────────────────────┤
│  接入层（公共 API）                            │
│  前端: miniprogram/services/api.js            │
│  云函数 action: coreApp.createUsage /         │
│    finishUsage / failUsage                    │
│  统一扣积分 + 使用记录                         │
├─────────────────────────────────────────────┤
│  公共底座层                                    │
│  云函数: coreUser / coreApp / corePoints /    │
│    corePayment / adminCore                    │
│  公共集合: users / point_accounts /            │
│    point_transactions / apps /                │
│    app_usage_records / recharge_packages /     │
│    payment_orders / admin_audit_logs /         │
│    system_configs                              │
└─────────────────────────────────────────────┘
```

### 1.1 公共底座层

提供用户账户、积分账本、充值支付、应用目录、使用记录、管理员审计等能力。**只有公共云函数（`coreUser`、`coreApp`、`corePoints`、`corePayment`、`adminCore`）才能直接写公共集合。** 应用云函数仅允许只读当前 `usageId` 对应的 `app_usage_records`，用于校验归属和执行状态。

### 1.2 接入层

对外暴露统一调用入口：

- 前端通过 `miniprogram/services/api.js` 调用 `createUsage` 创建使用记录并冻结积分。
- 应用云函数通过 `cloud.callFunction({ name: "coreApp", ... })` 回调 `finishUsage` / `failUsage`，需传 `_internalToken`。

### 1.3 业务应用私有层

每个应用拥有自己的页面、云函数和私有集合。应用不得绕过接入层直接写公共底座集合。

## 2. 命名规范

| 资源 | 规则 | 示例 |
|---|---|---|
| `appKey` | 小写 snake_case | `demo_sum`、`ai_writer` |
| 前端页面目录 | `miniprogram/pages/apps/<appKey>/` | `miniprogram/pages/apps/ai_writer/` |
| 应用云函数 | `app_<appKey>` | `app_ai_writer` |
| 私有集合 | `app_<appKey>_<业务名>` | `app_ai_writer_drafts` |

> 注：历史遗留的 `demoSum` 云函数和 `miniprogram/pages/tools/demo-sum/` 页面在此规范之前已存在，不做强制改名，但新应用必须遵循新规范。

## 3. 新应用接入流程

### 3.1 注册应用

管理员调用 `adminCore.upsertApp` 在 `apps` 集合中注册新应用：

```js
{
  appKey: "my_app",
  name: "我的应用",
  description: "应用描述",
  entryPage: "/pages/apps/my_app/index",
  cloudFunctionName: "app_my_app",
  status: "active",
  pricing: { mode: "fixed", costPoints: 5 },
  sortOrder: 10
}
```

### 3.2 创建应用云函数

从模板 `templates/app_vertical_slice/` 复制并重命名：

1. 将 `cloudfunctions/app___appKey__/` 复制为 `cloudfunctions/app_my_app/`。
2. 全局替换 `__appKey__` 为 `my_app`。
3. 在 `index.js` 中实现业务逻辑。

### 3.3 创建应用页面

从模板复制并重命名：

1. 将 `templates/app_vertical_slice/miniprogram/pages/apps/__appKey__/` 复制为 `miniprogram/pages/apps/my_app/`。
2. 全局替换 `__appKey__` 为 `my_app`。
3. 在 `miniprogram/app.json` 的 `pages` 数组中注册页面路径。

### 3.4 积分扣费链路

应用必须通过以下步骤使用积分，不得自行修改 `point_accounts`：

1. **前端** 调用 `api.createUsage(appKey, inputSummary)` → 获得 `usageId`。
2. **前端** 将 `usageId` 和业务参数传给应用云函数。
3. **应用云函数** 执行业务逻辑。
4. **应用云函数** 成功时调用 `coreApp.finishUsage`，失败时调用 `coreApp.failUsage`。
5. 冻结/结算/释放积分由公共底座自动完成。

异步或长任务应用必须额外建立私有任务集合，把 `usageId`、当前用户、外部任务 ID 和任务状态绑定在一起。查询、取消、重试等后续 action 必须同时校验 `usageId` 与任务 ID，不能只相信客户端传入的任务 ID；任务失败或超时时必须释放冻结积分。

### 3.5 私有数据存储

如需保存业务数据，只写自己的 `app_<appKey>_*` 集合。在云开发控制台手动创建集合后即可使用。

### 3.6 更新文档

新增应用后必须同步更新：

- `docs/cloud_collections.md`：如有新增私有集合，追加说明。
- `promptDocs/prompt-pack-huli-tools-0526/test_case_huli-tools_0526.md`：增加应用冒烟用例。
- `run_manifest_huli-tools_0526.toml`：如有新 phase，追加描述。

## 4. 禁止事项

### 4.1 客户端禁止

- **禁止** 客户端直接引用公共敏感集合（`users`、`point_accounts`、`point_transactions`、`apps`、`app_usage_records`、`recharge_packages`、`payment_orders`、`admin_audit_logs`、`system_configs`），读写都应通过云函数。
- **禁止** 客户端直接调用 `corePoints` 的内部 action：`freezePoints`、`settleFrozenPoints`、`releaseFrozenPoints`、`creditPoints`、`adminAdjustPoints`。
- **禁止** 客户端直接调用 `coreApp.finishUsage` / `coreApp.failUsage`；业务成功或失败只能由应用云函数回调。
- **禁止** 客户端传入 `openid`、`userId`、角色、价格、积分数量作为可信数据。

### 4.2 应用云函数禁止

- **禁止** 应用云函数直接写任何公共集合。
- **禁止** 应用云函数直接引用 `users`、`point_accounts`、`point_transactions`、`apps`、`recharge_packages`、`payment_orders`、`admin_audit_logs`、`system_configs`；如需这些数据，必须通过公共云函数。
- **允许** 应用云函数只读当前 `usageId` 对应的 `app_usage_records`，用于校验 `userId`、`appKey` 和状态。
- **禁止** 在公共集合中追加业务应用私有字段。
- **禁止** 绕过 `coreApp.finishUsage` / `failUsage` 自行结算积分。

### 4.3 集合命名禁止

- **禁止** 业务应用使用不带 `app_<appKey>_` 前缀的私有集合名。

## 5. 公共底座升级规则

### 5.1 默认向后兼容

公共 action 新增字段时，原有调用方不传该字段应有合理默认行为。

### 5.2 破坏性变更必须走 RFC

如需删除/重命名 action、修改返回结构、修改集合 schema，必须先提交 RFC 文档（模板见 `docs/templates/core_change_rfc.md`），并在 RFC 中说明：

- 影响范围（哪些应用受影响）。
- 数据迁移方案。
- 回滚方案。

### 5.3 安全相关变更

涉及 `_internalToken` 校验逻辑、权限模型或支付链路的变更，必须 RFC + 人工 review。

## 6. 自动化边界检查

每次提交前运行：

```bash
bash scripts/check-boundaries.sh
```

脚本会启发式扫描越界调用和危险写法，包括客户端引用敏感公共集合、客户端调用内部 action、应用云函数越权引用公共集合、私有 collection 前缀错误和客户端数据库写操作。详见脚本内注释。
