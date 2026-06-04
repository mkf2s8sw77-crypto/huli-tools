# huli-tools 设计系统 — 柔彩多巴胺

> 定义平台视觉语言、设计 Token、组件使用边界和应用自由度。小程序端和管理端共用此文档。

## 1. 视觉方向

**柔彩多巴胺工具平台**——以晴空蓝为主色传递信任感，薄荷青、桃粉、珊瑚橙、薰衣草紫、柠檬黄等柔和彩色带来轻快多巴胺层次。页面背景使用淡紫灰暖渐变，卡片分层呈现（描边 + 柔阴影 + 顶部彩虹高光线）。品牌符号使用 CSS-only 彩虹渐变圆形徽标，不新增图片依赖。微信导航栏采用暖灰底 + 黑色文字标题 `huli-tools`，与柔彩氛围一致。

## 2. 设计 Token

### 2.1 颜色

| 用途 | Token | 值 | 说明 |
|---|---|---|---|
| 主色 | `--color-primary` | `#5E95C8` | 晴空蓝，品牌/可交互元素 |
| 主色-悬停 | `--color-primary-hover` | `#4E85B8` | 按钮 hover |
| 主色-亮阶 | `--color-primary-bright` | `#82B5E0` | 主色渐变终点 |
| 主色-淡底 | `--color-primary-light` | `#EDF4FB` | 选中态、高亮背景 |
| 主色-反白文字 | `--color-on-primary` | `#ffffff` | 主色/深色背景上的文字 |
| 品牌柔色 | `--color-brand-soft` | `#5EBCB0` | 薄荷青，关怀辅助色 |
| 品牌柔色-亮阶 | `--color-brand-soft-bright` | `#7ED1C6` | 柔色渐变终点 |
| 品牌柔色-淡底 | `--color-brand-soft-light` | `#EBF7F5` | 柔色卡片/标签背景 |
| 暖调强调 | `--color-accent-warm` | `#E8956B` | 珊瑚橙，价格/积分提示 |
| 暖调强调-亮阶 | `--color-accent-warm-bright` | `#F0B08E` | 暖调渐变终点 |
| 暖调强调-淡底 | `--color-accent-warm-light` | `#FDF0E8` | 暖调标签底色 |
| 桃粉 | `--color-peach` | `#F0A8B2` | 多巴胺扩展色 |
| 桃粉-淡底 | `--color-peach-light` | `#FDF0F2` | |
| 柠檬 | `--color-lemon` | `#E8C84A` | 多巴胺扩展色 |
| 柠檬-淡底 | `--color-lemon-light` | `#FEF8E6` | |
| 薰衣草 | `--color-lavender` | `#B6A8D8` | 多巴胺扩展色 |
| 薰衣草-淡底 | `--color-lavender-light` | `#F2F0F8` | |
| 成功 | `--color-success` | `#4CAF82` | 支付成功、已完成 |
| 成功-淡底 | `--color-success-light` | `#EAF6EF` | |
| 警告 | `--color-warning` | `#E8A84C` | 待支付、冻结中 |
| 警告-淡底 | `--color-warning-light` | `#FEF5E8` | |
| 危险 | `--color-danger` | `#E06B6B` | 失败、错误 |
| 危险-淡底 | `--color-danger-light` | `#FDEDED` | |
| 文字-主 | `--color-text` | `#2D3748` | 标题、正文 |
| 文字-次 | `--color-text-secondary` | `#5A6B7D` | 标签、辅助说明 |
| 文字-弱 | `--color-text-muted` | `#8D99A8` | 时间戳、空状态 |
| 背景 | `--color-bg` | `#F5F3F0` | 暖灰页面底色 |
| 表面 | `--color-surface` | `#F8F6F3` | 输入框背景等 |
| 表面-高 | `--color-surface-elevated` | `#ffffff` | |
| 卡片背景 | `--color-bg-card` | `#ffffff` | 卡片、弹窗 |
| 边框 | `--color-border` | `#E8E3DE` | 卡片边框、分隔线 |
| 边框-柔 | `--color-border-soft` | `#F0ECE8` | 更轻的分隔 |
| 价格/金额 | `--color-price` | `#E8956B` | |
| 积分 | `--color-points` | `#5E95C8` | |
| 微信绿 | — | `#07c160` | 仅用于微信登录按钮和微信品牌标识 |

### 2.2 字号（小程序 rpx）

| 用途 | 值 |
|---|---|
| 页面标题 | 36rpx / font-weight 700 |
| 卡片/区域标题 | 30rpx / font-weight 600 |
| 正文 | 28rpx |
| 辅助/标签 | 26rpx |
| 小字/时间戳 | 24rpx / 22rpx |
| 大数值（积分、价格） | 44rpx–80rpx / font-weight 700 |

全局 `letter-spacing` 保持 `0`。

### 2.3 间距与圆角

| Token | 值 | 说明 |
|---|---|---|
| `--spacing-xs` | 8rpx | |
| `--spacing-sm` | 16rpx | |
| `--spacing-md` | 24rpx | |
| `--spacing-lg` | 32rpx | |
| `--spacing-xl` | 48rpx | |
| `--radius-sm` | 8rpx | 标签/小控件 |
| `--radius-md` | 12rpx | 按钮/输入框 |
| `--radius-lg` | 20rpx | 卡片 |
| `--radius-xl` | 28rpx | 积分卡等突出区域 |
| `--radius-pill` | 999rpx | 胶囊标签/tabbar |

