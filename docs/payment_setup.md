# 支付配置说明

## 概述

huli-tools 支持三种支付模式：

- **mock 支付**（默认）：开发/测试环境使用，模拟支付成功并即时到账。
- **小程序虚拟支付**（`PAYMENT_PROVIDER=virtual`）：线上售卖虚拟商品（积分）的官方合规链路，iOS/安卓均适用。
- **微信支付商户号**（`PAYMENT_PROVIDER=wechat`）：预留模式，回调尚未实现，iOS 售卖虚拟商品存在审核风险，不建议使用。

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

## 小程序虚拟支付（线上推荐）

适用于在小程序内售卖积分等虚拟商品，iOS/安卓均为官方合规路径。mp 后台「虚拟支付」开通商户号后接入。

### 必要配置

| 变量名 | 说明 |
|---|---|
| `PAYMENT_PROVIDER` | 必须设置为 `virtual` |
| `VIRTUAL_PAY_OFFER_ID` | mp 后台虚拟支付 → 基础配置中的 offerId |
| `VIRTUAL_PAY_APP_KEY` | 现网 AppKey（env=0 时使用） |
| `VIRTUAL_PAY_APP_KEY_SANDBOX` | 沙箱 AppKey（env=1 时使用） |
| `VIRTUAL_PAY_ENV` | `0`=现网，`1`=沙箱 |
| `WX_MINIPROGRAM_APPSECRET` | 小程序 AppSecret（code2session 换 session_key 及获取 access_token 用） |
| `INTERNAL_API_SECRET` | 与 `corePoints` 一致的内部调用凭据 |

AppSecret、AppKey 均为高敏感凭据，只允许放在云函数环境变量，禁止写入代码或提交 Git。

### 充值包与道具对应关系

- `recharge_packages.productId` 必须与 mp 后台「道具管理」中**已发布**的道具 ID 一致，价格（分）也需一致。
- 管理端「充值包管理」可维护 productId。

### 支付链路

1. 前端 `wx.login` 拿 code，调 `corePayment.createVirtualOrder`（创建订单 + code2session + 服务端签名）。
2. 前端调 `wx.requestVirtualPayment`（mode=`short_series_goods`）。
3. 到账双通道（幂等，积分不会重复到账）：
   - **主动查单**：前端支付成功后调 `corePayment.confirmVirtualOrder`，服务端走 `/xpay/query_order` 核实支付状态后到账，并对未发货订单调 `/xpay/notify_provide_goods` 同步发货状态。
   - **发货推送**：云开发控制台配置消息推送，事件 `xpay_goods_deliver_notify` 推送到 `corePayment` 云函数，函数验单后到账并回包 `{"ErrCode":0,"ErrMsg":"success"}`。
4. 前端可轮询 `corePayment.getOrder` 查看订单状态。

### 消息推送配置（发货推送）

在微信开发者工具或云开发控制台配置：

1. 云开发 → 设置 → 其他设置 → 消息推送，模式选「云函数」。
2. 添加配置：消息类型 `event`，事件类型 `xpay_goods_deliver_notify`，环境选本环境，云函数选 `corePayment`。
3. mp 后台虚拟支付 → 道具管理中确认「发货推送」已开启。

### 沙箱联调

- `VIRTUAL_PAY_ENV=1` + 沙箱 AppKey；注意 **iOS 端不支持沙箱**（env 必须为 0，否则报 -15011），沙箱联调请在安卓/开发者工具进行。
- 道具需在 mp 后台发布到对应环境，发布后约 10 分钟生效。

## 微信支付商户号（预留，不推荐）

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
- [ ] `PAYMENT_PROVIDER` 已设为 `virtual`。
- [ ] `VIRTUAL_PAY_OFFER_ID` / `VIRTUAL_PAY_APP_KEY` / `WX_MINIPROGRAM_APPSECRET` 已配置且为现网值（非沙箱）。
- [ ] `VIRTUAL_PAY_ENV=0`。
- [ ] 每个上架充值包的 `productId` 与 mp 后台已发布道具一致，价格一致。
- [ ] 云开发消息推送已配置 `xpay_goods_deliver_notify` → `corePayment`。
- [ ] 云函数 `corePayment` 已部署最新版本。
- [ ] 数据库集合 `payment_orders` 已创建并设置正确权限。
