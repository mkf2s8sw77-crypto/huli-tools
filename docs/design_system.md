# huli-tools 设计系统 v3 — 自然疗愈

> 调性转向说明:从 v2 的"柔彩多巴胺"(高饱和粉/桃粉/亮蓝)转向 v3 的"自然疗愈"(暖米底 + 陶土棕 + 莫兰迪降饱和),核心变化是**更安静、更像"健康教育机构"而不是"营销活动"**。
> 衬线字体(Noto Serif SC)仅在 page-title/大数值/应用名称使用,正文/按钮/标签保持无衬线。

## 1. 视觉方向

**自然疗愈工具平台**——暖米黄底色传递温润踏实感,陶土棕为主色表达"专业、可靠、有文化",雾蒙绿/陶橙/陶桃粉等莫兰迪彩色带来克制的层次。卡片用"无边框 + 柔阴影"分层(去掉 v2 的彩虹高光线条,改用 inset 高光)。衬线大数值增加"机构出版物"质感。

Logo 使用 `https://media.huli.sh.cn/huli-tech-logo.png` 的本地化资产:小程序路径为 `miniprogram/assets/images/huli-tech-logo.png`,管理端路径为 `admin-web/src/assets/huli-tech-logo.png`。原图是方角,实际展示必须加圆角裁切。

## 2. 设计 Token

### 2.1 颜色

| 用途 | Token | 值 | 说明 |
|---|---|---|---|
| 主色 | `--color-primary` | `#8A6A3A` | 陶土棕,品牌/可交互元素 |
| 主色-悬停 | `--color-primary-hover` | `#6F5329` | 按钮 hover |
| 主色-亮阶 | `--color-primary-bright` | `#B8956A` | 主色渐变终点 |
| 主色-淡底 | `--color-primary-light` | `#F2E9D8` | 选中态、高亮背景 |
| 主色-反白文字 | `--color-on-primary` | `#ffffff` | 主色背景上的文字 |
| 品牌柔色 | `--color-brand-soft` | `#7A8B6A` | 雾蒙绿,关怀辅色 |
| 品牌柔色-亮阶 | `--color-brand-soft-bright` | `#98A888` | 柔色渐变终点 |
| 品牌柔色-淡底 | `--color-brand-soft-light` | `#ECEEE3` | 柔色卡片/标签背景 |
| 暖调强调 | `--color-accent-warm` | `#C8804A` | 陶土橙,价格/积分提示 |
| 暖调强调-亮阶 | `--color-accent-warm-bright` | `#D69A6A` | 暖调渐变终点 |
| 暖调强调-淡底 | `--color-accent-warm-light` | `#F4E2D2` | 暖调标签底色 |
| 陶桃粉 | `--color-peach` | `#C8988A` | 莫兰迪桃粉 |
| 陶桃粉-淡底 | `--color-peach-light` | `#F2E2DC` | |
| 陶柠 | `--color-lemon` | `#C8A24A` | 莫兰迪柠 |
| 陶柠-淡底 | `--color-lemon-light` | `#F4ECD2` | |
| 雾蒙薰衣草 | `--color-lavender` | `#9A8AA8` | 莫兰迪薰衣草 |
| 雾蒙薰衣草-淡底 | `--color-lavender-light` | `#ECE7EF` | |
| 莫兰迪绿 | `--color-success` | `#6F8F5A` | 支付成功、已完成 |
| 莫兰迪绿-淡底 | `--color-success-light` | `#E5ECDC` | |
| 莫兰迪琥珀 | `--color-warning` | `#B8904A` | 待支付、冻结中 |
| 莫兰迪琥珀-淡底 | `--color-warning-light` | `#F0E5C8` | |
| 莫兰迪砖红 | `--color-danger` | `#B66A6A` | 失败、错误 |
| 莫兰迪砖红-淡底 | `--color-danger-light` | `#F0D9D9` | |
| 文字-主 | `--color-text` | `#2D2418` | 墨褐,标题、正文 |
| 文字-次 | `--color-text-secondary` | `#5A4A38` | 标签、辅助说明 |
| 文字-弱 | `--color-text-muted` | `#8A7A66` | 时间戳、空状态 |
| 背景 | `--color-bg` | `#F5F0E8` | 暖米页面底色 |
| 表面 | `--color-surface` | `#FBF8F2` | 输入框背景、软卡 |
| 表面-高 | `--color-surface-elevated` | `#ffffff` | |
| 卡片背景 | `--color-bg-card` | `#ffffff` | 卡片、弹窗 |
| 边框 | `--color-border` | `#E0D6C2` | 卡片边框、分隔线 |
| 边框-柔 | `--color-border-soft` | `#EDE5D3` | 更轻的分隔 |
| 价格/金额 | `--color-price` | `#C8804A` | |
| 积分 | `--color-points` | `#8A6A3A` | |
| 微信绿 | — | `#07c160` | 仅用于微信登录按钮和微信品牌标识 |

### 2.2 字号(小程序 rpx)