### 2.4 阴影

| Token | 值 | 用途 |
|---|---|---|
| `--shadow-soft` | `0 2rpx 16rpx rgba(0,0,0,0.04), 0 1rpx 4rpx rgba(0,0,0,0.02)` | 轻量元素 |
| `--shadow-card` | `0 4rpx 24rpx rgba(0,0,0,0.05), 0 1rpx 6rpx rgba(0,0,0,0.02)` | 标准卡片 |
| `--shadow-elevated` | `0 8rpx 40rpx rgba(0,0,0,0.07), 0 2rpx 8rpx rgba(0,0,0,0.03)` | 结果卡/浮层 |

### 2.5 页面渐变

- `--page-gradient`: `linear-gradient(180deg, #EDE8F5 0%, #F5F3F0 320rpx, #F8F6F3 100%)` — 淡紫灰暖渐变。
- `--gradient-primary`: 晴空蓝主操作按钮、蓝色应用图标。
- `--gradient-hero`: 蓝 → 薄荷 → 桃粉三色彩虹渐变，首页/账户页重点区域。
- `--gradient-brand-soft`: 薄荷青应用图标。
- `--gradient-warm`: 珊瑚橙应用图标。
- `--gradient-peach`: 桃粉应用图标。
- `--gradient-lavender`: 薰衣草应用图标。
- `--gradient-lemon`: 柠檬应用图标。

## 3. 小程序组件清单

以下组件放在 `miniprogram/components/ui/`，全局注册于 `app.json`：

| 组件 | 用途 |
|---|---|
| `ui-page` | 页面壳：标题 + 内容区，`variant=dashboard` 去掉旧 hero 头 |
| `ui-card` | 标准卡片容器（default / elevated / soft / hero） |
| `ui-section` | 带标题的内容分区，左侧竖线标记使用彩虹渐变 |
| `ui-price` | 金额/积分数值展示 |
| `ui-status` | 状态标签：pill 胶囊样式 |
| `ui-empty` | 空状态占位（薰衣草底色图标） |
| `ui-error` | 错误状态展示 + 重试 |
| `ui-action-button` | 主操作按钮（晴空蓝渐变） |
| `ui-form-field` | 表单字段 |

### CSS-only 小组件（通用样式类）

| 类名 | 用途 |
|---|---|
| `.brand-mark` | 平台彩虹渐变圆形徽标 |
| `.app-icon-symbol` | 应用图标符号（blue/teal/coral/peach/lavender/lemon 变体） |
| `.care-divider` | 彩虹渐变分隔符 |
| `.stat-block` | 轻量统计块 |

### 底部浮动胶囊导航

- 位于 `miniprogram/custom-tab-bar/`。
- 大号尺寸，单项点击高度不低于 96rpx。
- 包含图标符号 + 文字。
- 选中态使用晴空蓝渐变。
- 页面底部 padding 已预留 `140rpx + env(safe-area-inset-bottom)`。

## 4. 管理端（admin-web）主题

管理端通过 Ant Design `ConfigProvider` 的 `theme` 注入柔彩 token：

- 主色 `#5E95C8`、圆角 `8`、成功/警告/危险色同步。
- 布局背景 `#F5F3F0`，柔蓝灰侧栏 `#3B4A6B`。
- 卡片 `borderRadius: 12`，表格头 `#F8F6F3`。
- StatusTag 使用 pill 胶囊（`bordered={false}` + `borderRadius: 999`）。
- StatCard `variant="primary"` 使用彩虹 hero 渐变。
- 登录页使用淡紫粉渐变背景 + 彩虹品牌徽标。

管理端通用组件放在 `admin-web/src/components/`：

| 组件 | 用途 |
|---|---|
| `PageHeader` | 页面标题区 + 副标题 + 可选操作区 |
| `StatCard` | 数据统计卡片（支持 variant、subtitle） |
| `StatusTag` | 状态标签映射组件（pill 样式） |
| `FilterBar` | 通用搜索筛选栏（带背景条） |
| `LoadingState` | 页面级加载骨架 |
| `ErrorState` | 页面级错误展示 |

## 5. 禁止事项

1. 不得回退到旧版深蓝青 `#1e5a8c` 为主色或侧栏色。
2. 不得在页面中硬编码色值，必须使用 token 变量。
3. 不得自定义平台按钮样式，必须使用 `button[type="primary"]` 或 `ui-action-button`。
4. 不得给状态标签使用非 pill 样式。
5. 不得在小程序中引入远程图片作为品牌/装饰元素。
6. 微信绿 `#07c160` 仅用于微信登录按钮，不得作为平台色使用。

## 6. 新应用接入要求

新应用必须：
1. 使用柔彩多巴胺 token 变量，不自定义平台色。
2. 采用"应用执行页"模式（应用头部 + 表单卡 + 主操作 + 结果区）。
3. 使用 `ui-page`、`ui-card`（含 variant）、`ui-status`、`ui-price` 等公共组件。
4. 业务结果区可以自定义，但必须使用 token 颜色和间距变量。
5. 模板 `templates/app_vertical_slice/` 已预配置柔彩多巴胺设计系统。
