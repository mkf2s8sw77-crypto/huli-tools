# LLM Prompt huli-tools Phase 3/5

## 阶段目标

实现固定充值包和支付订单底座：用户可查询上架充值包、创建订单、通过 mock 支付完成到账；真实微信支付只做安全的可插拔预留和配置缺失提示。Phase 3 完成后，应能验证“选择固定充值包 -> 创建订单 -> mock 支付成功 -> 积分到账 -> 重复回调不重复到账”。

## 本阶段输入

- 必读总文档：`/Users/huli-dev/Documents/huli-tools/promptDocs/prompt-pack-huli-tools-0526/master_spec_huli-tools_0526.md`
- 可参考测试文档：`/Users/huli-dev/Documents/huli-tools/promptDocs/prompt-pack-huli-tools-0526/test_case_huli-tools_0526.md`
- 已完成前序阶段：Phase 1/2 的 seed、用户账户、积分 helper、流水和 idempotency 规则。

## 任务清单

1. 新增 `corePayment`：
   - `listPackages`：返回 `recharge_packages` 中 `status = active` 的固定充值包。
   - `createOrder`：按 `packageKey` 创建 `payment_orders`，金额和积分只能来自服务端套餐配置。
   - `listOrders`：分页返回当前用户订单。
   - `mockPayOrder`：开发/测试支付成功，触发积分到账。
   - `handlePayCallback`：真实微信支付回调入口预留，变量不足时返回配置错误，不做假成功。
2. 订单状态机：
   - 新订单状态为 `created` 或 `pending_pay`。
   - mock/真实支付成功后变为 `paid`，并调用 Phase 2 的 `creditPoints` 写 `recharge` 流水。
   - 已 `paid` 订单再次处理必须幂等，不得重复增加积分。
   - 支持关闭未支付订单，状态变为 `closed`。
3. 支付 provider 抽象：
   - 默认 `PAYMENT_PROVIDER=mock`。
   - 当 `PAYMENT_PROVIDER=wechat` 但缺少微信支付变量时，创建订单可返回 `PAYMENT_NOT_CONFIGURED` 或明确的配置缺失列表。
   - 不把任何商户密钥写入仓库。
4. seed 与配置：
   - 确保 `adminCore.initSchema` 能 seed 至少两个固定充值包，例如 6 元和 30 元。
   - `system_configs` 中记录 mock 支付是否允许，但敏感配置仍来自环境变量。
5. 文档更新：
   - 更新 `docs/dev_setup.md` 或新增 `docs/payment_setup.md`，写明 mock 支付、真实支付变量、回调限制和上线前检查项。

## 范围边界

要做：

- 固定充值包、订单、mock 支付到账、真实支付预留、订单幂等。

不要做：

- 不实现自定义金额充值。
- 不实现退款闭环，只保留 `refunded` 状态和未来扩展说明。
- 不承诺真实微信支付在没有商户变量时可用。
- 不做复杂支付 UI，Phase 4 会完善页面。

## 实现约束

- 订单号必须服务端生成，建议包含时间戳和随机片段，不能由客户端传入。
- 到账积分为 `basePoints + bonusPoints`，必须来自 `recharge_packages`。
- `mockPayOrder` 只能处理当前用户自己的订单；如管理员代操作，必须通过管理员校验。
- `callbackDigest` 只能保存必要摘要，不保存敏感完整回调密钥。
- 所有错误码使用稳定英文常量，例如 `PACKAGE_NOT_FOUND`、`ORDER_NOT_FOUND`、`ORDER_ALREADY_PAID`、`PAYMENT_NOT_CONFIGURED`。

## 验证要求

至少运行：

```bash
bash scripts/check-js.sh
git diff --check
```

手工/半自动验证：

- `corePayment.listPackages` 返回 seed 充值包。
- 创建 6 元充值订单后，订单金额、积分、用户都来自服务端数据。
- 调用 `mockPayOrder` 后订单变为 `paid`，积分余额增加，流水包含 `recharge`。
- 对同一个订单重复调用 `mockPayOrder`，积分不重复增加。
- 设置 `PAYMENT_PROVIDER=wechat` 且不配置商户变量时，接口返回明确配置错误。

## 交接说明

Phase 3 交给 Phase 4 的成果：

- 前端可直接调用的套餐列表、创建订单、模拟支付、订单列表接口。
- 充值到账和积分流水已打通。

剩余风险：

- 真实微信支付需要用户提供商户号、证书和回调域名，首版默认不阻塞 mock 验收。
