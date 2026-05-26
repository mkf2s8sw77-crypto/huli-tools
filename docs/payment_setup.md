# 支付配置说明

## 概述

huli-tools 支持两种支付模式：

- **mock 支付**（默认）：开发/测试环境使用，模拟支付成功并即时到账。
- **微信支付**：真实线上支付，需配置商户号、证书和回调地址。

## Mock 支付（开发测试）

### 启用条件

1. 云函数环境变量 `PAYMENT_PROVIDER=mock`
2. 云函数环境变量 `MOCK_PAYMENT_ENABLED=true`
3. 云函数环境变量 `INTERNAL_API_SECRET` 已在 `corePayment` 和 `corePoints` 中配置为同一个随机字符串

### 使用方式

前端调用 `corePayment.createOrder` 创建订单后，调用 `corePayment.mockPayOrder` 模拟支付成功。接口会自动：

- 将订单状态更新为 `paid`
- 调用 `corePoints.creditPoints` 增加用户积分
- 写入 `recharge` 类型积分流水

### 权限边界

- `mockPayOrder` 只能操作当前用户自己的订单。
- 管理员可通过 `asAdmin=true` 参数代操作，但调用者必须是 `ADMIN_OPENIDS` 白名单中的管理员。
- 生产环境务必关闭：`MOCK_PAYMENT_ENABLED=false`。
- 不允许依赖默认内部凭据；`INTERNAL_API_SECRET` 未配置时，模拟支付不会执行积分到账。

## 微信支付（真实线上）

### 必要配置

在云函数环境变量中配置以下全部字段：

| 变量名 | 说明 |
|---|---|
| `PAYMENT_PROVIDER` | 必须设置为 `wechat` |
| `WX_PAY_MCH_ID` | 微信支付商户号 |
| `WX_PAY_APPID` | 微信支付 APPID（通常与小程序 APPID 一致） |
| `WX_PAY_API_V3_KEY` | API v3 密钥 |
| `WX_PAY_SERIAL_NO` | 商户证书序列号 |
| `WX_PAY_PRIVATE_KEY` | 商户私钥（PEM 格式，可换行） |
| `WX_PAY_NOTIFY_URL` | 支付结果通知 URL |

### 配置缺失行为

当 `PAYMENT_PROVIDER=wechat` 但上述变量不完整时：

- `corePayment.createOrder` 返回 `PAYMENT_NOT_CONFIGURED`，并列出具体缺失的变量名。
- `corePayment.handlePayCallback` 同样返回配置错误，不做任何假成功处理。

### 回调限制

- `handlePayCallback` 当前为预留结构，尚未实现完整的验签与解密逻辑。
- 接入真实微信支付前，需补充：
  1. 微信支付平台证书获取与缓存。
  2. 回调通知的签名验证和 AES-GCM 解密。
  3. 对同一笔通知的幂等处理（已 `paid` 订单不再重复到账）。
- 回调地址必须是公网可访问的 HTTPS 地址，且已在微信支付商户平台配置。

## 订单状态机

```
created / pending_pay
      |
      | 支付成功
      v
    paid
      |
      | 关闭（未支付时）
      v
   closed
      |
      | 退款（未来扩展）
      v
  refunded
```

- 已 `paid` 订单再次调用支付处理必须幂等，积分不重复增加。
- 已 `closed` 或 `refunded` 订单不能重新支付。

## 上线前检查项

- [ ] `MOCK_PAYMENT_ENABLED` 已设为 `false`。
- [ ] `PAYMENT_PROVIDER` 已设为 `wechat`（如需真实支付）。
- [ ] 微信支付环境变量已全部配置且值正确。
- [ ] 商户号、证书序列号、私钥与微信支付商户后台一致。
- [ ] 回调通知 URL 已在外网可访问，且已在商户平台配置。
- [ ] 云函数 `corePayment` 已部署最新版本。
- [ ] 数据库集合 `payment_orders` 已创建并设置正确权限。
