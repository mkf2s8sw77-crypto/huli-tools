# AGENTS.md: huli-tools 工程规则

> 长期约束与架构规则。后续 coding Agent 维护本项目前应先阅读本文件。

## 1. 语言与沟通

- 除专有名词外，默认使用中文与用户交互，文档默认中文。

## 2. 技术栈边界

- 微信小程序原生语法，不引入 Taro、uni-app、React/Vue 或大型状态管理库。
- `admin-web/` Web 管理端允许使用 Vite + React + TypeScript + Ant Design，但不适用于小程序端。
- 后端仅使用微信云开发（云函数 + 云数据库），不引入独立外部服务。
- 云函数代码风格保持 CommonJS，两空格缩进。

## 3. 设计系统（柔彩多巴胺）

- 详见 `docs/design_system.md`。视觉方向：柔彩多巴胺工具平台。
- **色板**：晴空蓝主色 `#5E95C8` + 薄荷青 `#5EBCB0` + 珊瑚橙 `#E8956B` + 桃粉/薰衣草/柠檬扩展。微信绿仅用于微信登录按钮。不得回退到旧深蓝青 `#1e5a8c`。
- **表面**：页面使用淡紫灰暖渐变背景，卡片带描边 + 柔阴影 + 顶部彩虹高光线。
- **Logo**：两端使用 `https://media.huli.sh.cn/huli-tech-logo.png` 的本地化资产；展示时必须圆角裁切，不得使用方角原图。
- **小程序端**：全局 Token 在 `miniprogram/styles/tokens.wxss`，通用样式在 `miniprogram/styles/common.wxss`，由 `app.wxss` 统一引入。公共 UI 组件在 `miniprogram/components/ui/`，已在 `app.json` 全局注册。底部大号浮动胶囊导航在 `miniprogram/custom-tab-bar/`。
- **管理端**：主题 Token 在 `admin-web/src/theme.ts`（含 Layout/Menu/Card/Table 组件级 token），由 `ConfigProvider` 注入。柔蓝灰侧栏 `#3B4A6B`。通用组件在 `admin-web/src/components/`。
- 新页面和新应用必须使用柔彩多巴胺 token 和公共组件，采用"应用执行页"模式。功能图标使用 `.icon-tile` CSS-only 图标，不得用单字占位符。不得硬编码色值、不得自定义按钮/状态标签/卡片公共样式。
- 业务结果展示区允许应用自定义布局和色彩，但必须使用 token 变量。

## 4. 安全铁律

- **客户端不可信**：所有写操作必须走云函数；客户端不能直接写敏感 collection。
- **身份必须从上下文获取**：云函数使用 `cloud.getWXContext().OPENID` 获取调用者身份；禁止信任客户端传入的 `openid`、角色、价格、积分数量。
- **金额与积分**：金额统一用整数"分"，积分统一用整数，时间统一用服务端 `Date`。
- **内部接口隔离**：`corePoints` 的 `freezePoints`、`settleFrozenPoints`、`releaseFrozenPoints`、`creditPoints`、`adminAdjustPoints`，以及 `coreApp` 的 `finishUsage`、`failUsage` 仅供其他云函数内部调用，必须校验 `_internalToken`。
- **mock 支付**：受 `MOCK_PAYMENT_ENABLED` 环境变量控制，生产环境必须关闭。

## 5. Collection 与数据契约

- 公共集合见 `docs/cloud_collections.md`。
- 业务工具私有 collection 必须以 `app_<appKey>_` 为前缀，不得把业务字段塞进公共集合。
- `point_accounts._id` 必须与 `userId` 一致，`corePoints` 事务依赖该文档 ID 读写账户。
- 客户端对敏感 collection 应无写权限，只读权限也尽量限制为"仅自己"。

## 6. 云函数接口风格

- 公共云函数使用 action 风格，统一返回：
  ```js
  { ok: true, data: {}, requestId: "" }
  // 失败时
  { ok: false, error: { code: "", message: "" }, requestId: "" }
  ```
- 管理操作必须写入 `admin_audit_logs`。

## 7. Web 管理端边界

