# CloudBase Collections 契约文档

> 本文档描述 `huli-tools` 公共集合、已启用应用私有集合的字段、权限建议、seed 数据及手工创建步骤。
> 若 CloudBase MCP/CLI 无法自动创建集合，请按以下清单在微信开发者工具云开发控制台手工创建。

## 集合清单

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
| `model_providers` | 大模型提供方注册表（coreModel 网关） | 是（模型网关启用时） |
| `app_model_bindings` | 应用 ↔ 模型绑定与 fallback 链 | 是（模型网关启用时） |
| `model_async_jobs` | coreModel 长耗时文本任务（异步 Job，24h 过期） | 是（模型网关启用时） |
| `app_ai_draw_tasks` | 护士职业定妆照任务与 usage/job 绑定 | 是（护士定妆照应用启用时） |
| `app_nursing_undercover_sessions` | 谁是卧底（护理版）对局数据 | 是（谁是卧底应用启用时） |
| `app_maic_tasks` | MAIC usage、队列状态、租约与结算协调 | 是（MAIC 应用启用时） |
| `app_maic_courses` | MAIC 小程序课程元数据与协议版本 | 是（MAIC 应用启用时） |
| `app_maic_scenes` | MAIC 原生场景，按场景独立存储 | 是（MAIC 应用启用时） |
| `app_maic_progress` | 用户答题、互动、PBL 与播放位置 | 是（MAIC 应用启用时） |
| `app_maic_assets` | 既有课程 CloudBase 媒体资产、归属与校验和 | 是（兼容既有课程） |
| `app_maic_runtime` | Worker 全局单例租约 | 是（MAIC 应用启用时） |
| `app_maic_artifacts` | 已校验课程的短期导入暂存 | 是（MAIC 应用启用时） |

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
| `_id` | string | 必须与 `userId` 一致；`corePoints` 事务按该文档 ID 读写账户 |
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
| `_id` | string | 新流水使用 `idempotencyKey` 的哈希作为文档 ID，历史流水可能为自动 ID |
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
| `status` | string | `active` / `inactive` / `disabled` / `coming_soon` |
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
[
  {
    "appKey": "demo_sum",
    "name": "积分示例工具",
    "description": "输入两个数字求和，演示积分扣费链路",
    "entryPage": "/pages/tools/demo-sum/index",
    "cloudFunctionName": "demoSum",
    "status": "active",
    "pricing": { "mode": "fixed", "costPoints": 1 },
    "sortOrder": 1
  },
  {
    "appKey": "ai_draw",
    "name": "护士职业定妆照",
    "description": "上传本人形象照和参考图，生成护士职业标准照",
    "entryPage": "/pages/apps/ai_draw/index",
    "cloudFunctionName": "app_ai_draw",
    "status": "active",
    "pricing": { "mode": "fixed", "costPoints": 0 },
    "sortOrder": 2
  },
  {
    "appKey": "nursing_undercover",
    "name": "谁是卧底（护理版）",
    "description": "AI NPC 参与的护理教学卧底推理游戏，支持词语卧底和病例推理双模式",
    "entryPage": "/pages/apps/nursing_undercover/index",
    "cloudFunctionName": "app_nursing_undercover",
    "status": "active",
    "pricing": { "mode": "fixed", "costPoints": 0 },
    "sortOrder": 3
  },
  {
    "appKey": "maic",
    "name": "MAIC 智慧课堂",
    "description": "用 AI 生成可在微信小程序中原生阅读和互动的智慧课程",
    "entryPage": "/pages/apps/maic/index",
    "cloudFunctionName": "app_maic",
    "status": "active",
    "pricing": { "mode": "fixed", "costPoints": 0 },
    "sortOrder": 4
  }
]
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
| `productId` | string | 小程序虚拟支付道具 ID（mp 后台道具管理配置，虚拟支付充值包必填，可为空字符串） |
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

### 运行时配置数据

```json
[
  {
    "_id": "admin_web_auto_admins",
    "key": "admin_web_auto_admins",
    "value": ["cloudbase-auth-uid"],
    "description": "首次扫码自动准入的 Web 管理员 uid 列表"
  }
]
```

## 10. model_providers

大模型提供方注册表（coreModel 网关）。**密钥不进本集合**：`config.secretEnv` 只存环境变量名，密钥本体仅配置在 `coreModel` 云函数环境变量中。

