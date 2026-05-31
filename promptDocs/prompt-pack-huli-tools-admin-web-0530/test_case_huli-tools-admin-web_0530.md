# Test Cases: huli-tools-admin-web

## 1. 测试环境

- 仓库路径：`/Users/huli-dev/Documents/huli-tools`
- 云开发环境：`cloudbase-3gphz7fk0fe1b760`
- 小程序 APPID：`wx1654159e6e3bb334`
- Web 管理端本地地址：`http://localhost:60530`（Phase 3 后，页面路由使用 hash）
- Web 管理端目录：`admin-web/`
- 云函数：`adminCore`

## 2. 测试账号与配置

必须配置：

- `ADMIN_OPENIDS`：已有小程序管理员 openid 白名单。
- `ADMIN_WEB_UIDS`：CloudBase Auth 管理员 uid 白名单，逗号分隔。
- `INTERNAL_API_SECRET`：`adminCore`、`corePoints` 等云函数一致。

Web 管理员准备方式：

1. 在 CloudBase 控制台启用一种 Web Auth 登录方式（用户名/密码或邮箱/密码）。
2. 创建或登录首个管理员账号。
3. 获取该账号 CloudBase Auth `uid`。
4. 将 `uid` 配置到 `adminCore` 环境变量 `ADMIN_WEB_UIDS`。
5. 重新部署或刷新 `adminCore` 配置。

若当前环境暂时无法取得真实 `uid`，允许先完成本地构建和代码级 smoke，但必须把真实登录验证标为未完成。

## 3. 数据准备

- CloudBase 集合按 `docs/cloud_collections.md` 创建完成。
- 已部署公共云函数：`coreUser`、`coreApp`、`corePoints`、`corePayment`、`adminCore`、`demoSum`、`app_ai_draw`。
- 已执行 `adminCore.initSchema`。
- 至少存在：
  - 1 个普通用户。
  - 1 个积分账户。
  - 若干积分流水。
  - 若干订单或 mock 支付订单。
  - 若干应用使用记录。

基础检查命令：

```bash
bash scripts/check-js.sh
bash scripts/check-boundaries.sh
```

Web 管理端创建后：

```bash
npm --prefix admin-web install
npm --prefix admin-web run lint
npm --prefix admin-web run build
```

## 4. 冒烟用例

### TC-01 Web 管理员身份识别

- 目标：确认 `adminCore.getAdminMe` 能识别 Web 管理员 uid。
- 前置条件：已配置 `ADMIN_WEB_UIDS`，Web 登录态有效。
- 步骤：
  1. 使用 Web SDK 登录管理员账号。
  2. 调用 `adminCore`，传 `{ action: "getAdminMe" }`。
- 断言：
  - 返回 `ok: true`。
  - 返回数据包含管理员标识、来源为 `web` 或等价值。
  - 不返回任何内部密钥。

### TC-02 非管理员被拒绝

- 目标：确认 Web 非管理员不能访问管理 API。
- 前置条件：准备一个未加入 `ADMIN_WEB_UIDS` 的 CloudBase Auth 用户。
- 步骤：
  1. 使用非管理员账号登录。
  2. 调用 `getAdminMe`、`listUsers`、`adjustPoints`。
- 断言：
  - 均返回 `FORBIDDEN` 或稳定无权限错误。
  - 不返回用户列表、积分账户或订单数据。

### TC-03 未登录/匿名登录被拒绝

- 目标：确认没有真实登录态不能访问管理端。
- 前置条件：清空浏览器登录态；若 CloudBase 开启匿名登录，使用匿名态测试。
- 步骤：
  1. 访问 `http://localhost:60530/#/dashboard`。
  2. 尝试调用任意 admin action。
- 断言：
  - 页面跳转登录页或显示未登录。
  - 云函数返回 `UNAUTHORIZED` / `FORBIDDEN`，不能返回管理数据。

### TC-04 Dashboard 概览

- 目标：确认 `dashboardSummary` 返回运营概览。
- 前置条件：管理员登录，集合中有基础数据。
- 步骤：
  1. 打开 Dashboard。
  2. 查看用户数、订单数、积分概览、使用记录概览、最近审计。
- 断言：
  - 页面无报错。
  - 数值字段为数字。
  - 最近列表最多返回约定数量，不一次性加载全量集合。

### TC-05 用户列表与详情

- 目标：确认用户查询链路可用。
- 前置条件：存在至少 1 个用户。
- 步骤：
  1. 打开用户列表。
  2. 按 openid/userId 搜索。
  3. 进入用户详情。
