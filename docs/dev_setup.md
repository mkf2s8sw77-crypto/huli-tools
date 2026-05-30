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
2. `project.config.json` 当前已配置 APPID：`wx1654159e6e3bb334`。如复制为其他小程序项目，再替换为对应 APPID。
3. 确保「云开发」已初始化，且环境 ID 匹配。

## 云函数部署

在微信开发者工具中：

1. 右键 `cloudfunctions/coreUser` → 「创建并部署：云端安装依赖」
2. 右键 `cloudfunctions/coreApp` → 「创建并部署：云端安装依赖」
3. 右键 `cloudfunctions/corePoints` → 「创建并部署：云端安装依赖」
4. 右键 `cloudfunctions/corePayment` → 「创建并部署：云端安装依赖」
5. 右键 `cloudfunctions/adminCore` → 「创建并部署：云端安装依赖」
6. 右键 `cloudfunctions/demoSum` → 「创建并部署：云端安装依赖」
7. 右键 `cloudfunctions/app_ai_draw` → 「创建并部署：云端安装依赖」
8. 保留的示例函数同理：`getOpenId`、`sum`

也可以用 CloudBase CLI 首次创建和更新云函数。仓库已提交 `cloudbaserc.json`，仅保存环境 ID、函数名、runtime、handler、超时等非敏感部署元数据，确认其中不写入敏感环境变量后执行：

```bash
npx -y -p @cloudbase/cli@3.5.0 cloudbase login
npx -y -p @cloudbase/cli@3.5.0 cloudbase fn deploy app_ai_draw --force --deployMode zip
```

若要配置 `INTERNAL_API_SECRET` 等敏感环境变量，必须只保存在本地文件或云开发控制台中，不能写入 `cloudbaserc.json`。

## 环境变量配置

以下环境变量需在云函数控制台配置：

| 变量名 | 说明 | 建议值 |
|---|---|---|
| `ADMIN_OPENIDS` | 管理员 openid 白名单，逗号分隔 | `openid1,openid2` |
| `PAYMENT_PROVIDER` | 支付提供商 | `mock`（开发阶段） |
| `MOCK_PAYMENT_ENABLED` | 是否启用模拟支付 | `true`（开发阶段） |
| `INTERNAL_API_SECRET` | 云函数间内部调用凭据 | 必须显式配置为随机字符串；未配置时扣费、到账、管理调分会失败 |

`INTERNAL_API_SECRET` 必须在 `coreApp`、`corePoints`、`corePayment`、`adminCore`、`demoSum`、`app_ai_draw` 以及后续所有 `app_*` 应用云函数中保持一致；否则业务云函数无法回调 `finishUsage` / `failUsage`。

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

## Web 管理端（admin-web）

### 本地启动

```bash
cd admin-web
cp .env.example .env    # 首次复制环境变量
npm install
npm run dev             # 默认 http://localhost:60530
```

管理端使用 hash 路由，直接访问 `http://localhost:60530/#/dashboard` 可进入登录态检查后的 Dashboard。

### 环境变量

| 变量 | 说明 |
|---|---|
| `VITE_CLOUDBASE_ENV_ID` | CloudBase 环境 ID，默认 `cloudbase-3gphz7fk0fe1b760` |
| `VITE_CLOUDBASE_ADMIN_FUNCTION` | 管理云函数名，默认 `adminCore` |
| `VITE_WECHAT_LOGIN_ENABLED` | 是否启用微信扫码登录，默认 `false` |
| `VITE_WECHAT_PROVIDER_ID` | CloudBase 微信开放平台 provider ID，默认 `wx_open` |
| `VITE_WECHAT_REDIRECT_URI` | 可选，OAuth 回调地址，默认 `window.location.origin + window.location.pathname` |

### 微信扫码登录配置

启用微信扫码登录需完成以下步骤：

1. **微信开放平台**：注册网站应用，获取 AppID 和 AppSecret，配置授权回调域名。
2. **CloudBase 控制台**：环境 → 身份认证 → 登录方式 → 启用"微信开放平台登录"，填入 AppID/AppSecret。
3. **CloudBase 安全来源**：添加管理端域名（含回调域名）。
4. **admin-web 环境变量**：设置 `VITE_WECHAT_LOGIN_ENABLED=true`。
5. **首次登录**：当 `ADMIN_OPENIDS`、`ADMIN_WEB_UIDS` 均为空且无任何持久化 Web 管理员时，第一个成功扫码的用户自动成为管理员。

> 注意：`localhost` 通常无法完成微信开放平台扫码回调，本地开发建议保持账号密码登录，扫码功能在已备案域名上验证。

### 构建

```bash
npm --prefix admin-web run build    # 产物输出到 admin-web/dist
```

### CloudBase 安全来源

使用 Web SDK 调用云函数时，需要在 CloudBase 控制台配置「安全来源」：

- 本地开发：`localhost`
- 生产部署：管理端域名

配置路径：CloudBase 控制台 → 环境 → 安全配置 → Web 安全域名

### 部署

推荐 CloudBase 静态托管：

1. 构建 `npm --prefix admin-web run build`
2. 将 `admin-web/dist` 部署到 CloudBase 静态托管
3. 在 CloudBase 安全来源中添加托管域名
4. 在 `adminCore` 配置 `ADMIN_WEB_UIDS`

也可部署到任意静态站点（Nginx、CDN），需确保：
- CloudBase 安全来源包含该域名
- 不在构建产物或 HTML 中暴露 `INTERNAL_API_SECRET` 等密钥

## 本地静态检查

```bash
bash scripts/check-js.sh
bash scripts/check-boundaries.sh
bash scripts/check-admin-web-boundaries.sh    # admin-web 边界检查
```

- `check-js.sh`：检查 `miniprogram/**/*.js`、`cloudfunctions/**/*.js` 和 `templates/**/*.js.template` 的语法。
- `check-boundaries.sh`：启发式检查应用边界违规（客户端越权写公共集合、调用内部 action 等）。
- `check-admin-web-boundaries.sh`：检查 `admin-web/src` 不直连集合、不泄露密钥、不调用内部 action。

三个脚本在每次提交前都应运行。
