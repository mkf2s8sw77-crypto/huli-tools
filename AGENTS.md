# AGENTS.md: huli-tools 工程规则

> 长期约束与架构规则。后续 coding Agent 维护本项目前应先阅读本文件；模块级架构、关键函数与数据契约的细节索引见 `docs/CODE_WIKI.md`。

## 1. 语言与沟通

- 除专有名词外，默认使用中文与用户交互，文档默认中文。

## 2. 技术栈边界

- 微信小程序原生语法，不引入 Taro、uni-app、React/Vue 或大型状态管理库。
- `admin-web/` Web 管理端允许使用 Vite + React + TypeScript + Ant Design，但不适用于小程序端。
- 后端运行时仅部署在微信云开发（云函数 + 云数据库），不得新增独立业务后端；业务确需调用外部 API 时，必须经云函数服务端调用并遵守状态机、鉴权和错误分类规则，客户端不得直连。
- 云函数代码风格保持 CommonJS，两空格缩进。
- 项目根 `cloudbaserc.json` 锁定云开发环境 `envId` 与所有云函数的部署配置（运行时 / 超时 / 入口 / `installDependency`），是 `tcb fn deploy` 等命令的 source of truth；新增或重命名云函数必须同步更新该文件后再部署。定时触发器不在该文件声明，而是随函数目录内的 `config.json` 部署：`app_maic_worker/config.json`（每分钟）与 `app_maic_reconcile/config.json`（每 5 分钟）；Worker 首次部署应先移除 trigger，模型 smoke 通过后再加回启用（见 `docs/dev_setup.md`）。

## 3. 设计系统（v4.1 清透活力 · Bento 工具墙）

- 详见 `docs/design_system.md`。视觉方向：冷白带紫调底色 + 沪里品牌紫 `#7C5CFC`，首页为 Bento 彩色磁贴工具墙。
- **信息架构**：积分后置（首页顶栏积分胶囊，大卡与充值入口在「我的」账户中心）；首页无积分 hero、无快捷入口行；订单/流水/使用记录全部收纳在「我的」。tabbar 为「工具 / 我的」。
- **色板**：背景 `#F6F5FA`、主色 `#7C5CFC`（深 `#6D3FE8`、亮阶 `#9F7BFA`、淡底 `#F0EDFA`）、强调珊瑚橙 `#FF7A59`（价格/推荐）、正文 `#18142A`。应用磁贴主题色：定妆照紫粉渐变、卧底靛蓝渐变、MAIC 青绿渐变、paper_polish 亮蓝渐变（`--gradient-tile-polish`）。微信绿仅用于微信登录按钮。
- **表面**：白卡片 + `#EEEAF7` 边框 + 轻阴影；磁贴用主题色渐变 + 同色 30% 透明投影。禁止回退土褐米黄（v3）或彩虹多巴胺（v2）体系；数字用 `font-weight:800` + `tabular-nums`，不用衬线字体。
- **Logo**：两端均使用包内本地化资产（源图 `https://media.huli.sh.cn/huli-tech-logo.png`；小程序端在 `miniprogram/assets/images/`，管理端在 `admin-web/src/assets/`）；展示时必须圆角裁切，不得使用方角原图。
- **小程序端**：全局 Token 在 `miniprogram/styles/tokens.wxss`，通用样式在 `miniprogram/styles/common.wxss`，由 `app.wxss` 统一引入。公共 UI 组件在 `miniprogram/components/ui/`，已在 `app.json` 全局注册。底部悬浮胶囊导航在 `miniprogram/custom-tab-bar/`。
- **管理端**：主题 Token 在 `admin-web/src/theme.ts`（含 Layout/Menu/Card/Table 组件级 token），由 `ConfigProvider` 注入；主色与小程序端一致（活力紫），侧栏深紫灰 `#3D3656`。通用组件在 `admin-web/src/components/`。
- 新页面和新应用必须使用 v4.1 token 和公共组件，采用"应用执行页"模式。功能图标使用 CSS-only 图标（icon-tile 或等价实现），不得用单字占位符。不得硬编码色值、不得自定义按钮/状态标签/卡片公共样式。
- 业务结果展示区允许应用自定义布局和色彩，但必须使用 token 变量。

## 4. 安全铁律