### 字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | 自动生成 |
| `providerKey` | string | 唯一键，小写 snake_case，如 `minimax_default` |
| `displayName` | string | 展示名 |
| `type` | string | `text_chat` / `image_gen` / `audio_tts` |
| `driver` | string | `minimax` / `cloudbase_ai` / `kimi_code`；预留 `gpt_image_web` |
| `config` | object | `{ baseUrl?, model?, secretEnv?, temperature?, maxTokens?, timeoutMs? }`；禁止包含密钥字段（adminCore 写入时校验） |
| `enabled` | bool | 停用时 coreModel 跳过该 provider |
| `createdAt` / `updatedAt` | Date | 服务端时间 |

### 权限建议

- 客户端：无权限。
- 云函数：`coreModel` 只读（60s 内存缓存），`adminCore` 读写并写审计。

### seed 数据（由 `coreModel.seedDefaults` 幂等写入）

```json
[
  {
    "providerKey": "minimax_default",
    "displayName": "MiniMax（默认）",
    "type": "text_chat",
    "driver": "minimax",
    "config": { "baseUrl": "https://api.minimaxi.com/v1", "model": "MiniMax-M2.7", "secretEnv": "MINIMAX_API_KEY", "temperature": 0.35, "maxTokens": 12000, "timeoutMs": 240000 },
    "enabled": true
  },
  {
    "providerKey": "cloudbase_ai_default",
    "displayName": "CloudBase AI（默认）",
    "type": "text_chat",
    "driver": "cloudbase_ai",
    "config": { "model": "<CLOUDBASE_AI_MODEL 环境变量值，未配置则不创建该 provider>" },
    "enabled": true
  }
]
```

## 11. app_model_bindings

应用 ↔ 模型绑定。`_id` 固定为 `${appKey}__${capability}`，一个能力一条绑定。

### 字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | `${appKey}__${capability}`，如 `maic__course_generate` |
| `appKey` | string | 应用键 |
| `capability` | string | 能力键，如 `course_generate` / `npc_speech` / `npc_vote` / `debrief` |
| `providerKey` | string | 主模型提供方 |
| `fallbackProviderKeys` | string[] | 备用链；主 provider 限流/超时/5xx（transient）时按序切换，默认 `[]` |
| `paramOverrides` | object | 绑定级参数覆盖，仅 `model` / `temperature` / `maxTokens` / `timeoutMs` 可覆盖，默认 `{}` |
| `enabled` | bool | 停用时 coreModel 返回 `MODEL_BINDING_DISABLED` |
| `createdAt` / `updatedAt` | Date | 服务端时间 |

### 权限建议

- 客户端：无权限。
- 云函数：`coreModel` 只读，`adminCore` 读写并写审计。

### seed 数据（由 `coreModel.seedDefaults` 幂等写入）

```json
[
  { "_id": "maic__course_generate", "appKey": "maic", "capability": "course_generate", "providerKey": "minimax_default", "fallbackProviderKeys": [], "paramOverrides": {}, "enabled": true },
  { "_id": "nursing_undercover__npc_speech", "appKey": "nursing_undercover", "capability": "npc_speech", "providerKey": "cloudbase_ai_default", "fallbackProviderKeys": [], "paramOverrides": {}, "enabled": true },
  { "_id": "nursing_undercover__npc_vote", "appKey": "nursing_undercover", "capability": "npc_vote", "providerKey": "cloudbase_ai_default", "fallbackProviderKeys": [], "paramOverrides": {}, "enabled": true },
  { "_id": "nursing_undercover__debrief", "appKey": "nursing_undercover", "capability": "debrief", "providerKey": "cloudbase_ai_default", "fallbackProviderKeys": [], "paramOverrides": {}, "enabled": true }
]
```

（`nursing_undercover__*` 三条仅在 `CLOUDBASE_AI_MODEL` 已配置、cloudbase_ai_default provider 创建成功时写入。）

## 12. model_async_jobs

coreModel 长耗时文本任务（异步 Job）。函数间同步调用经 API 网关约 60s 即被切断，思考型模型（如 MiniMax M3）整课生成需 90s+，故长任务由 `createTextJob` 创建并经 coreModel 后台自调用 `runTextJob` 执行，调用方用 `getTextJob` 轮询结果。

### 字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | jobId（`mj_<时间戳>_<随机串>`） |
| `status` | string | `running` / `succeeded` / `failed` |
| `appKey` / `capability` | string | 应用键与能力键 |
| `messages` | array | 生成入参（chat messages） |
| `overrides` | object/null | 调用级参数覆盖 |
| `result` | object | 成功时写入 `{ text, usage, model, providerKey, attempts }`（`running` 期间该字段不存在） |
| `error` | object | 失败时写入 `{ code, message, transient?, attempts? }`（`running` 期间该字段不存在） |
| `createdAt` / `updatedAt` / `expiresAt` | Date | 服务端时间；`expiresAt` = 创建后 24h |

