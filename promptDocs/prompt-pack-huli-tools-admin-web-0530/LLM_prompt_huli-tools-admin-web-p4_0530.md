# LLM Prompt huli-tools-admin-web Phase 4/4

## 阶段目标

完成 Web 管理端的部署准备、安全边界检查、文档收口和端到端验收。阶段完成后，仓库应具备可交付状态：本地可构建、边界检查可运行、文档说明清楚、部署到 CloudBase 静态托管或外部静态站点的步骤明确。

## 本阶段输入

- 必读总文档：`/Users/huli-dev/Documents/huli-tools/promptDocs/prompt-pack-huli-tools-admin-web-0530/master_spec_huli-tools-admin-web_0530.md`
- 可参考测试文档：`/Users/huli-dev/Documents/huli-tools/promptDocs/prompt-pack-huli-tools-admin-web-0530/test_case_huli-tools-admin-web_0530.md`
- 前序成果：Phase 1/2 后端管理 API、Phase 3 `admin-web/` 前端。
- 重点参考：
  - `AGENTS.md`
  - `docs/dev_setup.md`
  - `docs/admin_operations.md`
  - `scripts/check-boundaries.sh`

## 任务清单

1. 新增 admin-web 边界检查。
   - 新增 `scripts/check-admin-web-boundaries.sh`。
   - 检查 `admin-web/src` 中不得出现业务集合直连：`users`、`point_accounts`、`point_transactions`、`apps`、`app_usage_records`、`recharge_packages`、`payment_orders`、`admin_audit_logs`、`system_configs`、`app_ai_draw_tasks`。
   - 检查不得出现 `INTERNAL_API_SECRET`、`WX_PAY_PRIVATE_KEY`、`private.wx` 等敏感标识。
   - 检查不得直接调用 `corePoints` 内部 action 或 `coreApp.finishUsage/failUsage`。

2. 更新项目检查入口。
   - 若合适，更新 `AGENTS.md`：说明 `admin-web/` 允许 React/Vite，但小程序仍禁止 React/Vue/Taro/uni-app。
   - 更新 `docs/dev_setup.md`：增加 Web 管理端本地启动、构建、环境变量、CloudBase 安全来源说明。
   - 更新 `docs/admin_operations.md`：补 Web 管理端登录、`ADMIN_WEB_UIDS`、部署后首个管理员配置流程。
   - 更新 `docs/CODE_WIKI.md`：补管理端架构和命令。

3. 补部署说明。
   - 推荐 CloudBase 静态托管部署 `admin-web/dist`。
   - 写清如果使用外部域名，必须在 CloudBase 配置安全来源/CORS。
   - 不要把 `.env.local`、真实 uid 列表、密钥写入仓库。

4. 端到端验收。
   - 本地构建通过。
   - admin-web 边界检查通过。
   - 后端 `adminCore` 检查通过。
   - 如具备真实管理员 uid，完成一次真实登录、查看 Dashboard、查询用户、调分小额测试、查看审计日志。
   - 如缺少真实管理员 uid，在交接中明确列出需要用户完成的 CloudBase 控制台配置。

5. 更新 prompt pack 测试记录。
   - 若测试用例有新增/调整，更新 `test_case_huli-tools-admin-web_0530.md` 或项目正式测试文档。
   - 不要求提交 promptDocs 自身变更以外的计划文档，除非代码实现确实需要。

## 范围边界

- 要做：检查脚本、部署文档、验收收口。
- 不要做：大规模 UI 重做、引入复杂 RBAC、上线真实支付回调。
- 不要做：把 CloudBase 控制台无法自动完成的配置伪装成已完成；需明确列为人工步骤。

## 实现约束

- `AGENTS.md` 保持 200 行以内，只写长期规则。
- 文档里的命令必须在当前仓库路径下可解析。
- 检查脚本要能在没有 `admin-web/node_modules` 时运行；不要依赖前端依赖安装后才能扫描源码。
- 如果新增 `package-lock.json`，确认是否纳入版本控制；不要误提交 `node_modules/`、`.env.local`、`dist/`。

## 验证要求

至少运行：

```bash
bash scripts/check-js.sh
bash scripts/check-boundaries.sh
bash scripts/check-admin-web-boundaries.sh
npm --prefix admin-web run lint
npm --prefix admin-web run build
git diff --check
```

可选验证：

```bash
NODE_OPTIONS=--no-experimental-webstorage npx -y miniprogram-ci preview \
  --appid wx1654159e6e3bb334 \
  --project-path /Users/huli-dev/Documents/huli-tools \
  --private-key-path <本地小程序上传密钥路径> \
  --use-project-config \
  --upload-version admin-web-final-review \
  --threads 0 \
  --qrcode-format image \
  --qrcode-output-dest /tmp/huli-tools-admin-web-final.png
```

## 交接说明

- 最终交接必须说明：
  - 已新增/修改的云函数 action。
  - Web 管理端访问方式和本地启动命令。
  - 需要用户在 CloudBase 控制台配置的项目：`ADMIN_WEB_UIDS`、CloudBase Auth 登录方式、安全来源、静态托管域名。
  - 已运行的验证命令和结果。
- 剩余风险：若未做真实云环境登录和调分，必须明确标注为待用户配合验证，不能写成已完成。