- **客户端不可信**：所有写操作必须走云函数；客户端不能直接写敏感 collection。
- **身份必须从上下文获取**：云函数使用 `cloud.getWXContext().OPENID` 获取调用者身份；禁止信任客户端传入的 `openid`、角色、价格、积分数量。
- **金额与积分**：金额统一用整数"分"，积分统一用整数，时间统一用服务端 `Date`。
- **内部接口隔离**：`corePoints` 的 `freezePoints`、`settleFrozenPoints`、`releaseFrozenPoints`、`creditPoints`、`adminAdjustPoints`，`coreApp` 的 `finishUsage`、`failUsage`，以及 `coreModel` 的 `generateText`、`generateImage`、`generateSpeech`、`smokeProvider`、`seedDefaults` 仅供其他云函数内部调用，必须校验 `_internalToken`。应用侧内部入口同样适用：`app_paper_polish.runTask`、`app_ai_draw.cleanupExpiredAssets`、`app_maic_worker` 的非 Timer 入口（含 `modelSmoke`）、`app_maic_reconcile` 的全部入口。
- **模型密钥收口**：大模型密钥（如 `MINIMAX_API_KEY`）只允许配置在 `coreModel` 环境变量；`model_providers` 文档只存 `secretEnv` 变量名，禁止写入密钥本体；应用云函数环境变量不得配置任何模型密钥。
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
- 公共底座云函数为 `coreUser`、`coreApp`、`corePoints`、`corePayment`、`coreModel`、`adminCore`。例外：`demoSum` 是单 event 示例函数（无 `action` 分发，仅返回包络一致）；`getOpenId`、`sum` 为微信模板遗留函数，新代码不得仿照。
- 管理操作必须写入 `admin_audit_logs`。

## 7. Web 管理端边界

- 生产管理端固定复用 CloudBase Web 应用服务 `huli-tools-admin`，正式入口为 `https://huli-tools-admin-cloudbase-3gphz7fk0fe1b760.webapps.tcloudbase.com/`；后续部署不得新建同用途服务名。
- `admin-web/src` 中不得出现对业务集合的 `collection(...)` 直连。
- `admin-web/src` 中不得出现 `INTERNAL_API_SECRET`、支付私钥等敏感标识。
- Web 管理端通过 `@cloudbase/js-sdk` 调用 `adminCore` 云函数，不得绕过云函数直接读写集合。
- Web 管理员来源：环境变量 `ADMIN_WEB_UIDS` + 首次扫码自动准入持久化于 `system_configs/admin_web_auto_admins`；两者合并校验。
- `adminCore` 校验 Web 管理员时必须从服务端 CloudBase Auth 上下文读取 uid，不能信任前端传入 uid。
- 微信扫码登录走 CloudBase Web Auth 的微信开放平台 OAuth（`genProviderRedirectUri` → `grantProviderToken` → `signInWithProvider`），AppSecret 仅存于 CloudBase 控制台，前端不保存；扫码通道受 `VITE_WECHAT_LOGIN_ENABLED` 开关控制。管理端同时保留账号密码登录（用户名/邮箱 + 密码双通道）；无任何管理员时前端触发 `adminCore.bootstrapFirstWebAdmin` 完成首个 Web 管理员自举。
- 提交前运行 `bash scripts/check-admin-web-boundaries.sh`。

## 8. 幂等与状态机

- 所有会改变余额、订单、使用记录状态的写操作必须具备幂等键。
- 重复支付回调不能重复到账；重复 finish/fail usage 不能重复结算或释放。
- 积分账户余额和积分流水必须在 `corePoints` 内同一事务完成，禁止先改余额再另行写流水。
- 异步业务必须把外部任务 ID 绑定到当前 `usageId` 和用户；成功才结算，失败/超时/取消必须释放冻结积分。
- AI 生图上游 `gpt-image-2-web` 是单 worker、带冷却的自动化服务；调用方必须分类处理 `rate_limited` / `ui_changed` / `worker_unavailable`，不得自动重试轰炸。
- 文本大模型调用统一经 `coreModel.generateText`：fallback 链只在绑定 `fallbackProviderKeys` 中显式配置，仅对 transient 错误（`MODEL_RATE_LIMITED` / `MODEL_TRANSIENT_ERROR`）切换；未配置 fallback 时单 provider 失败直接返回，不得自行多路重试。
- AI 生图等长耗时应用必须采用后台任务模式；页面隐藏或退出只停止轮询，不得自动取消任务，取消只能由用户显式触发。
- MAIC 定价固定为 0 积分；任务以 `usageId` 贯穿 `queued → processing → importing → succeeded`、课程导入和 usage 结算。`app_maic_worker` 每分钟最多认领一项并用 `app_maic_runtime` 保证全局并发 1；`app_maic_reconcile` 只做遗留迁移、租约恢复、45 分钟超时和失败结算，不调用模型。
- 用户媒体上传必须先由云函数签发受控 `cloudPath`，客户端只上传到该路径；业务云函数校验 `fileID/cloudPath` 归属后换取短期临时 URL 调上游，源素材默认私有短期保留并设置 `expiresAt`。
- 失败路径返回稳定错误码，不得静默吞掉异常。

