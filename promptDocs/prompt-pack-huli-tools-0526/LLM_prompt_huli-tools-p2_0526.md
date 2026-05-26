# LLM Prompt huli-tools Phase 2/5

## 阶段目标

实现共享积分账本和应用使用记录的核心闭环：余额查询、流水分页、冻结积分、成功结算、失败释放，以及一个可扣费的示例工具后端。Phase 2 完成后，应能通过云函数验证“创建使用记录 -> 冻结 1 积分 -> 示例工具成功 -> 结算流水”。

## 本阶段输入

- 必读总文档：`/Users/huli-dev/Documents/huli-tools/promptDocs/prompt-pack-huli-tools-0526/master_spec_huli-tools_0526.md`
- 可参考测试文档：`/Users/huli-dev/Documents/huli-tools/promptDocs/prompt-pack-huli-tools-0526/test_case_huli-tools_0526.md`
- 已完成前序阶段：Phase 1 的集合契约、`coreUser`、`coreApp.listApps`、`adminCore.initSchema`、`scripts/check-js.sh`。
- 如果 Phase 1 记录了集合无法自动创建，先按 `docs/cloud_collections.md` 完成集合创建再继续。

## 任务清单

1. 新增或扩展 `corePoints`：
   - `getBalance`：返回当前用户 `availablePoints`、`frozenPoints`。
   - `listTransactions`：分页返回当前用户积分流水。
   - 内部 helper：`freezePoints`、`settleFrozenPoints`、`releaseFrozenPoints`、`creditPoints`、`adminAdjustPoints`。
   - 所有 helper 必须写 `point_transactions`，并使用 `idempotencyKey` 防重复。
2. 扩展 `coreApp`：
   - `createUsage`：校验应用存在且 `active`，按 `apps.pricing.costPoints` 冻结积分，创建 `app_usage_records`。
   - `finishUsage`：仅允许当前用户自己的 usage 或受信业务云函数上下文完成；结算冻结积分，写成功状态。
   - `failUsage`：释放冻结积分，写失败状态。
   - 对余额不足返回 `BALANCE_NOT_ENOUGH`。
3. 示例工具后端：
   - 保留 `sum` 或新增 `demoSum`，但必须接入 usage 协议。
   - 输入两个数字，成功返回和；成功时触发 `finishUsage`，失败时触发 `failUsage`。
   - 如果直接从客户端调用示例工具，需要先由客户端拿到 `usageId`，示例工具必须校验 usage 属于当前用户且状态可执行。
4. 数据一致性：
   - 余额变化必须同时更新 `point_accounts` 并写不可变流水。
   - 结算/释放只能处理 `frozen` 状态 usage，重复调用必须幂等返回已有结果或明确 `USAGE_ALREADY_FINISHED`。
   - 余额不足时不得创建成功的冻结流水。
5. 开发 seed：
   - 在 `adminCore` 增加仅管理员可用的开发调试动作，为指定当前用户或 openid 增加测试积分，写审计日志或预留给 Phase 5 完善。

## 范围边界

要做：

- 共享积分账本、流水、冻结/结算/释放、示例工具扣费闭环。

不要做：

- 不实现充值订单和支付回调，这属于 Phase 3。
- 不做完整前端页面，这属于 Phase 4；只需要保留足够的调用入口或临时按钮便于验证。
- 不做复杂并发事务库；但必须尽量使用数据库原子更新能力，并通过状态/idempotency 降低重复调用风险。

## 实现约束

- 普通客户端不能指定扣费积分数，必须由服务端读取 `apps.pricing`。
- 积分流水 `type` 建议至少支持：`freeze`、`settle`、`release`、`recharge`、`admin_adjust`。
- `point_accounts.availablePoints` 不得小于 0，`frozenPoints` 不得小于 0。
- 所有 usage 状态迁移必须写 `updatedAt/finishedAt`。
- 示例工具输入摘要只保存必要信息，不保存敏感原始内容。

## 验证要求

至少运行：

```bash
bash scripts/check-js.sh
git diff --check
```

手工/半自动验证：

- 给测试用户增加 10 积分后，调用 `corePoints.getBalance` 显示可用积分为 10。
- 调用 `coreApp.createUsage` 执行 `demo_sum`，可用积分减少 1、冻结积分增加 1。
- 示例工具成功后，冻结积分归 0，`totalConsumedPoints` 增加 1，流水包含 `freeze` 和 `settle`。
- 模拟业务失败后，冻结积分释放，可用积分恢复，流水包含 `freeze` 和 `release`。
- 余额为 0 时调用付费应用返回 `BALANCE_NOT_ENOUGH`。

## 交接说明

Phase 2 交给 Phase 3/4 的成果：

- 稳定的余额查询和流水查询接口。
- 应用使用记录状态机。
- 可被前端演示的示例工具扣费闭环。

剩余风险：

- 充值到账入口只预留 helper，真实来源由 Phase 3 的支付订单驱动。
