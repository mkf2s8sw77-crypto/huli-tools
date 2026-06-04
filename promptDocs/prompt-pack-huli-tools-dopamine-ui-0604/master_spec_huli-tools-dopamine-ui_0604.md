# Master Spec: huli-tools-dopamine-ui

## 1. 背景与目标

`huli-tools` 是一个“平台底座 + 若干工具应用”的微信小程序与 Web 管理端项目。现有 v2 设计系统已经把小程序 token、公共 UI 组件、管理端 Ant Design theme 收口到平台层，但最新手机预览暴露出明显视觉问题：

- 微信小程序导航栏已经显示“沪里工具”，首页 hero 又重复展示“沪里工具平台 / 沪里工具”，信息冗余。
- 小程序全局名称希望从中文“沪里工具”改为英文 `huli-tools`。
- 底部“首页 / 我的”浮动导航太小、太像临时按钮，点击不方便。
- 当前深蓝青 + 青绿 + 暖金配色仍然沉重，用户希望转向“柔和彩色”的多巴胺色系。

本次目标：在不改后端业务逻辑的前提下，把小程序和管理端统一调整为“柔彩多巴胺工具平台”视觉。用户已经确认：

- 范围：小程序 + 管理端。
- 色彩强度：柔和彩色，不做强烈糖果色满屏。
- 底部导航：保留大号浮动胶囊。

## 2. 成功标准

- 小程序全局导航栏标题显示为 `huli-tools`。
- 首页不再重复展示“沪里工具平台 / 沪里工具”这类品牌文案；第一屏直接呈现积分、快捷入口、应用目录等有效内容。
- 底部导航仍为浮动胶囊，但尺寸、点击热区和视觉层级明显提升；单项点击区域应不低于 `96rpx` 高。
- 小程序所有已注册页面在同一柔彩 token 体系下保持统一，不出现只有首页变彩、其他页仍旧深蓝青的割裂。
- 管理端登录页、布局外壳、通用组件和 Dashboard/Table 等页面同步采用柔彩主题，但保持后台可读性和表格效率。
- 不改云函数接口、数据库 schema、积分/支付状态机、权限模型和环境变量语义。
- 所有 gate 通过，生成可扫码的小程序预览二维码，管理端本地预览无控制台 error/warning。

## 3. Phase Sizing

本次拆 3 个 phase。

- **Phase 1：小程序品牌、首页和大号浮动导航 MVP**。先解决用户截图里最明显的痛点，并建立柔彩 token 基础。
- **Phase 2：小程序全页面与新应用模板统一**。把 Phase 1 的视觉语言扩展到充值、订单、流水、使用记录、demo-sum、AI 绘图、我的页和竖切模板，避免只有首页好看。
- **Phase 3：管理端同步、文档与验收收口**。同步 `admin-web` 主题和通用组件，并更新长期规则、测试文档、二维码预览验证。

为什么不是 2 个 phase：小程序页面较多，且 tabbar/首页重构与其余页面一致性验收的关注点不同；把所有小程序页面塞进一个 phase 容易让 coding Agent 只改首屏。为什么不是 4 个 phase：文档、测试和预览没有独立复杂风险，应与管理端同步和最终验收合并。

## 4. 全局约束

- 先读根目录 `AGENTS.md`，遵守其中技术栈和安全边界。
- 微信小程序必须保持原生语法，不引入 Taro、uni-app、React/Vue 或大型状态管理库。
- `admin-web/` 使用 Vite + React + TypeScript + Ant Design；不要把 Web 技术引入小程序端。
- 后端仅使用微信云开发。除非本 prompt 明确要求，否则不要改 `cloudfunctions/`。
- 设计系统仍应是平台级底座：小程序走 `miniprogram/styles/tokens.wxss` + `miniprogram/styles/common.wxss` + `miniprogram/components/ui/`；管理端走 `admin-web/src/theme.ts` + `ConfigProvider` + 公共组件。
- 微信绿 `#07c160` 只允许用于微信登录按钮或微信品牌标识，不要作为平台主色。
- 不要在页面里散写主色；新增颜色必须先进入 token，再由页面使用 token 或公共 class。
- 全局 `letter-spacing` 保持 `0`，不要用负字距压缩中文或数字。
- 不要用可爱 emoji 充当核心 UI 图标。允许使用简单中文/英文字符、CSS 图形或现有图标库；管理端优先使用已有 `@ant-design/icons`。
- 卡片可更有层次，但不要出现卡片套卡片、文字重叠、按钮文字溢出。

