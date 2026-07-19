# huli-tools Web 管理端

`admin-web/` 是面向运营人员的浏览器管理端，使用 Vite + React + TypeScript + Ant Design，通过 CloudBase Web SDK 调用 `adminCore` 云函数。它只负责管理界面，不直接读写云数据库集合。

## 设计系统

管理端通过 `src/theme.ts` 统一 Ant Design 柔彩多巴胺主题 Token（晴空蓝主色 `#5E95C8`、圆角 8px、柔蓝灰侧栏 `#3B4A6B`），由 `ConfigProvider` 在 `main.tsx` 中注入。

通用组件放在 `src/components/`：

| 组件 | 用途 |
|---|---|
| `PageHeader` | 页面标题区 + 可选操作区 |
| `StatCard` | 数据统计卡片 |
| `StatusTag` | 状态标签映射（order / user / usage / app 四个 domain） |
| `FilterBar` | 通用搜索筛选栏 |
| `LoadingState` | 页面级加载骨架 |
| `ErrorState` | 页面级错误展示 |

新页面必须使用以上组件，不得自行定义主题色或状态标签映射。详见 `docs/design_system.md`。

## 本地启动

```bash
npm install
cp .env.example .env
npm run dev
```

默认开发地址：`http://localhost:60530`。管理端使用 hash 路由，静态部署后无需额外配置 SPA fallback。

## 环境变量

```bash
VITE_CLOUDBASE_ENV_ID=cloudbase-3gphz7fk0fe1b760
VITE_CLOUDBASE_ADMIN_FUNCTION=adminCore
VITE_WECHAT_LOGIN_ENABLED=false
VITE_WECHAT_PROVIDER_ID=wx_open
# VITE_WECHAT_REDIRECT_URI=https://your-admin-domain.com/
```

Web 管理员白名单在 `adminCore` 云函数环境变量 `ADMIN_WEB_UIDS` 中配置；首次扫码自动准入会写入 `system_configs/admin_web_auto_admins`。这些管理员 uid 不写入前端环境变量。

## 充值包与虚拟支付

「充值包管理」页面的 `productId` 字段对应小程序 mp 后台「虚拟支付 → 道具管理」中已发布的道具 ID；走小程序虚拟支付（`PAYMENT_PROVIDER=virtual`）时必须填写且道具价格与充值包金额一致，详见 `docs/payment_setup.md`。

## 检查与构建

```bash
npm run lint
npm run build
bash ../scripts/check-admin-web-boundaries.sh
```

构建产物输出到 `admin-web/dist/`，不纳入 Git。
