# 沪里工具 Web 管理端

`admin-web/` 是面向运营人员的浏览器管理端，使用 Vite + React + TypeScript + Ant Design，通过 CloudBase Web SDK 调用 `adminCore` 云函数。它只负责管理界面，不直接读写云数据库集合。

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

## 检查与构建

```bash
npm run lint
npm run build
bash ../scripts/check-admin-web-boundaries.sh
```

构建产物输出到 `admin-web/dist/`，不纳入 Git。