- `admin-web/src` 中不得出现对业务集合的 `collection(...)` 直连。
- `admin-web/src` 中不得出现 `INTERNAL_API_SECRET`、支付私钥等敏感标识。
- Web 管理端通过 `@cloudbase/js-sdk` 调用 `adminCore` 云函数，不得绕过云函数直接读写集合。
- Web 管理员来源：环境变量 `ADMIN_WEB_UIDS` + 首次扫码自动准入持久化于 `system_configs/admin_web_auto_admins`；两者合并校验。
- `adminCore` 校验 Web 管理员时必须从服务端 CloudBase Auth 上下文读取 uid，不能信任前端传入 uid。
- 微信扫码登录走 CloudBase Web Auth 的微信开放平台 OAuth（`genProviderRedirectUri` → `grantProviderToken` → `signInWithProvider`），AppSecret 仅存于 CloudBase 控制台，前端不保存。
- 提交前运行 `bash scripts/check-admin-web-boundaries.sh`。

## 8. 幂等与状态机

- 所有会改变余额、订单、使用记录状态的写操作必须具备幂等键。
- 重复支付回调不能重复到账；重复 finish/fail usage 不能重复结算或释放。
- 积分账户余额和积分流水必须在 `corePoints` 内同一事务完成，禁止先改余额再另行写流水。
- 异步业务必须把外部任务 ID 绑定到当前 `usageId` 和用户；成功才结算，失败/超时/取消必须释放冻结积分。
- AI 绘图上游 `gpt-image-2-web` 是单 worker、带冷却的自动化服务；调用方必须分类处理 `rate_limited` / `ui_changed` / `worker_unavailable`，不得自动重试轰炸。
- AI 绘图等长耗时应用必须采用后台任务模式；页面隐藏或退出只停止轮询，不得自动取消任务，取消只能由用户显式触发。
- 失败路径返回稳定错误码，不得静默吞掉异常。

## 9. 环境变量

开发最小集：
- `ADMIN_OPENIDS` — 小程序管理员白名单
- `ADMIN_WEB_UIDS` — Web 管理端 CloudBase Auth uid 白名单
- `PAYMENT_PROVIDER` — `mock` 或 `wechat`
- `MOCK_PAYMENT_ENABLED` — `true` 仅开发测试
- `INTERNAL_API_SECRET` — 云函数间调用凭据，必须显式配置为随机字符串；未配置时内部写入接口应拒绝执行

真实微信支付额外需要：
- `WX_PAY_MCH_ID`、`WX_PAY_APPID`、`WX_PAY_API_V3_KEY`、`WX_PAY_SERIAL_NO`、`WX_PAY_PRIVATE_KEY`、`WX_PAY_NOTIFY_URL`

## 10. 应用接入边界

- 三层架构：公共底座层 → 接入层 → 业务应用私有层。详见 `docs/app_boundary_and_onboarding.md`。
- 新应用 `appKey` 使用小写 snake_case；页面放 `miniprogram/pages/apps/<appKey>/`；云函数命名 `app_<appKey>`；私有集合 `app_<appKey>_*`。
- 新应用竖切模板见 `templates/app_vertical_slice/`，已预配置设计系统。
- 应用不得绕过 `coreApp.createUsage` / `finishUsage` / `failUsage` 直接操作积分；应用云函数仅允许只读当前 `app_usage_records` 做执行校验，不得直接写公共集合。
- 公共底座破坏性变更必须先提交 RFC（模板：`docs/templates/core_change_rfc.md`）。

## 11. 测试与交付

- 每次提交前运行 `bash scripts/check-js.sh`、`bash scripts/check-boundaries.sh` 和 `bash scripts/check-admin-web-boundaries.sh`。
- 文档中的命令必须能在当前仓库路径下解析；不能写不存在的命令作为 gate。
- 新增云函数、页面或 collection 时同步更新 `docs/`、`promptDocs/prompt-pack-huli-tools-0526/test_case_huli-tools_0526.md` 和 `run_manifest_huli-tools_0526.toml`。
- 涉及 `admin-web/` 的功能或验收规则时，同步更新 `admin-web/README.md`、`docs/admin_operations.md` 及 `promptDocs/prompt-pack-huli-tools-admin-web-0530/` 中对应测试/运行清单。