### 权限建议

- 客户端：无权限。
- 云函数：仅 `coreModel` 读写（内部 action 均校验 `_internalToken`）。

## 13. app_ai_draw_tasks

护士职业定妆照应用私有集合，用于把外部图片生成任务 `jobId` 绑定到当前用户的 `usageId`，防止跨应用 usage 复用、跨任务查询和重复结算；源素材只保存私有 Cloud Storage `fileID/cloudPath`，对外生成时由云函数换取短期临时 URL。

### 字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | 与 `usageId` 一致 |
| `userId` | string | 关联用户 |
| `usageId` | string | 关联 `app_usage_records._id` |
| `jobId` | string | 外部图片生成任务 ID |
| `mode` | string | 当前固定为 `nurse_portrait`，旧任务可为空 |
| `prompt` | string | 实际提交给上游的生成 prompt；旧任务为用户绘图描述 |
| `generatedPrompt` | string | 服务端组装后的正式 prompt |
| `subjectAsset` | Object | 主体形象照 `{ role, fileID, cloudPath, name }` |
| `referenceAssets` | Array | 参考图数组，可包含制服、背景、Logo、护士帽等素材 |
| `options` | Object | `{ composition, requirements }`，如 `half_body` / `full_body` / `id_photo` |
| `status` | string | `processing` / `succeeded` / `failed` / `cancelled` |
| `imageUrl` | string | 成功后的图片 URL |
| `images` | Array | 上游返回的生成图片摘要数组 |
| `errorCode` | string | 错误码（可选） |
| `errorMessage` | string | 错误信息（可选） |
| `expiresAt` | Date | 源素材短期保留到期时间，默认 7 天 |
| `assetCleanedAt` | Date | 源素材清理时间（可选） |
| `createdAt` | Date | 创建时间 |
| `updatedAt` | Date | 更新时间 |
| `finishedAt` | Date | 结束时间 |

### 权限建议

- 客户端：无直接读写权限。
- 云函数：仅 `app_ai_draw` 和管理员维护工具读写。

## 14. app_nursing_undercover_sessions

谁是卧底（护理版）应用私有集合，保存每局对局状态、发言、投票和复盘数据。

### 字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | 自动生成 |
| `userId` | string | 关联用户 OPENID |
| `usageId` | string | 关联 `app_usage_records._id` |
| `appKey` | string | 固定 `nursing_undercover` |
| `mode` | string | `word_undercover` / `case_reasoning` |
| `difficulty` | string | `student` / `new_nurse` / `specialist` |
| `scenarioKey` | string | 场景标识 |
| `scenarioTitle` | string | 场景标题 |
| `npcCount` | number | AI NPC 数量 |
| `roundCount` | number | 总轮数 |
| `currentRound` | number | 当前轮次 |
| `status` | string | `created` / `in_progress` / `voting` / `finished` / `cancelled` / `failed` |
| `roles` | Array | 角色列表（含 roleId, displayName, actorType, team, secretLabel） |
| `playerRoleId` | string | 固定 `player` |
| `undercoverRoleId` | string | 卧底角色 ID |
| `transcript` | Array | 发言记录（roundNo, roleId, text, createdAt） |
| `votes` | Array | 投票记录（roleId, targetRoleId, reason） |
| `result` | Object | 结果（winner, playerWon, votedOutRoleId, correctUndercoverRoleId） |
| `debrief` | Object | 复盘（summary, keyClues, knowledgePoints, safetyNotes） |
| `actionReceipts` | Array | 幂等操作收据 |
| `errorCode` | string | 错误码（可选） |
| `errorMessage` | string | 错误信息（可选） |
| `createdAt` | Date | 创建时间 |
| `updatedAt` | Date | 更新时间 |
| `finishedAt` | Date | 结束时间 |

### 权限建议

- 客户端：无直接读写权限。
- 云函数：仅 `app_nursing_undercover` 读写。

## 15. MAIC 私有集合

七个集合均设置为「仅管理端可读写」，客户端只能通过 `app_maic` action 访问。

