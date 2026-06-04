# Test Cases: huli-tools-dopamine-ui

## 1. 测试环境

- 仓库路径：`/Users/huli-dev/Documents/huli-tools`
- 小程序 appid：`wx1654159e6e3bb334`
- 小程序启动方式：微信开发者工具打开仓库根目录，或使用 `miniprogram-ci preview` 生成二维码。
- 小程序扫码权限：扫码微信号必须是该小程序开发者或体验成员。
- 小程序上传密钥：本地文件 `/Users/huli-dev/Documents/huli-tools/private.wx1654159e6e3bb334.key`，只可作为命令参数使用，不得提交或打印内容。
- 管理端启动方式：`npm --prefix admin-web run dev -- --host 127.0.0.1`
- 管理端访问地址：`http://127.0.0.1:60530/`
- 管理端环境变量：如需本地登录，复制 `admin-web/.env.example` 为 `.env`；视觉检查可只看登录页。
- 数据准备：本次为视觉调整，不需要 seed/reset；若扫码后接口报错，优先确认云函数和集合是否已部署，但这不是本次视觉验收失败的直接原因。

## 2. 自动验证命令

```bash
bash scripts/check-js.sh
bash scripts/check-boundaries.sh
bash scripts/check-admin-web-boundaries.sh
npm --prefix admin-web run lint
npm --prefix admin-web run build
git diff --check
```

小程序二维码生成：

```bash
NODE_OPTIONS=--no-experimental-webstorage npx -y miniprogram-ci preview \
  --appid wx1654159e6e3bb334 \
  --project-path /Users/huli-dev/Documents/huli-tools \
  --private-key-path /Users/huli-dev/Documents/huli-tools/private.wx1654159e6e3bb334.key \
  --use-project-config \
  --upload-version dopamine-ui-test \
  --threads 0 \
  --qrcode-format image \
  --qrcode-output-dest /tmp/huli-tools-dopamine-ui-test.png
```

## 3. 冒烟用例

### TC-01 小程序品牌文案
- 目标：确认全局标题和首页 hero 不再重复品牌。
- 前置条件：完成 Phase 1 后生成二维码或打开微信开发者工具预览。
- 步骤：
  1. 打开小程序首页。
  2. 查看顶部微信导航栏标题。
  3. 查看首页第一屏 hero/标题区域。
- 断言：
  - 导航栏标题是 `huli-tools`。
  - 首页不出现“沪里工具平台 / 沪里工具”这组重复文案。
  - 首页第一屏主要信息是积分卡、快捷入口、应用目录。

### TC-02 小程序大号浮动胶囊导航
- 目标：确认底部导航易点、视觉不临时。
- 前置条件：完成 Phase 1 后预览首页。
- 步骤：
  1. 查看底部“首页 / 我的”导航。
  2. 点击“我的”，再点击“首页”。
  3. 观察选中态和页面底部内容。
- 断言：
  - 导航仍为浮动胶囊，但明显比旧版更大。
  - 单项点击区域不低于 `96rpx` 高。
  - 有图标/符号 + 文字。
  - 页面切换正常，没有内容被导航遮挡。

### TC-03 小程序柔彩首页
- 目标：确认首页柔和彩色且可读。
- 前置条件：完成 Phase 1。
- 步骤：
  1. 查看积分卡、四个快捷入口、应用目录卡片。
  2. 对比旧版深蓝青截图。
- 断言：
  - 大面积深蓝青不再主导第一屏。
  - 有薄荷青、晴空蓝、桃粉、柠檬黄、珊瑚橙、薰衣草紫等柔彩层次。
  - 文本对比度足够，数字和按钮不溢出。

### TC-04 小程序全页面一致性
- 目标：确认 Phase 2 后所有页面都进入同一柔彩体系。
- 前置条件：完成 Phase 2。
- 步骤：
  1. 依次进入：首页、我的、充值、订单、积分流水、使用记录、积分示例工具、AI 绘图。
  2. 检查加载、空状态、错误状态可通过手工模拟或代码路径静态确认。
- 断言：
  - 页面色彩、卡片、按钮、状态标签风格统一。
  - 页面底部不被大号 tabbar 遮挡。
  - 订单号、金额、时间、状态等信息仍清晰。
  - demo-sum 和 AI 绘图表单/按钮/结果区无布局重叠。

### TC-05 新应用模板
- 目标：确认后续新应用默认继承柔彩体系。
- 前置条件：完成 Phase 2。
- 步骤：
  1. 查看 `templates/app_vertical_slice/miniprogram/pages/apps/__appKey__/`。
  2. 查看模板 README。
- 断言：
  - 模板使用 `ui-page`、`ui-card`、`ui-form-field`、`ui-action-button` 等公共组件。
  - 模板颜色使用 token，不散写主色。
  - README 说明新应用必须接入柔彩设计系统。

### TC-06 管理端登录页
- 目标：确认管理端同步柔彩但保持专业可读。
- 前置条件：完成 Phase 3；运行 `npm --prefix admin-web run dev -- --host 127.0.0.1`。
- 步骤：
  1. 打开 `http://127.0.0.1:60530/`。
  2. 查看登录页卡片、背景、品牌标识和按钮。
  3. 检查浏览器控制台。
- 断言：
  - 登录页使用柔彩主题，不再是旧深蓝青主导。
  - 输入框、按钮文字清晰。
  - 控制台无 error/warning。

### TC-07 管理端主界面
- 目标：确认后台布局、表格和状态标签可读。
- 前置条件：有可登录的 CloudBase Auth 管理账号；若没有账号，至少完成代码静态和构建检查。
- 步骤：
  1. 登录管理端。
  2. 查看 Dashboard、用户、应用、充值包、订单、使用记录、审计日志页面。
- 断言：
  - 侧栏、顶栏、内容卡片使用柔彩体系。
  - 表格表头、筛选栏、状态标签对比度足够。
  - `admin-web/src` 没有直连业务集合或暴露敏感密钥。

## 4. 人工检查项

- 手机截图中导航标题、首页 hero、底部 tabbar 与用户反馈逐项对齐。
- 柔彩不等于强烈糖果色：整体应清爽、轻快、可读。
- 不出现卡片套卡片、文字遮挡、按钮内容溢出。
- 小程序和管理端都没有把微信绿当作平台色。
- 临时文件不提交：`.playwright-mcp/`、截图、`admin-web/dist/`、二维码图片。

## 5. 缺陷记录规则

每个失败用例都记录：现象、复现步骤、期望、日志或截图位置。视觉缺陷必须附手机截图或浏览器截图，并标注页面路径。