| 用途 | 值 |
|---|---|
| 页面标题(衬线) | `38rpx` / `font-weight: 600` / `font-family: Noto Serif SC` |
| 卡片/区域标题 | `30rpx` / `font-weight: 600` |
| 正文 | `28rpx` |
| 辅助/标签 | `26rpx` |
| 小字/时间戳 | `24rpx` / `22rpx` |
| 大数值(积分、价格,衬线) | `44rpx–80rpx` / `font-family: Noto Serif SC` / `font-weight: 600` |

全局 `letter-spacing` 保持 `0`。

### 2.3 间距与圆角(更柔,v3 比 v2 大一档)

| Token | 值 | 说明 |
|---|---|---|
| `--spacing-xs` | `8rpx` | |
| `--spacing-sm` | `16rpx` | |
| `--spacing-md` | `24rpx` | |
| `--spacing-lg` | `32rpx` | |
| `--spacing-xl` | `48rpx` | |
| `--radius-sm` | `4px` | 标签/小控件 |
| `--radius-md` | `10px` | 按钮/输入框 |
| `--radius-lg` | `16px` | 卡片 |
| `--radius-xl` | `24px` | 积分卡等突出区域 |
| `--radius-pill` | `999px` | 胶囊标签/tabbar |

### 2.4 阴影(更柔,带温度)

| Token | 值 | 用途 |
|---|---|---|
| `--shadow-soft` | `0 1px 2px rgba(45,36,24,0.04), 0 2px 8px rgba(45,36,24,0.04)` | 轻量元素 |
| `--shadow-card` | `0 1px 1px rgba(255,255,255,0.5) inset, 0 2px 12px rgba(125,98,50,0.08)` | 标准卡片 |
| `--shadow-elevated` | `0 1px 1px rgba(255,255,255,0.6) inset, 0 8px 24px rgba(125,98,50,0.1)` | 结果卡/浮层 |

### 2.5 页面渐变(暖米,无多巴胺彩虹)

- `--page-gradient`: `linear-gradient(180deg, #EFE6D2 0%, #F5F0E8 320rpx, #F8F4EB 100%)` — 暖米渐变。

### 2.6 渐变(只保留陶土+雾绿,删多巴胺彩虹)

| Token | 值 | 用途 |
|---|---|---|
| `--gradient-primary` | `linear-gradient(135deg, #8A6A3A 0%, #B8956A 100%)` | 主操作按钮、品牌强调 |
| `--gradient-hero` | `linear-gradient(135deg, #B8956A 0%, #98A888 100%)` | 暖陶+雾绿双色调和 |
| `--gradient-brand-soft` | `linear-gradient(135deg, #7A8B6A 0%, #98A888 100%)` | 雾蒙绿渐变 |
| `--gradient-warm` | `linear-gradient(135deg, #C8804A 0%, #D69A6A 100%)` | 陶橙渐变 |
| `--gradient-peach` | `linear-gradient(135deg, #C8988A 0%, #D6A8A0 100%)` | 陶桃粉渐变 |
| `--gradient-lemon` | `linear-gradient(135deg, #C8A24A 0%, #D6BA68 100%)` | 陶柠渐变 |
| `--gradient-lavender` | `linear-gradient(135deg, #9A8AA8 0%, #B0A0BC 100%)` | 雾蒙薰衣草渐变 |

### 2.7 微动效 Token