## 5. 当前代码入口

- 小程序项目配置：`project.config.json`，appid 为 `wx1654159e6e3bb334`，`miniprogramRoot` 为 `miniprogram/`。
- 小程序全局页面和标题：`miniprogram/app.json`。
- 小程序 token：`miniprogram/styles/tokens.wxss`。
- 小程序通用样式：`miniprogram/styles/common.wxss`。
- 小程序页面壳组件：`miniprogram/components/ui/ui-page/`。
- 小程序底部导航：`miniprogram/custom-tab-bar/`。
- 首页：`miniprogram/pages/index/`。
- 我的页：`miniprogram/pages/profile/`。
- 其他小程序页面：`recharge`、`orders`、`transactions`、`usage-records`、`tools/demo-sum`、`apps/ai_draw`。
- 新应用模板：`templates/app_vertical_slice/`。
- 管理端主题：`admin-web/src/theme.ts`。
- 管理端外壳：`admin-web/src/App.tsx`。
- 管理端登录页：`admin-web/src/pages/LoginPage.tsx`。
- 管理端公共组件：`admin-web/src/components/`。
- 设计系统文档：`docs/design_system.md`。

## 6. 运行环境与命令

项目根目录：

```bash
/Users/huli-dev/Documents/huli-tools
```

管理端依赖与构建：

```bash
npm --prefix admin-web install
npm --prefix admin-web run lint
npm --prefix admin-web run build
npm --prefix admin-web run dev -- --host 127.0.0.1
```

管理端 `.env.example` 当前约定：

```bash
VITE_CLOUDBASE_ENV_ID=cloudbase-3gphz7fk0fe1b760
VITE_CLOUDBASE_ADMIN_FUNCTION=adminCore
VITE_WECHAT_LOGIN_ENABLED=false
VITE_WECHAT_PROVIDER_ID=wx_open
```

小程序静态与边界 gate：

```bash
bash scripts/check-js.sh
bash scripts/check-boundaries.sh
bash scripts/check-admin-web-boundaries.sh
git diff --check
```

小程序扫码预览可用本地上传密钥生成，密钥文件只允许作为本地参数使用，不得提交或打印内容：

```bash
NODE_OPTIONS=--no-experimental-webstorage npx -y miniprogram-ci preview \
  --appid wx1654159e6e3bb334 \
  --project-path /Users/huli-dev/Documents/huli-tools \
  --private-key-path /Users/huli-dev/Documents/huli-tools/private.wx1654159e6e3bb334.key \
  --use-project-config \
  --upload-version dopamine-ui-preview \
  --threads 0 \
  --qrcode-format image \
  --qrcode-output-dest /tmp/huli-tools-dopamine-ui-preview.png
```

扫码预览要求：扫码微信号需要是该小程序开发者或体验成员。

## 7. 跨阶段规则

- 每个 phase 开始前必须读本文件、自己的 phase prompt、`AGENTS.md` 和当前代码。
- 每个 phase 都必须保持仓库可运行；不能把一半 token 名称改完后留下未引用变量。
- 前序 phase 已落地的 token 和组件应被后续 phase 复用，不要重新发明第二套色板。
- 涉及 `AGENTS.md`、`docs/design_system.md`、`admin-web/README.md` 或测试文档时，只写长期事实，不堆临时过程。
- 如果发现当前代码和本 spec 有冲突，以用户明确目标优先，但要在交接说明中记录。
- 视觉验收以手机截图/微信预览优先；如果只能本地静态验证，要明确说明缺少真机预览。

## 8. 非目标

- 不做支付、积分、订单、AI 绘图逻辑调整。
- 不新增应用、collection 或云函数。
- 不改变 CloudBase 环境、登录 provider、管理员白名单或密钥配置。
- 不部署线上静态站点；本次只要求本地构建、预览二维码和代码提交前验证。

## 9. 必交付

- 小程序柔彩 token、首页、底部导航、全页面视觉统一。
- 管理端柔彩 theme 和主要页面同步。
- `docs/design_system.md`、`AGENTS.md`、`admin-web/README.md` 中过时设计系统说明更新。
- 本 prompt pack 的测试用例可被 coding Agent 用于最终验收。
- 最终交接中列出验证命令、二维码路径、管理端本地地址和剩余风险。

## 10. 未决问题

- 无需继续询问用户。本次用户已锁定：小程序 + 管理端、柔和彩色、大号浮动胶囊。
