# Master Spec: huli-tools-admin-web

## 1. 背景与目标

`huli-tools` 是一个微信小程序原生项目，后端使用微信云开发（云函数 + 云数据库集合），当前已具备用户、积分、订单、应用目录、使用记录、AI 绘图应用和 `adminCore` 管理云函数。现在要新增一个 Web 管理端，用于运营人员在浏览器中管理这些云开发环境里的真实数据。

本次开发的关键前提：**数据实际仍在小程序云开发环境中，不新增外部业务数据库，不把集合复制到 Web 端本地服务。** Web 管理端只是浏览器入口，所有读写必须通过云函数完成。

## 2. 交付目标

- 在仓库中新增 `admin-web/` Web 管理端，使用浏览器访问并通过 CloudBase Web SDK 调用云函数。
- 扩展 `cloudfunctions/adminCore`，提供 Web 管理端所需的管理员身份校验、只读查询和运营写操作接口。
- 首版覆盖：登录与权限检查、Dashboard、用户查询、用户详情、积分调整、应用管理、充值包管理、订单查询、使用记录查询、审计日志。
- 补充管理端开发/部署文档、测试用例和边界检查，保证后续应用继续接入时不破坏公共底座边界。

## 3. 非目标

- 不迁移 CloudBase 集合，不引入 MySQL/PostgreSQL/Supabase/Firebase 等外部业务数据库。
- 不做小程序端大改版，不改动现有用户使用链路，除非是为了兼容新增管理 API 的小范围修复。
- 不实现真实微信支付回调、不做退款、不做删除用户/删除流水/直接改订单状态等高风险操作。
- 不把 `INTERNAL_API_SECRET`、微信支付私钥、小程序上传密钥写入前端代码、构建产物或 `cloudbaserc.json`。

## 4. 当前代码与环境事实

- 仓库根目录：`/Users/huli-dev/Documents/huli-tools`
- 小程序 APPID：`wx1654159e6e3bb334`
- 云开发环境 ID：`cloudbase-3gphz7fk0fe1b760`
- 小程序端：`miniprogram/`，原生小程序语法。
- 云函数：`cloudfunctions/`，CommonJS，两空格缩进。
- 现有管理云函数：`cloudfunctions/adminCore/index.js`
- 现有数据契约：`docs/cloud_collections.md`
- 现有长期规则：`AGENTS.md`
- 现有检查脚本：
  - `bash scripts/check-js.sh`
  - `bash scripts/check-boundaries.sh`

## 5. 技术栈与目录约定

- 小程序端继续保持原生小程序，不引入 Taro、uni-app、React/Vue。
- Web 管理端放在 `admin-web/`，允许使用 `Vite + React + TypeScript + Ant Design`。
- Web 管理端依赖 CloudBase Web SDK（`@cloudbase/js-sdk`）登录和调用云函数。
- Web 管理端不得直接使用数据库 SDK 访问集合；代码中不得出现对业务集合的 `collection(...)` 直接读写。
- 所有管理 API 继续走 `adminCore` action 风格，返回结构保持：
  ```js
  { ok: true, data: {}, requestId: "" }
  { ok: false, error: { code: "", message: "" }, requestId: "" }
  ```

## 6. 管理员身份与环境变量

必须支持两类管理员身份：

- 小程序管理员：继续使用现有 `ADMIN_OPENIDS`，由 `cloud.getWXContext().OPENID` 校验。
- Web 管理员：新增 `ADMIN_WEB_UIDS`，由 CloudBase Auth 登录态的 `uid` 校验。

新增/保留的环境变量：

| 变量名 | 必填 | 用途 |
|---|---|---|
| `ADMIN_OPENIDS` | 小程序管理入口必填 | 小程序 openid 管理员白名单 |
| `ADMIN_WEB_UIDS` | Web 管理端必填 | CloudBase Auth 用户 uid 管理员白名单，逗号分隔 |
| `INTERNAL_API_SECRET` | 必填 | 云函数内部调用凭据，不允许暴露给 Web |
| `PAYMENT_PROVIDER` | 保留 | `mock` 或 `wechat` |
| `MOCK_PAYMENT_ENABLED` | 保留 | mock 支付开关 |

Web 管理员登录说明：

- 首版使用 CloudBase Auth 的用户名/密码或邮箱/密码登录均可，具体以 CloudBase 控制台已启用方式为准。
- Web 登录成功后只能得到 CloudBase Auth `uid`，不能假设它等同小程序 `openid`。
- `adminCore` 必须新增统一身份解析逻辑，同时兼容小程序调用和 Web SDK 调用。
- 非登录用户、匿名登录用户、未进入白名单的 uid/openid 都必须被拒绝。

## 7. 管理 API 设计

在 `adminCore` 中新增或完善以下 action。所有 action 都必须先校验管理员身份，所有写操作必须写 `admin_audit_logs`。

只读能力：

- `getAdminMe`：返回当前管理员身份、来源（`miniProgram`/`web`）、可用权限、环境 ID。
- `dashboardSummary`：返回用户数、订单数、积分账户汇总、应用使用记录汇总、最近审计日志。
- `listUsers`：分页查询用户，支持按 `userId/openid` 精确或模糊搜索。
- `getUserDetail`：查询用户基础信息、积分账户、最近订单、最近积分流水、最近使用记录。
- `listPointTransactions`：分页查询积分流水，支持 `userId`、`type`、时间范围。
- `listOrders`：分页查询订单，支持 `userId`、`orderNo`、`status`、时间范围。
- `listUsageRecords`：分页查询应用使用记录，支持 `userId`、`appKey`、`status`、时间范围。
- `listApps`：管理端应用列表，包含 `disabled` 应用。
- `listPackages`：管理端充值包列表，包含 `disabled` 套餐。
- `listAuditLogs`：沿用现有接口，可补充筛选。

