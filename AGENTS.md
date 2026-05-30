# AGENTS.md: huli-tools 工程规则

> 长期约束与架构规则。后续 coding Agent 维护本项目前应先阅读本文件。

## 1. 语言与沟通

- 除专有名词外，默认使用中文与用户交互，文档默认中文。

## 2. 技术栈边界

- 微信小程序原生语法，不引入 Taro、uni-app、React/Vue 或大型状态管理库。
- `admin-web/` Web 管理端允许使用 Vite + React + TypeScript + Ant Design，但不适用于小程序端。
- 后端仅使用微信云开发（云函数 + 云数据库），不引入独立外部服务。
- 云函数代码风格保持 CommonJS，两空格缩进。

## 3. 安全铁律

- **客户端不可信**：所有写操作必须走云函数；客户端不能直接写敏感 collection。
- **身份必须从上下文获取**：云函数使用 `cloud.getWXContext().OPENID` 获取调用者身份；禁止信任客户端传入的 `openid`、角色、价格、积分数量。
- **金额与积分**：金额统一用整数“分”，积分统一用整数，时间统一用服务端 `Date`。
- **内部接口隔离**：`corePoints` 的 `freezePoints`、`settleFrozenPoints`、`releaseFrozenPoints`、`creditPoints`、`adminAdjustPoints`，以及 `coreApp` 的 `finishUsage`、`failUsage` 仅供其他云函数内部调用，必须校验 `_internalToken`。
- **mock 支付**：受 `MOCK_PAYMENT_ENABLED` 环境变量控制，生产环境必须关闭。

## 4. Collection 与数据契约

- 公共集合见 `docs/cloud_collections.md`。
- 业务工具私有 collection 必须以 `app_<appKey>_` 为前缀，不得把业务字段塞进公共集合。
- `point_accounts._id` 必须与 `userId` 一致，`corePoints` 事务依赖该文档 ID 读写账户。
- 客户端对敏感 collection 应无写权限，只读权限也尽量限制为“仅自己”。

## 5. 云函数接口风格

- 公共云函数使用 action 风格，统一返回：
  ```js
  { ok: true, data: {}, requestId: "" }
  // 失败时
  { ok: false, error: { code: "", message: "" }, requestId: "" }
  ```
- 管理操作必须写入 `admin_audit_logs`。

## 6. Web 管理端边界

- `admin-web/src` 中不得出现对业务集合的 `collection(...)` 直连。
- `admin-web/src` 中不得出现 `INTERNAL_API_SECRET`、支付私钥等敏感标识。
- Web 管理端通过 `@cloudbase/js-sdk` 调用 `adminCore` 云函数，不得绕过云函数直接读写集合。
- Web 管理员使用 `ADMIN_WEB_UIDS`（CloudBase Auth uid），与小程序管理员 `ADMIN_OPENIDS` 独立管理。
- `adminCore` 校验 Web 管理员时必须从服务端 CloudBase Auth 上下文读取 uid，不能信任前端传入 uid。
- 提交前运行 `bash scripts/check-admin-web-boundaries.sh`。

## 7. 幂等与状态机

- 所有会改变余额、订单、使用记录状态的写操作必须具备幂等键。
- 重复支付回调不能重复到账；重复 finish/fail usage 不能重复结算或释放。
- 积分账户余额和积分流水必须在 `corePoints` 内同一事务完成，禁止先改余额再另行写流水。
- 异步业务必须把外部任务 ID 绑定到当前 `usageId` 和用户；成功才结算，失败/超时/取消必须释放冻结积分。
- 失败路径返回稳定错误码，不得静默吞掉异常。

## 8. 环境变量

开发最小集：
- `ADMIN_OPENIDS` — 小程序管理员白名单
- `ADMIN_WEB_UIDS` — Web 管理端 CloudBase Auth uid 白名单
- `PAYMENT_PROVIDER` — `mock` 或 `wechat`
- `MOCK_PAYMENT_ENABLED` — `true` 仅开发测试
- `INTERNAL_API_SECRET` — 云函数间调用凭据，必须显式配置为随机字符串；未配置时内部写入接口应拒绝执行

真实微信支付额外需要：
- `WX_PAY_MCH_ID`、`WX_PAY_APPID`、`WX_PAY_API_V3_KEY`、`WX_PAY_SERIAL_NO`、`WX_PAY_PRIVATE_KEY`、`WX_PAY_NOTIFY_URL`

## 9. 应用接入边界

- 三层架构：公共底座层 → 接入层 → 业务应用私有层。详见 `docs/app_boundary_and_onboarding.md`。
- 新应用 `appKey` 使用小写 snake_case；页面放 `miniprogram/pages/apps/<appKey>/`；云函数命名 `app_<appKey>`；私有集合 `app_<appKey>_*`。
- 新应用竖切模板见 `templates/app_vertical_slice/`。
- 应用不得绕过 `coreApp.createUsage` / `finishUsage` / `failUsage` 直接操作积分；应用云函数仅允许只读当前 `app_usage_records` 做执行校验，不得直接写公共集合。
- 公共底座破坏性变更必须先提交 RFC（模板：`docs/templates/core_change_rfc.md`）。

## 10. 测试与交付

- 每次提交前运行 `bash scripts/check-js.sh`、`bash scripts/check-boundaries.sh` 和 `bash scripts/check-admin-web-boundaries.sh`。
- 文档中的命令必须能在当前仓库路径下解析；不能写不存在的命令作为 gate。
- 新增云函数、页面或 collection 时同步更新 `docs/`、`test_case_huli-tools_0526.md` 和 `run_manifest_huli-tools_0526.toml`。