- 断言：
  - 列表分页正常。
  - 详情显示用户基础信息、积分账户、最近流水、最近订单、最近使用记录。
  - 不显示敏感内部字段。

### TC-06 管理员调分

- 目标：确认调分链路和审计完整。
- 前置条件：管理员登录；目标用户有积分账户。
- 步骤：
  1. 在用户详情发起 `+1` 积分调分，填写备注。
  2. 刷新用户详情。
  3. 查看积分流水和审计日志。
- 断言：
  - 可用积分增加 1。
  - `point_transactions` 出现 `admin_adjust` 流水。
  - `admin_audit_logs` 出现对应操作。
  - 重复同一幂等键不会重复调分。

### TC-07 调分不能扣成负数

- 目标：确认负向调分安全。
- 前置条件：目标用户可用积分为 N。
- 步骤：
  1. 尝试调分 `-(N + 1)`。
- 断言：
  - 返回 `BALANCE_NOT_ENOUGH` 或稳定错误。
  - 账户余额不变。
  - 不写入成功审计。

### TC-08 应用管理

- 目标：确认应用目录可维护。
- 前置条件：管理员登录。
- 步骤：
  1. 打开应用管理。
  2. 编辑 `ai_draw` 描述或排序。
  3. 尝试提交非法 `pricing.costPoints=-1`。
- 断言：
  - 合法编辑成功并写审计。
  - 非法价格返回 `INVALID_PARAM`。
  - 小程序端应用列表读取不受影响。

### TC-09 充值包管理

- 目标：确认充值包可维护。
- 前置条件：管理员登录。
- 步骤：
  1. 打开充值包管理。
  2. 新增或编辑一个测试充值包。
  3. 尝试提交非整数金额或负积分。
- 断言：
  - 合法编辑成功并写审计。
  - 非法金额/积分返回 `INVALID_PARAM`。
  - 金额在前端显示为元，提交给后端为整数分。

### TC-10 订单与使用记录查询

- 目标：确认运营查询可用。
- 前置条件：存在订单和应用使用记录。
- 步骤：
  1. 打开订单管理，按状态和用户筛选。
  2. 打开使用记录，按 appKey 和状态筛选。
- 断言：
  - 分页正常。
  - 筛选参数生效。
  - 错误信息可读，不泄露内部堆栈。

### TC-11 审计日志

- 目标：确认所有写操作可追踪。
- 前置条件：已完成调分或应用/充值包编辑。
- 步骤：
  1. 打开审计日志。
  2. 查看最近操作详情。
- 断言：
  - 展示操作人、操作类型、目标集合、目标 ID、请求 ID、时间。
  - Web 管理员操作人能区分为 Web uid。

### TC-12 admin-web 边界检查

- 目标：确认 Web 前端没有越权直连集合或泄露密钥。
- 前置条件：Phase 4 已新增 `scripts/check-admin-web-boundaries.sh`。
- 步骤：
  1. 执行 `bash scripts/check-admin-web-boundaries.sh`。
  2. 临时在 `admin-web/src` 添加敏感集合直连字符串，确认脚本能失败。
  3. 恢复临时修改。
- 断言：
  - 正常源码检查通过。
  - 临时违规能被识别。

## 5. 设计系统视觉一致性验收

- 登录页、Dashboard、用户、应用、充值包、订单、使用记录、审计日志页面风格一致。
- 所有页面使用 `PageHeader` 组件统一标题区。
- 所有状态标签使用 `StatusTag` 组件，颜色映射统一。
- 主题色为蓝青（`#2b6cb0`），非 Ant Design 默认蓝。
- 微信绿（`#07c160`）仅用于微信扫码登录按钮。
- 表格筛选栏使用 `FilterBar` 组件。
- 新增页面必须引用 `src/components` 中的通用组件。

## 6. 人工检查项

- CloudBase 控制台已配置 `ADMIN_WEB_UIDS`，且不把真实 uid 列表写入仓库。
- CloudBase 安全来源包含本地开发地址和生产管理端域名。
- `admin-web/dist`、`node_modules/`、`.env.local` 未被提交。
- Web 构建产物中没有 `INTERNAL_API_SECRET`、微信支付私钥、小程序上传密钥。
- 生产环境关闭 `MOCK_PAYMENT_ENABLED`，或明确标注仍处于开发测试。
- 真实调分测试使用小额积分并记录可回滚方式。

## 7. 缺陷记录规则

每个失败用例都记录：

- 用例编号。
- 现象。
- 复现步骤。
- 期望结果。
- 实际结果。
- 浏览器控制台错误、云函数日志、请求 ID 或截图路径。
- 是否阻塞下一 phase。