## 9. 环境变量

开发最小集：
- `ADMIN_OPENIDS` — 小程序管理员白名单
- `ADMIN_WEB_UIDS` — Web 管理端 CloudBase Auth uid 白名单
- `PAYMENT_PROVIDER` — `mock` / `virtual` / `wechat`（预留）
- `MOCK_PAYMENT_ENABLED` — `true` 仅开发测试
- `INTERNAL_API_SECRET` — 云函数间调用凭据，必须显式配置为随机字符串，并在 `coreApp`、`corePoints`、`corePayment`、`coreModel`、`adminCore`、`demoSum`、所有 `app_*` 应用云函数中保持一致；未配置时内部写入接口应拒绝执行
- `MINIMAX_API_KEY` — 仅配置于 `coreModel`；密钥禁止下发客户端、写入仓库或存入集合文档
- `MINIMAX_GROUP_ID` — 仅配置于 `coreModel`，可选；MiniMax 语音合成（t2a_v2）新版接口仅 Bearer 鉴权，配置后作为 query 参数一并带上以兼容旧账户体系
- `KIMI_API_KEY` — 仅配置于 `coreModel`；Kimi Code token plan 密钥（Anthropic 兼容端点），配置后 `seedDefaults` 会补种 `kimi_k3_256k` provider
- `MAIC_AI_MODEL`、`MINIMAX_BASE_URL`、`CLOUDBASE_AI_MODEL` — 仅配置于 `coreModel`，作为 `seedDefaults` 种子默认值；运行时模型与绑定关系以 `model_providers` / `app_model_bindings` 文档为准（管理端「模型管理」维护）
- `MAIC_AI_MODE` — 运行清单登记项，当前环境固定为 Worker 服务端直连（`direct_minimax`）
- `MAIC_DAILY_LIMIT` — 仅配置于 `app_maic`，默认且最大为 3，可降低不可提高

小程序虚拟支付（线上售卖积分）额外需要：
- `VIRTUAL_PAY_OFFER_ID` — mp 后台虚拟支付 offerId
- `VIRTUAL_PAY_APP_KEY` — 现网 AppKey（`VIRTUAL_PAY_ENV=0` 时使用）
- `VIRTUAL_PAY_APP_KEY_SANDBOX` — 沙箱 AppKey（`VIRTUAL_PAY_ENV=1` 时使用）
- `VIRTUAL_PAY_ENV` — `0`=现网，`1`=沙箱
- `WX_MINIPROGRAM_APPSECRET` — 小程序 AppSecret（code2session / access_token），仅存云函数环境变量

真实微信支付额外需要：
- `WX_PAY_MCH_ID`、`WX_PAY_APPID`、`WX_PAY_API_V3_KEY`、`WX_PAY_SERIAL_NO`、`WX_PAY_PRIVATE_KEY`、`WX_PAY_NOTIFY_URL`

## 10. 应用接入边界

