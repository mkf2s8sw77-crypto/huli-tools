# huli-tools 设计系统 v4.1 — 清透活力 · Bento 工具墙

> 调性转向说明：从 v3「自然疗愈」（土褐米黄）推倒重建为 v4.1「清透活力」。核心变化：**信息架构重构**——积分从首页 hero 后置为顶栏胶囊，首页改为 Bento 彩色磁贴工具墙；**品牌回归**——启用沪里 logo 活力紫 `#7C5CFC` 作为主色。功能、接口、数据全部不变。
> 高保真预览：`tmp-preview/design-system-v4-1.html`（截图 `v4-1-*.png`）。

## 1. 视觉方向

**护理人的 AI 工具箱**——冷白带紫调底色 + 品牌紫渐变 + 每个应用一块有主题的彩色磁贴。年轻、清爽、有辨识度，工作场景不突兀。

- **首页即工具**：用户来用工具，不是来看余额。首页无积分 hero、无快捷入口行；应用以 Bento 磁贴呈现（主打应用占大格）。
- **积分后置**：首页顶栏右侧小积分胶囊（点击进充值页）；积分大卡与充值入口收纳在「我的」账户中心。
- **低频功能归位**：订单/流水/使用记录全部在「我的」。
- Logo 使用 `miniprogram/assets/images/huli-tech-logo.png` / `admin-web/src/assets/huli-tech-logo.png`，展示必须圆角裁切。

## 2. 设计 Token

### 2.1 颜色

| 用途 | Token | 值 | 说明 |
|---|---|---|---|
| 主色 | `--color-primary` | `#7C5CFC` | 活力紫（沪里 logo 色），可交互元素 |
| 主色-深 | `--color-primary-deep` | `#6D3FE8` | 按下/选中文字 |
| 主色-亮阶 | `--color-primary-bright` | `#9F7BFA` | 渐变终点 |
| 主色-浅阶 | `--color-primary-light2` | `#B893F6` | 渐变/高亮 |
| 主色-淡底 | `--color-primary-light` | `#F0EDFA` | 选中态、图标砖底 |
| 主色渐变 | — | `linear-gradient(135deg,#7C5CFC,#9F7BFA)` | 主按钮、账户 hero |
| 强调 | `--color-accent-warm` | `#FF7A59` | 珊瑚橙：价格、推荐角标 |
| 强调-淡底 | `--color-accent-warm-light` | `#FFE9E2` | 价格胶囊底 |
| 成功 | `--color-success` | `#0DA593` | 免费、成功 |
| 成功-淡底 | `--color-success-light` | `#D6F4F1` | |
| 警告 | `--color-warning` | `#B8904A` | |
| 警告-淡底 | `--color-warning-light` | `#F0E5C8` | |
| 危险 | `--color-danger` | `#E8563A` | 失败、错误 |
| 危险-淡底 | `--color-danger-light` | `#FFE9E2` | |
| 文字-主 | `--color-text` | `#18142A` | |
| 文字-次 | `--color-text-secondary` | `#5A5468` | |
| 文字-弱 | `--color-text-muted` | `#9A93B0` | |
| 背景 | `--color-bg` | `#F6F5FA` | 页面底色（冷白带紫调） |
| 表面 | `--color-surface` | `#FFFFFF` | 卡片 |
| 边框 | `--color-border` | `#EEEAF7` | |
| 边框-柔 | `--color-border-soft` | `#F4F1FA` | |
| 价格 | `--color-price` | `#FF7A59` | |
| 积分 | `--color-points` | `#6D3FE8` | |
| 微信绿 | — | `#07c160` | 仅微信登录按钮与微信品牌标识 |

### 2.2 应用磁贴主题色

| 应用 | 渐变 | 说明 |
|---|---|---|
| 定妆照 ai_draw | `linear-gradient(150deg,#7C5CFC,#B458E8 55%,#E05FA8)` | 紫粉，主打大格 |
| 卧底 nursing_undercover | `linear-gradient(150deg,#4F46E5,#6366F1 60%,#8B7CF6)` | 靛蓝 |
| MAIC maic | `linear-gradient(150deg,#0DA593,#14B8A6 60%,#3ED0BC)` | 青绿 |
| 默认/示例 | 白底 + `#D9D2EC` 虚线边框 | 占位/更多工具 |

