# LLM Prompt huli-tools Phase 5/5

## 阶段目标

完成公共底座的上线前收口：管理员接口、审计日志、权限硬化、幂等复核、测试文档更新、运行 manifest 更新和最终交接说明。Phase 5 完成后，项目应具备一个可继续扩展新工具的稳定底座，并且 coding Agent 能清楚说明哪些能力已自动验证、哪些需要微信开发者工具/云环境人工确认。

## 本阶段输入

- 必读总文档：`/Users/huli-dev/Documents/huli-tools/promptDocs/prompt-pack-huli-tools-0526/master_spec_huli-tools_0526.md`
- 可参考测试文档：`/Users/huli-dev/Documents/huli-tools/promptDocs/prompt-pack-huli-tools-0526/test_case_huli-tools_0526.md`
- 已完成前序阶段：Phase 1-4 的用户、应用、积分、支付和前端页面。

## 任务清单

1. 完善 `adminCore`：
   - `upsertApp`：新增/更新应用目录，校验 `appKey`、`entryPage`、`pricing`、`status`。
   - `upsertPackage`：新增/更新固定充值包，校验金额和积分均为正整数。
   - `adjustPoints`：管理员手动增减积分，必须写流水和审计，不能让余额变负。
   - `listAuditLogs`：分页查看审计日志。
   - 所有 action 必须校验管理员 openid；未配置 `ADMIN_OPENIDS` 时拒绝管理操作。
2. 权限与安全复核：
   - 普通用户不得调用管理员 action。
   - 普通用户只能查询自己的订单、流水、使用记录。
   - 前端传入 openid、积分数量、订单金额、应用价格时，服务端必须忽略或拒绝。
   - mock 支付能力必须受 `MOCK_PAYMENT_ENABLED` 控制，并在文档中标记不可用于生产。
3. 幂等与状态机复核：
   - 重复 bootstrap 不重置余额。
   - 重复支付回调不重复到账。
   - 重复 finish/fail usage 不重复结算或释放。
   - 失败路径有稳定错误码。
4. 测试和文档收口：
   - 更新 `test_case_huli-tools_0526.md`，使其与最终页面、云函数和 seed/reset 命令一致。
   - 更新 `run_manifest_huli-tools_0526.toml`，加入实际可运行 gate 命令。
   - 更新或新增 `docs/dev_setup.md`、`docs/cloud_collections.md`、`docs/payment_setup.md`、`docs/admin_operations.md`。
   - 如新增了重要长期约束，可创建或更新根目录 `AGENTS.md`，但保持简洁，不写阶段流水账。
5. 最终验收：
   - 运行所有静态 gate。
   - 按测试文档完成一轮完整人工冒烟。
   - 整理最终交接说明，列出真实支付、真实 appid、管理员 openid 等仍需用户配置的项。

## 范围边界

要做：

- 管理云函数、审计、安全加固、文档和验收闭环。

不要做：

- 不额外开发完整后台管理页面。
- 不接入真实微信支付证书，除非用户已提供完整安全变量和测试商户环境。
- 不实现新的业务工具。
- 不做大规模视觉重构。

## 实现约束

- 管理操作必须写 `admin_audit_logs`，至少包含操作者、动作、目标、变更摘要、时间。
- `adjustPoints` 必须走与充值/消费同一套积分流水模型。
- 文档中的命令必须能在当前仓库路径下解析；不能写不存在的命令作为 gate。
- 如果新增根 `AGENTS.md`，控制在 200 行以内，只写长期工程规则。

## 验证要求

至少运行：

```bash
bash scripts/check-js.sh
git diff --check
git status --short --branch
```

人工/半自动验证：

- 非管理员调用 `adminCore.upsertApp` 返回权限错误。
- 管理员新增一个 `coming_soon` 应用，首页展示但不可进入。
- 管理员手动加积分后，余额增加，流水和审计均存在。
- 重复 mock 支付同一订单不重复到账。
- 重复完成同一 usage 不重复扣费。
- 测试文档中的所有冒烟用例能按步骤执行。

## 交接说明

最终交付必须包含：

- 已实现能力摘要。
- 实际新增/修改的云函数、页面、collection 文档和脚本。
- 已运行的命令和结果。
- 需要用户在微信开发者工具/云开发控制台配置的事项。
- 未接真实微信支付的原因和后续接入步骤。