- 三层架构：公共底座层 → 接入层 → 业务应用私有层。详见 `docs/app_boundary_and_onboarding.md`。
- 新应用 `appKey` 使用小写 snake_case；页面放 `miniprogram/pages/apps/<appKey>/`；云函数命名 `app_<appKey>`；私有集合 `app_<appKey>_*`。
- 新应用竖切模板见 `templates/app_vertical_slice/`，已预配置设计系统。
- 应用不得绕过 `coreApp.createUsage` / `finishUsage` / `failUsage` 直接操作积分；应用云函数仅允许只读当前 `app_usage_records` 做执行校验，不得直接写公共集合。
- 应用不得直连任何大模型服务；所有模型调用经 `coreModel` 网关（文本 `generateText`、图像 `generateImage`、语音 `generateSpeech`，均为 `appKey` + `capability`），绑定关系（`app_model_bindings`）与 provider（`model_providers`）由管理端配置，prompt 组装留在应用侧。新应用接入模型时在管理端新增绑定即可，无需改公共代码。
- `maic` 是平台垂直应用：小程序课程只存 CloudBase，不与 MAIC Web 账号/课程同步；客户端不得直连 MAIC/MiniMax，不得使用 WebView 或执行服务端内容。
- MAIC CloudBase 原生化与原生舞台 V2 的权威实施规格在 `specs/maic-cloudbase-native/` 与 `specs/maic-native-stage-v2/`（requirements/design/tasks），改动 MAIC 链路前先对照规格。
- MAIC 不再有独立 Web、SQLite、PM2、HMAC 或本机 Worker；模型由 `app_maic_worker` 经 `coreModel` 网关服务端调用，新课程首版固定空 `assets`，既有课程资产继续兼容播放和删除。
- MAIC 原生播放器负责翻页和互动门控：旧协议中的 `navigate` 必须忽略；quiz、interaction、PBL 完成前不得进入下一幕。舞台布局和门控规则集中在 `player-view-model.js`，不要退回通用纵向白卡。
- OpenMAIC 只读跟踪只评估生成质量、协议、JSON 修复、模型适配和安全修复；Web、编辑器、SQLite、图片/语音/视频与导出更新直接忽略，禁止自动合并上游。上游差异探测用 `bash scripts/check-maic-upstream.sh`（对比基线 SHA 并输出 compare 链接，不自动合并）。
- 公共底座破坏性变更必须先提交 RFC（模板：`docs/templates/core_change_rfc.md`）。

## 11. 测试与交付

- 小程序上传必须使用 `bash scripts/upload-miniprogram.sh <版本号> <版本说明>`，固定体验版入口为 `pages/index/index`；不得再使用缺少 `pagePath` 的临时 `miniprogram-ci` 命令。脚本强制 Node.js ≤22（优先 node@20，高于 22 直接报错），以避免新版 Node 与 `miniprogram-ci` 不兼容。
- **版本号以 MP 后台线上版本为准**（如 1.4.x），不与 git tag（0.1.x）同步；上传前先确认线上当前版本再递增。上传若报 `errCode -10008 invalid ip`，需在 MP 开发设置维护上传 IP 白名单，本机建议加 IPv4 出口并以 `NODE_OPTIONS="--dns-result-order=ipv4first"` 强制 IPv4。
- 每次提交前运行 `node --test tests/*.test.js`（node 内置 test runner；现有 4 个测试文件：core-model-router、maic-player-view-model、maic-worker-core、paper-polish-core）、`bash scripts/check-js.sh`、`bash scripts/check-boundaries.sh` 和 `bash scripts/check-admin-web-boundaries.sh`。注意 `node --test tests/` 目录形式会报 "Cannot find module"，必须用 `tests/*.test.js` 通配。
- 提交前同时运行 `git diff --check`；涉及 `admin-web/` 时额外运行 `npm --prefix admin-web run lint` 和 `npm --prefix admin-web run build`。Vite chunk size warning 不是阻断项，除非本次任务明确要求拆包。
- 文档中的命令必须能在当前仓库路径下解析；不能写不存在的命令作为 gate。
- 新增云函数、页面或 collection 时同步更新 `docs/`、`promptDocs/prompt-pack-huli-tools-0526/test_case_huli-tools_0526.md` 和 `run_manifest_huli-tools_0526.toml`。
- 涉及 `admin-web/` 的功能或验收规则时，同步更新 `admin-web/README.md`、`docs/admin_operations.md` 及 `promptDocs/prompt-pack-huli-tools-admin-web-0530/` 中对应测试/运行清单。
- macOS 上 `tcb` 登录态保存在系统 Keychain（不在 `~/.tcb/`），不要用 `~/.tcb/cli.json` 是否存在判断登录状态；以 `tcb env list` 能否返回为准。
- 查 CloudBase 业务 collection **必须**用 CloudBase MCP 的 `readNoSqlDatabaseStructure(action="listCollections")` 或 SDK；`tcb db list` 只列 NoSQL 2.0 **数据模型**，看不到业务用的传统 collection，会误判"集合全空"。如未挂 MCP，用 `npx -y mcporter call cloudbase.readNoSqlDatabaseStructure action=listCollections` 调。
