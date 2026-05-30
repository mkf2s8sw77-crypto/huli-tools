# LLM Prompt huli-tools-admin-web Phase 2/4

## 阶段目标

在 Phase 1 的 Web 管理员鉴权和只读 API 基础上，完成运营写操作与审计闭环。阶段完成后，Web 管理端所需的后端能力基本齐备：管理员可以安全调分、维护应用目录、维护充值包，所有写操作都有参数校验、幂等或审计记录。

## 本阶段输入

- 必读总文档：`/Users/huli-dev/Documents/huli-tools/promptDocs/prompt-pack-huli-tools-admin-web-0530/master_spec_huli-tools-admin-web_0530.md`
- 可参考测试文档：`/Users/huli-dev/Documents/huli-tools/promptDocs/prompt-pack-huli-tools-admin-web-0530/test_case_huli-tools-admin-web_0530.md`
- 前序成果：Phase 1 已完成的 `adminCore` Web 管理员鉴权和只读 action。
- 重点参考：
  - `cloudfunctions/adminCore/index.js`
  - `cloudfunctions/corePoints/index.js`
  - `docs/admin_operations.md`

## 任务清单

1. 审核并加固现有写操作。
   - `adjustPoints`：确认 Web 管理员也可调用；必须通过 `corePoints.adminAdjustPoints`，不能直接改账户。
   - `upsertApp`：确认参数校验覆盖 `appKey`、`entryPage`、`cloudFunctionName`、`status`、`pricing.costPoints`。
   - `upsertPackage`：确认金额和积分均为整数，状态只能是 `active` / `disabled`。

2. 补齐写操作审计。
   - 所有写操作必须写 `admin_audit_logs`。
   - 审计 `adminUserId` 使用统一身份：Web 使用 `web:<uid>` 或等价可区分格式，小程序使用 `openid`。
   - `beforeSummary` / `afterSummary` 保持可读 JSON 字符串或对象序列化，不写敏感密钥。

3. 为管理端补充必要的读写组合接口。
   - `getAppForEdit` 或让 `listApps` 返回编辑需要的字段。
   - `getPackageForEdit` 或让 `listPackages` 返回编辑需要的字段。
   - `adjustPoints` 返回调整后的余额和流水 ID，便于 UI 刷新。

4. 增强测试脚本/文档。
   - 增加调分、应用更新、充值包更新的 smoke 说明或脚本。
   - 覆盖重复 `idempotencyKey`、非法负数余额、非法金额、非法状态。

5. 更新文档。
   - `docs/admin_operations.md` 写清 Web 管理端能调用哪些写操作、参数、错误码、审计行为。
   - 若新增 action，更新 `docs/CODE_WIKI.md`。

## 范围边界

- 要做：管理写操作的后端能力和文档。
- 不要做：Web 前端页面实现。
- 不要做：删除用户、删除流水、删除订单、直接改订单状态、退款。
- 不要做：把 `INTERNAL_API_SECRET` 给 Web 使用。

## 实现约束

- 写操作必须先鉴权，再校验参数，再执行变更，再写审计。
- 积分调增/调减必须继续通过 `corePoints` 事务链路。
- 任何失败路径都要返回稳定错误码，不得静默吞异常。
- 调分减少可用积分时，不能让用户可用积分变负。
- 已有小程序管理调用不能被破坏。

## 验证要求

至少运行：

```bash
bash scripts/check-js.sh
bash scripts/check-boundaries.sh
git diff --check
```

人工/脚本验证：

- 管理员调分成功后，`point_accounts`、`point_transactions`、`admin_audit_logs` 一致。
- 重复同一 `idempotencyKey` 不重复调分。
- 非管理员调分、编辑应用、编辑充值包均被拒绝。
- 非法 `pricing`、非法 `amountFen`、非法 `status` 返回 `INVALID_PARAM`。

## 交接说明

- 给 Phase 3：交接 Web 前端可调用的完整 action 清单、参数结构和返回结构。
- 剩余风险：真实生产环境调分需谨慎；如未连接真实云环境验证，要在交接中标明仅完成本地/控制台结构验证。