磁贴内图形符号为半透明白色（opacity 0.22）右下角放大装饰图形；价格胶囊为白底（92% 透明）+ 主题色文字，免费款青色文字。

### 2.3 字号（小程序 rpx）

| 用途 | 值 |
|---|---|
| slogan 主标题 | `48rpx` / `font-weight: 800` |
| 页面/区域标题 | `32-34rpx` / `font-weight: 800` |
| 磁贴名称 | `36rpx` / `font-weight: 800` |
| 正文 | `28-30rpx` |
| 辅助/标签 | `24-26rpx` |
| 大数值（积分、价格） | `44-92rpx` / `font-weight: 800` / `font-variant-numeric: tabular-nums` |

不使用衬线字体（v3 的 Noto Serif SC 体系已移除），`letter-spacing` 保持 0。

### 2.4 间距与圆角

| Token | 值 |
|---|---|
| `--spacing-xs/sm/md/lg/xl` | `8/16/24/32/48rpx` |
| `--radius-md` | `14px`（按钮/输入框） |
| `--radius-lg` | `20px`（卡片/菜单卡） |
| `--radius-tile` | `22px`（Bento 磁贴/账户 hero） |
| `--radius-pill` | `999px`（胶囊/tabbar） |

卡片阴影 `0 6px 18px rgba(60,40,110,0.05)`；磁贴阴影为主题色 30% 透明投影（如 `0 14px 34px rgba(124,92,252,0.35)`）。

## 3. 页面骨架

### 3.1 首页（Bento 工具墙）

1. 顶栏：品牌 logo（圆角）+「huli 工具箱」，右侧积分胶囊（闪电符号 + 可用积分，点击进充值页）。
2. slogan 区：「护理人的 AI 工具箱」+ 副标题「挑个工具，直接开工」。
3. Bento 磁贴区：CSS grid 两列；主打应用（定妆照）`grid-row: span 2` 占两行高，其余应用各占一格；底部一块 `grid-column: span 2` 的虚线「更多护理工具」占位砖。
4. 磁贴点击即应用入口；`status !== "active"` 沿用 toast 提示。
5. 不再有积分 hero、quick-nav（充值/订单/流水/记录从首页移除）。

### 3.2 我的（账户中心）

1. 账户 hero：品牌紫渐变，可用积分大数字 + 右侧白色「充值」胶囊按钮，下方累计充值/累计消费。
2. id 条：logo + 脱敏 openid。
3. 「账户管理」菜单卡：积分充值/我的订单/积分流水/使用记录（图标砖 + 文字 + ›）。

### 3.3 充值页

- 标题「为账户补充积分」+ 副标题；套餐卡：名称 + 珊瑚橙大价格 + 基础/赠送/到账总计行 + 品牌紫渐变「立即充值」按钮；推荐套餐右上角「推荐」角标；底部「查看我的订单」链接卡。

### 3.4 应用执行页

- 仅换壳（token 对齐），任务流程布局不变。

### 3.5 tabbar

- 两个 tab：「工具」（四宫格线框图标，对应 `pages/index/index`）、「我的」（小人像）。选中 `#6D3FE8`，未选 `#9A93B0`。
- 悬浮白胶囊：左右 32rpx 边距、圆角 44rpx、毛玻璃 `rgba(255,255,255,0.94)` + 阴影。

## 4. 管理端 admin-web

- 仅 token 级对齐：`admin-web/src/theme.ts` 主色 `#7C5CFC`、侧栏深紫灰 `#3D3656`、菜单选中 `rgba(124,92,252,0.28)`、背景 `#F6F5FA`。组件结构与页面布局不变。

## 5. 禁忌

- 不得回退到土褐/米黄体系（v3）或彩虹多巴胺体系（v2）。
- 不得硬编码色值，必须使用 token 变量。
- 业务结果展示区允许应用自定义，但颜色必须来自 token。
- 不引入外部图片/字体资源（磁贴图形符号用 CSS/半透明几何实现）。
