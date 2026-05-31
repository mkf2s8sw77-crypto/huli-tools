# 沪里工具设计系统

> 定义平台视觉语言、设计 Token、组件使用边界和应用自由度。小程序端和管理端共用此文档。

## 1. 视觉方向

**安静工具型**——低对比度背景、中性灰文字、最少色彩干扰。用户注意力聚焦于内容和操作结果，而非装饰。

## 2. 设计 Token

### 2.1 颜色

| 用途 | Token | 值 | 说明 |
|---|---|---|---|
| 主色 | `--color-primary` | `#2b6cb0` | 平台蓝青，品牌/可交互元素 |
| 主色-淡底 | `--color-primary-light` | `#ebf5fb` | 选中态、高亮背景 |
| 成功 | `--color-success` | `#38a169` | 支付成功、已完成 |
| 成功-淡底 | `--color-success-light` | `#e6f7ed` | 成功标签底色 |
| 警告 | `--color-warning` | `#d69e2e` | 待支付、冻结中 |
| 警告-淡底 | `--color-warning-light` | `#fff7e6` | 警告标签底色 |
| 危险 | `--color-danger` | `#e53e3e` | 失败、错误 |
| 危险-淡底 | `--color-danger-light` | `#fff2f0` | 错误标签底色 |
| 文字-主 | `--color-text` | `#1a1a1a` | 标题、正文 |
| 文字-次 | `--color-text-secondary` | `#666666` | 标签、辅助说明 |
| 文字-弱 | `--color-text-muted` | `#999999` | 时间戳、加载中、空状态 |
| 背景 | `--color-bg` | `#f5f5f5` | 页面底色 |
| 卡片背景 | `--color-bg-card` | `#ffffff` | 卡片、弹窗 |
| 分割线 | `--color-border` | `#f0f0f0` | 列表分隔、卡片描边 |
| 价格/金额 | `--color-price` | `#d69e2e` | 价格显示 |
| 积分 | `--color-points` | `#2b6cb0` | 积分数值 |
| 微信绿 | — | `#07c160` | 仅用于微信登录按钮和微信品牌标识 |

### 2.2 字号（小程序 rpx）

| 用途 | 值 |
|---|---|
| 页面标题 | 36rpx / font-weight 600 |
| 卡片/区域标题 | 32rpx / font-weight 600 |
| 正文 | 28rpx |
| 辅助/标签 | 26rpx |
| 小字/时间戳 | 24rpx / 22rpx |
| 大数值（积分、价格） | 40rpx / font-weight 600 |

### 2.3 间距与圆角

| Token | 值 |
|---|---|
| 页面内边距 | 32rpx |
| 卡片间距 | 24rpx |
| 卡片内边距 | 32rpx |
| 卡片圆角 | 16rpx |
| 标签圆角 | 8rpx |
| 按钮圆角 | 8rpx |

### 2.4 阴影

- 卡片阴影：`0 2rpx 12rpx rgba(0, 0, 0, 0.06)`

## 3. 小程序组件清单

以下组件放在 `miniprogram/components/ui/`，全局注册于 `app.json`：

| 组件 | 用途 |
|---|---|
| `ui-page` | 页面壳：统一页面标题 + 内容区布局 |
| `ui-card` | 标准卡片容器 |
| `ui-section` | 带标题的内容分区（section-title + slot） |
| `ui-price` | 金额/积分数值展示，统一颜色和字号 |
| `ui-status` | 状态标签：success / warning / danger / default |
| `ui-empty` | 空状态占位 |
| `ui-error` | 错误状态展示 + 重试按钮 |
| `ui-action-button` | 主操作按钮，统一样式和 loading 态 |
| `ui-form-field` | 表单字段：label + input/textarea slot |

## 4. 应用自由度边界

| 层面 | 统一（不允许自定义） | 可自定义 |
|---|---|---|
| 页面壳 | 背景色、标题样式、内边距 | — |
| 卡片 | 圆角、阴影、内边距、间距 | — |
| 按钮 | 主色、圆角、loading 态 | — |
| 状态标签 | 颜色映射和圆角 | — |
| 价格/积分 | 颜色和字号 | — |
| 空/错误态 | 布局和文案模式 | 自定义提示文案 |
| 业务结果区 | — | 允许自定义布局、图片、色彩 |

## 5. 管理端（admin-web）主题

管理端通过 Ant Design `ConfigProvider` 的 `theme.token` 统一主色和圆角：

```ts
{
  colorPrimary: '#2b6cb0',
  borderRadius: 6,
  colorSuccess: '#38a169',
  colorWarning: '#d69e2e',
  colorError: '#e53e3e',
}
```

管理端通用组件放在 `admin-web/src/components/`：

| 组件 | 用途 |
|---|---|
| `PageHeader` | 页面标题区 + 可选操作区 |
| `StatCard` | 数据统计卡片（Statistic wrapper） |
| `StatusTag` | 状态标签映射组件 |
| `FilterBar` | 通用搜索筛选栏 |
| `LoadingState` | 页面级加载骨架 |
| `ErrorState` | 页面级错误展示 |

## 6. 新应用接入要求

新应用必须：
1. 引用 `miniprogram/styles/tokens.wxss` 的颜色 Token，不自定义平台主色。
2. 使用 `ui-page`、`ui-card`、`ui-status`、`ui-price` 等公共组件。
3. 业务结果区可以自定义，但不能覆盖公共组件的样式。
4. 模板 `templates/app_vertical_slice/` 已预配置设计系统引用。