写操作：

- `adjustPoints`：沿用现有能力，保持幂等键，必须写积分流水和审计日志。
- `upsertApp`：沿用现有能力，校验 `appKey`、入口路径、云函数名、价格。
- `upsertPackage`：沿用现有能力，校验金额、积分、状态。

接口约束：

- 分页参数统一为 `page`、`pageSize`，`pageSize` 最大 100。
- 时间范围参数统一为 `startAt`、`endAt`，由云函数解析为服务端可比较的 `Date`。
- 金额一律整数“分”，积分一律整数。
- 返回给 Web 的列表项要做字段白名单，不要把内部 token、支付私钥、回调摘要等敏感字段透传。

## 8. Web 管理端页面规划

首版页面：

- `/login`：CloudBase Auth 登录。
- `/` 或 `/dashboard`：概览指标、最近订单、最近使用记录、最近审计。
- `/users`：用户列表、搜索、进入详情。
- `/users/:userId`：用户详情、积分账户、流水、订单、使用记录、管理员调分入口。
- `/apps`：应用目录管理，新增/编辑/启停。
- `/packages`：充值包管理，新增/编辑/启停。
- `/orders`：订单查询。
- `/usage-records`：应用使用记录查询。
- `/audit-logs`：审计日志。

UI 风格：

- 管理端是运营工具，布局应克制、信息密度高、适合扫描与重复操作。
- 使用表格、筛选表单、抽屉/弹窗编辑、确认框、状态标签。
- 不做营销落地页，不做大 hero，不使用装饰性背景。
- 所有危险操作必须二次确认，并清楚显示影响对象。

## 9. 阶段划分与理由

本包规划为 4 个 phase。

1. **Phase 1：Web 管理身份与只读管理 API MVP**
   - 先建立 Web 管理员身份、统一鉴权、只读查询 API 和 API 测试脚本。
   - 这是后续所有 UI 和写操作的安全基础。

2. **Phase 2：运营写操作与管理 API 完整化**
   - 在 Phase 1 鉴权基础上完善调分、应用、充值包管理和审计。
   - 写操作风险与只读查询不同，需要单独验收幂等、审计和边界。

3. **Phase 3：Web 管理端前端 MVP**
   - 新建 `admin-web/`，接入 CloudBase Auth 和 `adminCore`，实现页面。
   - 这个阶段以用户可见管理端为交付物。

4. **Phase 4：部署、边界检查、文档与端到端验收**
   - 补 CloudBase 静态托管/安全来源说明、admin-web 边界脚本、测试文档和端到端验证。
   - 部署与安全收口跨前后端，单独阶段可降低遗漏。

为什么不是 3 个 phase：若合并为 3 个 phase，需要把写操作安全、前端 UI、部署验收塞进同一阶段，coding Agent 容易漏掉 `ADMIN_WEB_UIDS`、审计日志、Web 禁止直连集合和 CloudBase 安全来源等关键边界。

## 10. 跨阶段规则

- 每个 phase 开始前必须阅读 `AGENTS.md`、本 `master_spec`、对应 phase prompt 和 `test_case`。
- 每个 phase 只能实现本阶段范围，不要提前做后续阶段。
- 修改云函数后必须运行 `bash scripts/check-js.sh`。
- 涉及边界后必须运行 `bash scripts/check-boundaries.sh`；Phase 4 后还必须运行新增的 admin-web 边界检查。
- 新增环境变量、云函数 action、页面、脚本时，同步更新文档。
- 不要提交或打印真实密钥。小程序上传密钥只允许保留在本地忽略文件中，不能写入文档正文的值，不能复制到 Web。

## 11. 共享验证命令

基础命令：

```bash
git status --short --branch
bash scripts/check-js.sh
bash scripts/check-boundaries.sh
```

Web 管理端创建后：

```bash
npm --prefix admin-web install
npm --prefix admin-web run lint
npm --prefix admin-web run build
```

小程序预览构建可选验证：

```bash
NODE_OPTIONS=--no-experimental-webstorage npx -y miniprogram-ci preview \
  --appid wx1654159e6e3bb334 \
  --project-path /Users/huli-dev/Documents/huli-tools \
  --private-key-path <本地小程序上传密钥路径> \
  --use-project-config \
  --upload-version admin-web-review \
  --threads 0 \
  --qrcode-format image \
  --qrcode-output-dest /tmp/huli-tools-admin-web-preview.png
```

## 12. 交付清单

最终必须交付：

- `cloudfunctions/adminCore` 扩展后的管理 API。
- `admin-web/` Web 管理端源码、构建脚本、环境变量示例。
- `scripts/check-admin-web-boundaries.sh` 或等价检查脚本。
- 更新后的 `docs/admin_operations.md`、`docs/dev_setup.md`、必要时更新 `docs/CODE_WIKI.md`。
- 测试用例通过记录和阶段交接说明。

## 13. 未决问题

- CloudBase Auth 的具体登录方式（用户名/密码、邮箱/密码、微信开放平台等）需在实际部署时由用户确认；首版代码应把登录方式封装在 `admin-web` 认证服务里，默认支持用户名/密码或邮箱/密码中的一种可配置方式。
- 首个 Web 管理员 `uid` 需要人工在 CloudBase 控制台创建/登录后获取，再配置到 `ADMIN_WEB_UIDS`。
- CloudBase 静态托管域名或外部域名最终以用户实际部署选择为准；开发期默认本地 `http://localhost:60530`，管理端可使用 hash 路由降低静态托管 fallback 配置要求。
