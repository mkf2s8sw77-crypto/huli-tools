# 沪里工具设计系统 v2

> 定义平台视觉语言、设计 Token、组件使用边界和应用自由度。小程序端和管理端共用此文档。

## 1. 视觉方向

**专业温润的护理工具平台**——深蓝青为骨架传递专业感，柔和青绿作为"护理关怀"辅助色，暖金用于价格和重点提示。页面背景使用浅冷灰渐变，卡片分层呈现（描边 + 柔阴影 + 顶部高光线），而非灰底白卡片平铺。品牌符号使用 CSS-only 圆形渐变徽标和护理线分隔符，不新增图片依赖。

## 2. 设计 Token

### 2.1 颜色

| 用途 | Token | 值 | 说明 |
|---|---|---|---|
| 主色 | `--color-primary` | `#1e5a8c` | 深蓝青，品牌/可交互元素 |
| 主色-悬停 | `--color-primary-hover` | `#174a74` | 按钮 hover |
| 主色-亮阶 | `--color-primary-bright` | `#2a7ab5` | 主色渐变终点 |
| 主色-淡底 | `--color-primary-light` | `#e6f0f8` | 选中态、高亮背景 |
| 主色-反白文字 | `--color-on-primary` | `#ffffff` | 主色/深色背景上的文字 |
| 品牌柔色 | `--color-brand-soft` | `#5ba8a0` | 青绿，护理关怀辅助色 |
| 品牌柔色-亮阶 | `--color-brand-soft-bright` | `#6dbfb5` | 柔色渐变终点 |
| 品牌柔色-淡底 | `--color-brand-soft-light` | `#eaf5f3` | 柔色卡片/标签背景 |
| 暖金 | `--color-accent-warm` | `#c4963a` | 价格/积分提示、重点高亮 |
| 暖金-亮阶 | `--color-accent-warm-bright` | `#d4a85a` | 暖金渐变终点 |
| 暖金-淡底 | `--color-accent-warm-light` | `#fef8ec` | 暖金标签底色 |
| 成功 | `--color-success` | `#2e8b6a` | 支付成功、已完成 |
| 成功-淡底 | `--color-success-light` | `#e6f5ee` | |
| 警告 | `--color-warning` | `#c4963a` | 待支付、冻结中 |
| 警告-淡底 | `--color-warning-light` | `#fef8ec` | |
| 危险 | `--color-danger` | `#c0392b` | 失败、错误 |
| 危险-淡底 | `--color-danger-light` | `#fdf0ee` | |
| 文字-主 | `--color-text` | `#1a2a3a` | 标题、正文 |
| 文字-次 | `--color-text-secondary` | `#5a6a7a` | 标签、辅助说明 |
| 文字-弱 | `--color-text-muted` | `#8a96a4` | 时间戳、空状态 |
| 背景 | `--color-bg` | `#f0f3f7` | 页面底色（冷灰） |
| 表面 | `--color-surface` | `#f4f6f9` | 输入框背景等 |
| 表面-高 | `--color-surface-elevated` | `#ffffff` | |
| 卡片背景 | `--color-bg-card` | `#ffffff` | 卡片、弹窗 |
| 边框 | `--color-border` | `#e2e8f0` | 卡片边框、分隔线 |
| 边框-柔 | `--color-border-soft` | `#edf1f5` | 更轻的分隔 |
| 价格/金额 | `--color-price` | `#c4963a` | |
| 积分 | `--color-points` | `#1e5a8c` | |
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

全局 `letter-spacing` 保持 `0`，避免移动端中文和数字在不同设备上出现压缩或溢出。

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
| `--shadow-soft` | `0 2rpx 16rpx rgba(30,90,140,0.06), 0 1rpx 4rpx rgba(0,0,0,0.03)` | 轻量元素 |
| `--shadow-card` | `0 4rpx 24rpx rgba(30,90,140,0.07), 0 1rpx 6rpx rgba(0,0,0,0.03)` | 标准卡片 |
| `--shadow-elevated` | `0 8rpx 40rpx rgba(30,90,140,0.1), 0 2rpx 8rpx rgba(0,0,0,0.04)` | 结果卡/浮层 |

### 2.5 页面渐变

- `--page-gradient`: `linear-gradient(180deg, #e4ecf4 0%, #f0f3f7 320rpx, #f4f6f9 100%)`
- `--gradient-primary`: 主操作按钮、蓝色应用图标。
- `--gradient-hero`: 首页/账户页重点区域。
- `--gradient-brand-soft`: 青绿应用图标。
- `--gradient-warm`: 价格/充值应用图标。
- 页面顶部略深的冷蓝灰自然过渡到标准表面色，增强第一屏层次。

## 3. 小程序组件清单

以下组件放在 `miniprogram/components/ui/`，全局注册于 `app.json`：

