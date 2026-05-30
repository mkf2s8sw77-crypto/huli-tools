# LLM Prompt huli-tools-admin-web Phase 3/4

## 阶段目标

新增 `admin-web/` Web 管理端前端 MVP。阶段完成后，开发者可以本地启动浏览器管理端，使用 CloudBase Auth 登录，调用 Phase 1/2 的 `adminCore` action 完成 Dashboard、查询和运营管理操作。

## 本阶段输入

- 必读总文档：`/Users/huli-dev/Documents/huli-tools/promptDocs/prompt-pack-huli-tools-admin-web-0530/master_spec_huli-tools-admin-web_0530.md`
- 可参考测试文档：`/Users/huli-dev/Documents/huli-tools/promptDocs/prompt-pack-huli-tools-admin-web-0530/test_case_huli-tools-admin-web_0530.md`
- 前序成果：Phase 1/2 已完成的 `adminCore` action。
- 重点参考：
  - `docs/admin_operations.md`
  - `cloudfunctions/adminCore/index.js`

## 任务清单

1. 创建 `admin-web/` 工程。
   - 使用 `Vite + React + TypeScript + Ant Design`。
   - 配置 npm scripts：`dev`、`build`、`lint`。
   - 新增 `.env.example`，至少包含：
     - `VITE_CLOUDBASE_ENV_ID=cloudbase-3gphz7fk0fe1b760`
     - `VITE_CLOUDBASE_ADMIN_FUNCTION=adminCore`

2. 封装 CloudBase 客户端。
   - `admin-web/src/services/cloudbase.ts` 初始化 CloudBase。
   - `admin-web/src/services/adminApi.ts` 统一调用 `adminCore`。
   - Web 端不得直接访问业务集合，不得出现 `collection("users")` 等直连集合代码。
   - 登录态过期或无权限时统一跳转/提示。

3. 实现基础布局和路由。
   - 登录页 `/login`。
   - 登录后主布局：侧边导航、顶部用户信息、退出登录。
   - 路由守卫：未登录跳转登录页；无管理员权限显示无权限页。

4. 实现页面。
   - Dashboard：展示概览指标、最近订单、最近使用记录、最近审计。
   - 用户列表：搜索、分页、进入详情。
   - 用户详情：基础资料、积分账户、最近流水、最近订单、最近使用记录、调分弹窗。
   - 应用管理：列表、新增/编辑、启停。
   - 充值包管理：列表、新增/编辑、启停。
   - 订单管理：筛选、分页、详情摘要。
   - 使用记录：筛选、分页、错误信息展示。
   - 审计日志：分页、操作摘要查看。

5. 处理 UI 状态。
   - loading、empty、error、unauthorized、forbidden。
   - 写操作成功后刷新对应列表/详情。
   - 危险操作二次确认，调分必须显示目标用户和变动积分。

## 范围边界

- 要做：可本地运行的 Web 管理端 MVP。
- 不要做：真实部署、CloudBase 静态托管配置、复杂角色权限、导出 CSV。
- 不要做：新增后端 action，除非发现 Phase 1/2 action 缺失导致页面无法完成；若新增，必须同步文档和测试。
- 不要做：改小程序 UI。

## 实现约束

- 管理端应是工具型界面，避免营销页、hero、大面积装饰背景。
- 使用表格、筛选表单、Modal/Drawer、Tag、Descriptions 等 Ant Design 组件。
- API 类型定义集中维护，避免页面里散落 magic string。
- 所有金额显示为元时必须由整数分转换；提交给后端仍是整数分。
- 所有积分显示和提交均为整数。
- 不要在源码里写真实管理员 uid 或密钥。

## 验证要求

至少运行：

```bash
npm --prefix admin-web install
npm --prefix admin-web run lint
npm --prefix admin-web run build
bash scripts/check-js.sh
bash scripts/check-boundaries.sh
git diff --check
```

人工验证：

- 本地 `npm --prefix admin-web run dev` 可启动。
- 未登录访问 Dashboard 会跳转登录页。
- 登录后 `getAdminMe` 成功才进入管理端。
- 用户列表、订单列表、使用记录、审计日志能分页展示。
- 调分、应用编辑、充值包编辑成功后页面刷新并提示成功。

## 交接说明

- 给 Phase 4：交接 `admin-web` 启动方式、环境变量、构建产物目录、尚未验证的真实 CloudBase 登录方式。
- 剩余风险：如没有真实 `ADMIN_WEB_UIDS`，可完成 UI 和构建验证，但真实登录验收需 Phase 4 或用户配合完成。
