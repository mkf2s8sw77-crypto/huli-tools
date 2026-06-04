# LLM Prompt huli-tools-dopamine-ui Phase 2/3

## 阶段目标

把 Phase 1 建立的柔彩小程序视觉扩展到所有小程序页面、公共组件和新应用竖切模板，确保扫码预览时不是只有首页变好看。

## 本阶段输入

- 必读总文档：`master_spec_huli-tools-dopamine-ui_0604.md`
- 可参考测试文档：`test_case_huli-tools-dopamine-ui_0604.md`
- 已完成前序阶段：Phase 1 已更新小程序全局标题、柔彩 token、首页和大号浮动胶囊导航。
- 当前代码现状：小程序页面包括 `profile`、`recharge`、`orders`、`transactions`、`usage-records`、`tools/demo-sum`、`apps/ai_draw`，新应用模板在 `templates/app_vertical_slice/`。

## 任务清单

1. 统一公共组件柔彩表现：
   - 检查 `ui-card`、`ui-section`、`ui-price`、`ui-status`、`ui-empty`、`ui-error`、`ui-action-button`、`ui-form-field` 是否仍残留深蓝青旧视觉。
   - 状态标签、价格/积分、按钮、表单字段都必须通过 token 表达，不要页面级散写颜色。
   - 保持文字可读性，柔彩只作为背景、图标、强调和渐变，不要让正文变浅。

2. 改造“我的”页面：
   - 账户积分卡使用柔彩渐变，与首页积分卡同一语言但不完全复制。
   - 菜单 icon 使用不同柔彩变体，提高层次。
   - 保持 openid 脱敏显示、积分字段和跳转逻辑不变。

3. 改造信息列表页面：
   - 充值、订单、积分流水、使用记录页面卡片统一柔彩侧边/顶部细节。
   - 卡片内容仍以信息扫描为主，不要为了装饰影响订单号、金额、时间、状态标签阅读。
   - 加载、空状态、错误状态使用柔彩公共组件。

4. 改造应用执行页：
   - `demo-sum` 和 `ai_draw` 使用统一“应用执行页”模式：柔彩应用头、表单卡、主按钮、结果区、错误区。
   - 不改业务 JS 逻辑，不改调用云函数参数，不改积分扣费链路。

5. 更新新应用模板：
   - `templates/app_vertical_slice/miniprogram/pages/apps/__appKey__/` 的 wxml/wxss 与柔彩设计系统一致。
   - 模板 README 中说明新应用必须复用柔彩 token、公共组件和大号主按钮。

## 范围边界

- 要做：小程序所有现有页面、公共组件、小程序模板的视觉一致性。
- 不要做：不要修改云函数、数据库、积分/支付规则；不要改 admin-web。
- 不要只追求颜色变多；重点是统一、可点、可读、移动端无遮挡。

## 实现约束

- 重点目录 / 文件：
  - `miniprogram/components/ui/`
  - `miniprogram/styles/common.wxss`
  - `miniprogram/pages/profile/`
  - `miniprogram/pages/recharge/`
  - `miniprogram/pages/orders/`
  - `miniprogram/pages/transactions/`
  - `miniprogram/pages/usage-records/`
  - `miniprogram/pages/tools/demo-sum/`
  - `miniprogram/pages/apps/ai_draw/`
  - `templates/app_vertical_slice/`
- 如果发现多个页面重复相同柔彩卡片样式，优先抽到 `common.wxss`，不要在每页复制。
- 禁止引入图片、远程资源或大型组件库。

## 验证要求

至少运行：

```bash
bash scripts/check-js.sh
bash scripts/check-boundaries.sh
git diff --check
```

建议生成二维码：

```bash
NODE_OPTIONS=--no-experimental-webstorage npx -y miniprogram-ci preview \
  --appid wx1654159e6e3bb334 \
  --project-path /Users/huli-dev/Documents/huli-tools \
  --private-key-path /Users/huli-dev/Documents/huli-tools/private.wx1654159e6e3bb334.key \
  --use-project-config \
  --upload-version dopamine-ui-p2 \
  --threads 0 \
  --qrcode-format image \
  --qrcode-output-dest /tmp/huli-tools-dopamine-ui-p2.png
```

人工检查：

- 首页、我的、充值、订单、流水、使用记录、demo-sum、AI 绘图都符合柔彩体系。
- 所有页面底部内容不被大号浮动 tabbar 遮挡。
- 列表卡片中订单号、金额、状态、时间不因彩色背景降低可读性。
- 应用执行页按钮、输入框、结果区没有布局跳动或文字溢出。

## 交接说明

- 给下一阶段说明小程序最终 token 和组件规则。
- 记录哪些文档仍需更新，例如 `docs/design_system.md`、`AGENTS.md`、模板 README。