| 集合 | 关键字段 | 推荐索引 |
|---|---|---|
| `app_maic_tasks` | `_id=usageId`、`userId`、废弃兼容字段 `jobId=""`、`status`、`nextAttemptAt`、`deadlineAt`、租约、`courseId` 与重试次数 | `status + nextAttemptAt`；`userId + createdAt(desc)` |
| `app_maic_courses` | `_id=usageId`、`userId`、`protocol`、标题摘要、`sceneCount`、`assetMap`、`status` | `userId + status + updatedAt(desc)` |
| `app_maic_scenes` | `userId`、`courseId`、`sceneId`、`order`、`kind`、完整 `scene` | `userId + courseId + order` |
| `app_maic_progress` | `userId`、`courseId`、`data`、`updatedAt` | `userId + courseId` |
| `app_maic_assets` | 既有资产的 `userId`、`courseId`、`assetId`、`fileID`、`checksumSha256`、`mimeType`；新课程首版不新增资产 | `userId + courseId` |
| `app_maic_runtime` | `_id=worker`、`leaseOwner`、`leaseExpiresAt`、`currentUsageId`、`requestId` | `_id` 单例即可 |
| `app_maic_artifacts` | `_id=usageId`、`userId`、已校验 `course`、模型、token 用量、纠错/兜底标记 | `_id`；终态及时删除 |

`usageId` 是端到端幂等键。新任务状态固定为 `queued → processing → importing → succeeded`，终态为 `failed`、`cancelled`、`timed_out`；`submit_pending` 只用于迁移旧任务。只有课程和场景全部导入完成后才能 `finishUsage`；失败、取消或超过 45 分钟必须 `failUsage`。

## 16. app_paper_polish_tasks

护理论文英文润色应用私有集合，保存每次润色任务的输入元数据、状态和结果；`_id` 与 `usageId` 一致，作为端到端幂等键。润色为异步任务模式：`submit` 建任务后由内部 `runTask` 后台执行模型调用，`query` 做轮询与 10 分钟 read-time 超时兜底。定价 0 积分，不涉及积分冻结。原始草稿（`inputText`）与成稿（`resultText`）仅存于本集合，客户端不回传原文；任务文档默认 7 天过期（`expiresAt`）。

### 字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | 与 `usageId` 一致 |
| `userId` | string | 关联用户 |
| `usageId` | string | 关联 `app_usage_records._id` |
| `status` | string | `processing` / `succeeded` / `failed` / `timed_out` |
| `inputText` | string | 用户提交的原始草稿（≤20000 字符） |
| `inputChars` | number | 草稿字符数 |
| `sections` | Array | 章节键数组（`abstract/intro/methods/results/discussion/conclusion/title`），空数组表示自动检测 |
| `language` | string | `en` / `zh-to-en`，由服务端按中文字符占比自动检测 |
| `resultText` | string | 润色成稿（成功后写入） |
| `summary` | Array | 改动要点（中文，成功后写入） |
| `degraded` | boolean | 模型输出未按 JSON 契约解析时为 `true`（成稿为原始输出） |
| `model` | string | 实际调用的模型名 |
| `providerKey` | string | 实际命中的模型提供方 |
| `usage` | Object | 模型 token 用量（可选） |
| `errorCode` | string | 错误码（可选）：`POLISH_EMPTY_INPUT` / `POLISH_INPUT_TOO_LONG` / `POLISH_SERVICE_UNAVAILABLE` / `POLISH_RATE_LIMITED` / `POLISH_FAILED` / `POLISH_OUTPUT_INVALID` / `POLISH_TIMED_OUT` |
| `errorMessage` | string | 错误信息（可选） |
| `expiresAt` | Date | 任务文档保留到期时间，默认 7 天 |
| `createdAt` | Date | 创建时间 |
| `updatedAt` | Date | 更新时间 |
| `finishedAt` | Date | 结束时间 |

### 权限建议

- 客户端：无直接读写权限。
- 云函数：仅 `app_paper_polish` 读写。

## 手工创建步骤

若当前环境无法通过脚本自动创建集合，请按以下步骤操作：

1. 打开微信开发者工具，进入「云开发」控制台。
2. 在「数据库」面板中，依次点击「添加集合」。
3. 按上表创建全部集合。
4. 为每个集合设置权限：
   - `apps`、`recharge_packages`：可设置「所有用户可读，仅创建者可写」或「所有用户可读，仅管理端可写」。
   - 其余集合（含全部 `app_maic_*`）：建议设置为「仅管理端可读写」，所有客户端写操作必须走云函数。
5. 创建完成后，部署公共函数（含 `coreModel`）及 `app_ai_draw`、`app_nursing_undercover`、`app_paper_polish`、`app_maic_worker`、`app_maic`、`app_maic_reconcile`；Worker 首次先不启用 timer，模型 smoke 成功后再创建每分钟触发器。
6. 调用 `adminCore.initSchema` 写入 seed 数据；再调用 `coreModel.seedDefaults`（内部 action，需 `_internalToken`）写入默认 provider 与应用绑定，最后在管理端「模型管理」做连通性测试。
