# LLM Prompt huli-tools-dopamine-ui Phase 3/3

## 阶段目标

同步管理端柔彩主题，更新长期设计文档与验收资料，完成最终构建、浏览器预览和小程序扫码预览收口。

## 本阶段输入

- 必读总文档：`master_spec_huli-tools-dopamine-ui_0604.md`
- 可参考测试文档：`test_case_huli-tools-dopamine-ui_0604.md`
- 已完成前序阶段：Phase 1/2 已完成小程序柔彩 token、首页、tabbar、全页面和模板统一。
- 当前代码现状：管理端使用 `admin-web/src/theme.ts` 注入 Ant Design 主题，外壳在 `admin-web/src/App.tsx`，登录页在 `admin-web/src/pages/LoginPage.tsx`，公共组件在 `admin-web/src/components/`。

## 任务清单

1. 同步管理端柔彩 token：
   - 更新 `admin-web/src/theme.ts` 的 `adminThemeTokens` / `adminThemeGradients`，与小程序柔彩方向一致。
   - 保持后台可读性：表格、表单、侧栏、按钮、状态标签不能因为柔彩导致对比度不足。
   - 微信绿仍只用于微信登录按钮。

2. 改造管理端主要视觉面：
   - `App.tsx`：侧栏、顶栏、内容区背景、品牌标识同步柔彩但保持管理工具气质。
   - `LoginPage.tsx`：登录卡片背景与品牌标识同步柔彩。
   - `PageHeader`、`StatCard`、`StatusTag`、`FilterBar`、`LoadingState`、`ErrorState` 如有旧色值，收口到 theme token。
   - Dashboard 和表格页检查卡片、表头、状态标签的柔彩一致性。

3. 更新文档和长期规则：
   - `docs/design_system.md`：把 v2 方向改为“柔彩多巴胺工具平台”，记录小程序与管理端 token、tabbar 尺寸、禁止事项。
   - `AGENTS.md`：只更新长期设计系统事实，保持 200 行以内。
   - `admin-web/README.md`：更新管理端设计系统说明，不要继续写旧主色 `#2b6cb0`。
   - 如模板 README 中仍有旧设计描述，更新为柔彩设计系统。

4. 最终验证与预览：
   - 跑完整 gate。
   - 启动管理端本地预览，用浏览器检查登录页和至少 Dashboard shell；控制台无 error/warning。
   - 生成小程序二维码到 `/tmp/huli-tools-dopamine-ui-final.png`。
   - 最终交接说明写清二维码路径、管理端本地 URL、验证命令和任何未覆盖项。

## 范围边界

- 要做：管理端视觉同步、文档更新、最终验收。
- 不要做：不要调整管理端登录流程、CloudBase Auth 逻辑、API 参数或管理员权限模型。
- 不要真实部署 CloudBase 静态托管或上传体验版；只生成预览二维码和本地构建。

## 实现约束

- 重点目录 / 文件：
  - `admin-web/src/theme.ts`
  - `admin-web/src/App.tsx`
  - `admin-web/src/pages/LoginPage.tsx`
  - `admin-web/src/components/`
  - `docs/design_system.md`
  - `AGENTS.md`
  - `admin-web/README.md`
  - `templates/app_vertical_slice/README.md`
- 管理端可以使用 Ant Design 现有能力和 `@ant-design/icons`，不要引入新的 UI 库。
- 若使用浏览器截图或 Playwright 产生临时文件，不能提交 `.playwright-mcp/`、截图或构建产物。

## 验证要求

必须运行：

```bash
bash scripts/check-js.sh
bash scripts/check-boundaries.sh
bash scripts/check-admin-web-boundaries.sh
npm --prefix admin-web run lint
npm --prefix admin-web run build
git diff --check
```

管理端本地预览：

```bash
npm --prefix admin-web run dev -- --host 127.0.0.1
```

访问 `http://127.0.0.1:60530/`，检查登录页首屏和控制台。结束时关闭 dev server。

小程序最终二维码：

```bash
NODE_OPTIONS=--no-experimental-webstorage npx -y miniprogram-ci preview \
  --appid wx1654159e6e3bb334 \
  --project-path /Users/huli-dev/Documents/huli-tools \
  --private-key-path /Users/huli-dev/Documents/huli-tools/private.wx1654159e6e3bb334.key \
  --use-project-config \
  --upload-version dopamine-ui-final \
  --threads 0 \
  --qrcode-format image \
  --qrcode-output-dest /tmp/huli-tools-dopamine-ui-final.png
```

## 交接说明

最终回复必须包含：

- 主要改动摘要。
- 完整验证命令结果。
- 小程序二维码路径。
- 管理端本地预览 URL 和检查结果。
- 是否存在 Vite 大 chunk 等非阻塞 warning。
- `git status --short --branch` 是否干净；如果用户要求提交，再另行调用 `github-cnp`。
