# 开发环境配置说明

## 前置要求

- 微信开发者工具（最新稳定版）
- Node.js 16+（用于本地静态检查）
- 已开通微信云开发的环境

## 云环境 ID

项目使用的云环境 ID：`cloudbase-3gphz7fk0fe1b760`

已在 `miniprogram/app.js` 中硬编码，保持此值即可。

## 微信开发者工具配置

1. 用微信开发者工具打开项目根目录 `/Users/huli-dev/Documents/huli-tools`。
2. 在 `project.config.json` 中，将 `appid` 从 `wx_appid_placeholder` 替换为真实小程序 APPID。
3. 确保「云开发」已初始化，且环境 ID 匹配。

## 云函数部署

在微信开发者工具中：

1. 右键 `cloudfunctions/coreUser` → 「创建并部署：云端安装依赖」
2. 右键 `cloudfunctions/coreApp` → 「创建并部署：云端安装依赖」
3. 右键 `cloudfunctions/corePoints` → 「创建并部署：云端安装依赖」
4. 右键 `cloudfunctions/corePayment` → 「创建并部署：云端安装依赖」
5. 右键 `cloudfunctions/adminCore` → 「创建并部署：云端安装依赖」
6. 右键 `cloudfunctions/demoSum` → 「创建并部署：云端安装依赖」
7. 保留的示例函数同理：`getOpenId`、`sum`

## 环境变量配置

以下环境变量需在云函数控制台配置：

| 变量名 | 说明 | 建议值 |
|---|---|---|
| `ADMIN_OPENIDS` | 管理员 openid 白名单，逗号分隔 | `openid1,openid2` |
| `PAYMENT_PROVIDER` | 支付提供商 | `mock`（开发阶段） |
| `MOCK_PAYMENT_ENABLED` | 是否启用模拟支付 | `true`（开发阶段） |
| `INTERNAL_API_SECRET` | 云函数间内部调用凭据 | 必须显式配置为随机字符串；未配置时扣费、到账、管理调分会失败 |

真实微信支付预留变量（仅当 `PAYMENT_PROVIDER=wechat` 时需要）：

| 变量名 | 说明 |
|---|---|
| `WX_PAY_MCH_ID` | 微信支付商户号 |
| `WX_PAY_APPID` | 微信支付 APPID |
| `WX_PAY_API_V3_KEY` | API v3 密钥 |
| `WX_PAY_SERIAL_NO` | 商户证书序列号 |
| `WX_PAY_PRIVATE_KEY` | 商户私钥 |
| `WX_PAY_NOTIFY_URL` | 支付回调通知地址 |

配置路径：微信开发者工具 → 云开发 → 云函数 → 选中函数 → 版本与配置 → 环境变量

敏感密钥（如私钥）不要写入代码仓库，仅通过云函数环境变量注入。详见 `docs/payment_setup.md`。

## 数据库集合创建

首次部署后，需先创建 CloudBase 集合。详见 `docs/cloud_collections.md` 的手工创建步骤。

集合创建完成后，调用 `adminCore.initSchema` 初始化 seed 数据。

## 本地静态检查

```bash
bash scripts/check-js.sh
```

此命令在每次提交前运行，检查 `miniprogram/**/*.js` 和 `cloudfunctions/**/*.js` 的语法。