| Token | 值 | 用途 |
|---|---|---|
| `--t-fast` | `120ms` | 颜色/边框切换 |
| `--t-base` | `200ms` | 卡片 hover、点击反馈 |
| `--t-slow` | `360ms` | 进场 fade-in |
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | 进场、抬起 |
| `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | 强调过渡 |

**动效模式**:
- `.tap-feedback`:点击波纹(全局可加)
- `.lift-on-hover`:卡片 hover 抬起 `translateY(-2rpx)` + 阴影加深
- `.fade-in` / `.fade-in-1` / `.fade-in-2` / `.fade-in-3` / `.fade-in-4`:进场 fade-in-up,延迟 0/60/120/180/240ms
- `.skeleton`:加载占位骨架(`shimmer` 动画 1.4s)
- 按钮按下:`scale(0.98)` + 透明度变化

## 3. 小程序组件清单

以下组件放在 `miniprogram/components/ui/`,全局注册于 `app.json`:

| 组件 | 用途 |
|---|---|
| `ui-page` | 页面壳:标题 + 内容区,`variant=dashboard` 去掉旧 hero 头 |
| `ui-card` | 标准卡片容器(`default` / `elevated` / `soft` / `hero` 4 种变体) |
| `ui-section` | 带标题的内容分区,左侧竖线使用陶土橙(不是彩虹渐变) |
| `ui-price` | 金额/积分数值展示(衬线) |
| `ui-status` | 状态标签:pill 胶囊样式 |
| `ui-empty` | 空状态占位(雾蒙薰衣草底色图标) |
| `ui-error` | 错误状态展示 + 重试 |
| `ui-action-button` | 主操作按钮(陶土棕渐变) |
| `ui-form-field` | 表单字段 |

### CSS-only 小组件(通用样式类)

| 类名 | 用途 |
|---|---|
| `.brand-logo` | 平台 logo 图片容器,必须圆角裁切 |
| `.icon-tile` | CSS-only 功能图标,不得使用单字占位符代替图标 |
| `.care-divider` | 单色暖米分隔符(不是彩虹) |
| `.stat-block` | 轻量统计块(衬线数值 + 无衬线标签) |
| `.serif-num` | 衬线数字(用于积分、价格、id 等需要"出版物"质感的数值) |
| `.lift-on-hover` | 卡片 hover 抬起 |
| `.tap-feedback` | 元素点击波纹反馈 |
| `.fade-in` / `.fade-in-N` | 进场动画 |
| `.skeleton` | 加载占位骨架 |

### 底部浮动胶囊导航

- 位于 `miniprogram/custom-tab-bar/`。
- 大号尺寸,单项点击高度不低于 `96rpx`。
- 包含 CSS 线性图标 + 文字。
- 选中态使用 `--gradient-hero`(暖陶+雾绿双色调和)。
- 页面底部 padding 已预留 `140rpx + env(safe-area-inset-bottom)`。
- **v3 改动**:底色从 `white` 改为 `var(--color-bg)`(暖米),融入页面背景。

## 4. 管理端(admin-web)主题

管理端通过 Ant Design `ConfigProvider` 的 `theme` 注入柔彩 token:

- 主色 `#8A6A3A`(陶土棕)、圆角 `10`、成功/警告/危险色同步。
- 布局背景 `#F5F0E8`(暖米),柔蓝灰侧栏改为陶土深 `#3D3529`。
- 卡片 `borderRadius: 16`,表格头 `#FBF8F2`。
- StatusTag 使用 pill 胶囊(`bordered={false}` + `borderRadius: 999`)。
- StatCard `variant="primary"` 使用 `--gradient-hero`(暖陶+雾绿)。
- 登录页使用暖米渐变背景 + 衬线 logo 文字。

## 5. 禁止事项

1. 不得回退到旧版深蓝青 `#1e5a8c` 为侧栏色。
2. 不得在页面中硬编码色值,必须使用 token 变量。
3. 不得自定义平台按钮样式,必须使用 `button[type="primary"]` 或 `ui-action-button`。
4. 不得给状态标签使用非 pill 样式。
5. 不得在小程序中引入远程图片作为品牌/装饰元素。
6. 微信绿 `#07c160` 仅用于微信登录按钮,不得作为平台色使用。
7. 不得使用"单 / 流 / 记 / A / 积"等单字作为功能图标,必须使用 `.icon-tile` 或同等 CSS-only 图标。
8. 不得在正文/按钮/标签中无差别使用衬线字体,衬线仅限 `page-title` / `.serif-num` / 应用名称(详见 §2.2)。
9. 不得使用彩虹渐变(`var(--gradient-hero)` 在 v3 是暖陶+雾绿双色,不是多巴胺三色)。

## 6. 新应用接入要求

新应用必须:

1. 使用 v3 自然疗愈 token 变量,不自定义平台色。
2. 采用"应用执行页"模式(应用头部 + 表单卡 + 主操作 + 结果区)。
3. 使用 `ui-page` / `ui-card`(含 variant) / `ui-status` / `ui-price` 等公共组件。
4. 业务结果区可以自定义,但必须使用 token 颜色和间距变量。
5. 应用入口和应用执行页使用 `.icon-tile` 绘制图标,不使用文字缩写。
6. 模板 `templates/app_vertical_slice/` 已预配置 v3 自然疗愈设计系统。

## 7. 页面骨架(3 种,全站归纳)

### 骨架 A — 仪表盘(首页/profile 类)

- 顶部 hero:暖米/陶土渐变卡 + 衬线大数值 + 操作按钮
- 快捷入口区:4 个 `.icon-tile` 横排
- 应用/菜单列表:`ui-section` + `.card`

### 骨架 B — 列表中心(orders/transactions/usage-records/recharge 类)

- 顶部 mini-hero:轻量陶土小卡(账户汇总/统计)
- 列表区:`.card` + 状态 pill + `.care-divider`
- 加载更多:`.load-more`

### 骨架 C — 应用执行页(demo-sum/ai_draw/nursing_undercover 类)

- 顶部 hero:`app-exec-header` 暖陶+雾绿渐变 + 应用名(衬线)+ 费用 chip
- 表单/选项区:`ui-form-field` 包裹
- 主操作:`ui-action-button`
- 结果区:业务自定义,但用 token 色和间距

## 8. 改造记录

- v3 (2026-06-15):柔彩多巴胺 → 自然疗愈,陶土棕主色 + 暖米底 + 衬线标题 + 微动效体系
- v2 (2026-05):柔彩多巴胺(初版,已废弃)
- v1 (2026-04):旧版深蓝青(已废弃)