| 组件 | 用途 | v2 新增属性 |
|---|---|---|
| `ui-page` | 页面壳：标题 + 内容区 | `variant`（dashboard 等）、`eyebrow`、hero slot |
| `ui-card` | 标准卡片容器 | `variant`（default / elevated / soft / hero） |
| `ui-section` | 带标题的内容分区 | 区域标题增加左侧竖线标记 |
| `ui-price` | 金额/积分数值展示 | — |
| `ui-status` | 状态标签：pill 胶囊样式 | info 类型 |
| `ui-empty` | 空状态占位（含图标） | — |
| `ui-error` | 错误状态展示 + 重试 | 增加圆形错误图标 |
| `ui-action-button` | 主操作按钮 | 渐变背景、禁用态、`extraClass` |
| `ui-form-field` | 表单字段 | — |

### CSS-only 小组件（通用样式类）

| 类名 | 用途 |
|---|---|
| `.brand-mark` | 平台圆形渐变徽标 |
| `.app-icon-symbol` | 应用图标符号（blue/teal/gold 变体） |
| `.care-divider` | 护理线渐变分隔符 |
| `.stat-block` | 轻量统计块（数值 + 标签） |

## 4. 页面模式

### 4.1 平台仪表盘（首页）
- `ui-page variant="dashboard"` 提供渐变 hero 头。
- 积分摘要卡（渐变背景 + 大数值 + 充值按钮）。
- 快捷入口网格（4 格 icon + 文字）。
- 应用目录卡片列表（图标符号 + 名称/描述/积分价格 + 箭头）。

### 4.2 账户面板（我的页）
- 大面积渐变积分卡（余额 + 冻结 + 累计充值/消费）。
- 身份栏（品牌徽标 + 脱敏 OpenID）。
- 设置面板菜单（带彩色 icon 的菜单列表）。

### 4.3 信息面板（订单/流水/使用记录/充值）
- `ui-page` + subtitle 说明。
- 统一 `info-card` 布局：顶部（ID + 状态标签）、行信息、底部时间戳。

### 4.4 应用执行页（demo-sum/ai_draw/新应用）
- 应用头部（card--soft + 图标符号 + 名称 + 积分消耗）。
- 表单卡（ui-form-field）。
- 主操作按钮（全宽渐变）。
- 结果区（card--elevated，业务自定义布局允许）。
- 错误区（danger-light 底 + danger 色文字）。

## 5. 应用自由度边界

| 层面 | 统一（不允许自定义） | 可自定义 |
|---|---|---|
| 页面壳 | 背景渐变、标题样式、内边距 | — |
| 卡片 | 圆角、阴影、描边、顶部高光 | variant 选择 |
| 按钮 | 主色渐变、圆角、disabled/loading 态 | — |
| 状态标签 | pill 样式和颜色映射 | — |
| 价格/积分 | 颜色和字号 | — |
| 空/错误态 | 布局和图标 | 自定义提示文案 |
| 业务结果区 | — | 允许自定义布局、图片、色彩 |

## 6. 管理端（admin-web）主题

管理端通过 Ant Design `ConfigProvider` 的 `theme` 注入完整 v2 token：

- 主色 `#1e5a8c`、圆角 `8`、成功/警告/危险色同步。
- 布局背景 `#f0f3f7`，深蓝青侧栏 `#132d46`。
- 卡片 `borderRadius: 12`，表格头 `#f4f6f9`。
- StatusTag 使用 pill 胶囊（`bordered={false}` + `borderRadius: 999`）。
- FilterBar 带背景条。
- StatCard 支持 `variant="primary"` 渐变和 `subtitle`。
- PageHeader 支持 `subtitle`。
- 登录页使用品牌渐变背景 + 品牌徽标 + 精致卡片。

管理端通用组件放在 `admin-web/src/components/`：

| 组件 | 用途 |
|---|---|
| `PageHeader` | 页面标题区 + 副标题 + 可选操作区 |
| `StatCard` | 数据统计卡片（支持 variant、subtitle） |
| `StatusTag` | 状态标签映射组件（pill 样式） |
| `FilterBar` | 通用搜索筛选栏（带背景条） |
| `LoadingState` | 页面级加载骨架 |
| `ErrorState` | 页面级错误展示 |

## 7. 禁止事项

1. 不得使用旧版 `#f5f5f5` 灰底 + 无边框白卡片散写。
2. 不得在页面中硬编码主色值（`#2b6cb0` 或 `#1e5a8c`），必须使用 token 变量。
3. 不得自定义平台按钮样式（颜色/圆角/阴影），必须使用 `button[type="primary"]` 或 `ui-action-button`。
4. 不得给状态标签使用非 pill 样式。
5. 不得在小程序中引入远程图片作为品牌/装饰元素。
6. 微信绿 `#07c160` 仅用于微信登录按钮，不得作为平台色使用。

## 8. 新应用接入要求

新应用必须：
1. 使用 v2 token 变量，不自定义平台色。
2. 采用"应用执行页"模式（应用头部 + 表单卡 + 主操作 + 结果区）。
3. 使用 `ui-page`、`ui-card`（含 variant）、`ui-status`、`ui-price` 等公共组件。
4. 业务结果区可以自定义，但必须使用 token 颜色和间距变量。
5. 模板 `templates/app_vertical_slice/` 已预配置 v2 设计系统。
