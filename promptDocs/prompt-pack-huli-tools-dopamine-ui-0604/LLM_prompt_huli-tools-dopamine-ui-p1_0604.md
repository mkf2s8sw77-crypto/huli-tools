# LLM Prompt huli-tools-dopamine-ui Phase 1/3

## 阶段目标

完成小程序端最小可见的柔彩多巴胺 MVP：全局标题改为 `huli-tools`，首页去掉重复品牌文案，首页首屏改为柔彩视觉，底部导航升级为大号浮动胶囊并显著提高点击区域。

## 本阶段输入

- 必读总文档：`master_spec_huli-tools-dopamine-ui_0604.md`
- 可参考测试文档：`test_case_huli-tools-dopamine-ui_0604.md`
- 用户核心反馈：截图中“沪里工具平台 / 沪里工具”重复；全局标题要叫 `huli-tools`；底部“首页 / 我的”太小且难点；配色要柔和彩色。
- 当前代码现状：小程序全局配置在 `miniprogram/app.json`；首页是 `miniprogram/pages/index/`；底部导航是 `miniprogram/custom-tab-bar/`；小程序 token 在 `miniprogram/styles/tokens.wxss`。

## 任务清单

1. 更新小程序全局标题：
   - `miniprogram/app.json` 的 `navigationBarTitleText` 改为 `huli-tools`。
   - 如需调整 `navigationBarBackgroundColor`，必须来自新柔彩 token 中的主色取值，并同步文档；不能继续沿用沉重深蓝作为唯一品牌色。

2. 建立小程序柔彩 token 基础：
   - 在 `miniprogram/styles/tokens.wxss` 中把现有深蓝青主导色板调整为柔彩多巴胺色板。
   - 推荐方向：薄荷青、晴空蓝、桃粉、柠檬黄、珊瑚橙、薰衣草紫；背景为浅彩渐变，正文仍用稳定深色。
   - 保留语义 token 名称体系，例如 `--color-primary`、`--color-brand-soft`、`--color-accent-warm`、`--color-success`、`--color-danger`、`--gradient-*`，减少下游页面迁移成本。

3. 改造首页首屏：
   - `miniprogram/pages/index/index.wxml` 不再传 `eyebrow="沪里工具平台"`。
   - 首页 title 不再显示“沪里工具”。可选择让 `ui-page` 在 `dashboard` 模式无 title，或把标题改成轻量功能型文案，但不能重复品牌。
   - 积分卡、快捷入口、应用目录首屏使用新柔彩 token，避免大面积深蓝。
   - 快捷入口四个图标使用不同柔彩变体，避免蓝绿重复。

4. 升级底部导航：
   - 保留 `miniprogram/custom-tab-bar/` 的自定义 tabbar。
   - 继续保持“大号浮动胶囊”形态，但放大整体尺寸和单项点击热区。
   - 每项至少包含图标/符号 + 文本；首页和我的都要易扫、易点。
   - 同步调整 `ui-page` 或全局页面底部 padding，避免新 tabbar 遮挡内容。

## 范围边界

- 要做：小程序 token、首页、`ui-page` 必要能力、底部 tabbar。
- 不要做：本阶段不要改充值/订单/流水/使用记录/demo-sum/AI 绘图等页面细节；不要改管理端；不要改云函数。
- 不要把微信绿用于平台主色；不要新增远程图片或装饰素材。

## 实现约束

- 重点目录 / 文件：
  - `miniprogram/app.json`
  - `miniprogram/styles/tokens.wxss`
  - `miniprogram/styles/common.wxss`
  - `miniprogram/components/ui/ui-page/`
  - `miniprogram/custom-tab-bar/`
  - `miniprogram/pages/index/`
- 如果给 `ui-page` 增加无标题/compact/dashboard 变体，必须保持其他页面现有调用不破坏。
- 使用 CSS 变量和公共 class；不要在首页散写大量不可复用色值。

## 验证要求

至少运行：

```bash
bash scripts/check-js.sh
bash scripts/check-boundaries.sh
git diff --check
```

建议额外运行：

```bash
NODE_OPTIONS=--no-experimental-webstorage npx -y miniprogram-ci preview \
  --appid wx1654159e6e3bb334 \
  --project-path /Users/huli-dev/Documents/huli-tools \
  --private-key-path /Users/huli-dev/Documents/huli-tools/private.wx1654159e6e3bb334.key \
  --use-project-config \
  --upload-version dopamine-ui-p1 \
  --threads 0 \
  --qrcode-format image \
  --qrcode-output-dest /tmp/huli-tools-dopamine-ui-p1.png
```

人工检查：

- 微信导航栏标题为 `huli-tools`。
- 首页第一屏不再重复“沪里工具平台 / 沪里工具”。
- 底部导航比原先明显更大，单项点击区不低于 `96rpx` 高。
- 首页没有文字重叠、按钮溢出或底部内容被 tabbar 遮挡。

## 交接说明

- 给下一阶段说明新 token 名称、tabbar 尺寸、`ui-page` 行为变更。
- 如果未能生成二维码，记录失败原因和已完成的静态验证命令。
