# LLM Prompt huli-tools Phase 1/5

## 阶段目标

建立公共底座的最小可运行基础：工程约定、集合契约文档、静态检查脚本、用户 bootstrap 云函数、应用目录云函数和默认 seed。Phase 1 完成后，编码 Agent 应能证明：首次进入/调用会创建用户和积分账户，首页可以通过云函数拿到默认应用目录，后续阶段有稳定的数据契约可接。

## 本阶段输入

- 必读总文档：`/Users/huli-dev/Documents/huli-tools/promptDocs/prompt-pack-huli-tools-0526/master_spec_huli-tools_0526.md`
- 可参考测试文档：`/Users/huli-dev/Documents/huli-tools/promptDocs/prompt-pack-huli-tools-0526/test_case_huli-tools_0526.md`
- 目标仓库：`/Users/huli-dev/Documents/huli-tools`
- 当前代码现状：原生微信小程序骨架，只有 `getOpenId`、`sum` 示例云函数和首页/我的页。

## 任务清单

1. 新增项目文档与脚本底座：
   - 新增 `docs/cloud_collections.md`，写清公共 collection 名称、字段、权限建议、seed 数据和无法自动创建集合时的手工步骤。
   - 新增 `scripts/check-js.sh`，递归检查 `miniprogram/**/*.js`、`cloudfunctions/**/*.js`，排除 `node_modules`；使用 `node --check`，失败时退出非 0。
   - 如有必要，新增 `docs/dev_setup.md`，说明微信开发者工具、云环境 ID、云函数部署、环境变量配置。
2. 新增公共云函数 `coreUser`：
   - 支持 `bootstrap` 和 `getProfile` action。
   - 使用 `cloud.getWXContext()` 获取 `OPENID`、`APPID`、`UNIONID`。
   - 首次调用时创建 `users` 和 `point_accounts`；重复调用只能更新 `lastLoginAt/updatedAt`，不能重置余额。
   - 返回统一响应格式 `{ ok, data, requestId }`。
3. 新增公共云函数 `coreApp` 的基础能力：
   - 支持 `listApps` 和 `getAppDetail` action。
   - 从 `apps` 读取 `active`、`coming_soon` 应用，默认按 `sortOrder` 排序。
   - 没有 seed 数据时返回空列表，不要崩溃。
4. 新增 `adminCore.initSchema` 的最小版本：
   - seed 默认 `system_configs`、至少一个默认示例应用、至少两个默认充值包。
   - 如果集合不存在或权限不足，返回明确的 `MISSING_COLLECTION` 或 `DB_PERMISSION_DENIED` 错误和集合清单。
   - 管理员校验先按 `ADMIN_OPENIDS` 环境变量实现；未配置时只允许返回配置缺失错误，不能放开权限。
5. 前端最小接入：
   - `miniprogram/app.js` 保持云环境 ID `cloudbase-3gphz7fk0fe1b760`，可抽出常量但不要改成未配置会失效的形式。
   - 首页从 `coreUser.bootstrap` 和 `coreApp.listApps` 获取用户摘要和应用列表；保留基本加载/错误态。
   - 不需要做最终 UI 设计，Phase 4 会统一完善。

## 范围边界

要做：

- 公共数据契约、seed 入口、用户 bootstrap、应用目录读接口、静态检查。
- 可以保留 `getOpenId`，但新代码应优先使用 `coreUser.bootstrap`。

不要做：

- 不实现积分冻结/扣费/充值到账，这些属于 Phase 2/3。
- 不接真实微信支付。
- 不做完整管理 UI。
- 不引入新框架或根构建系统，除非只是为了静态检查且不会改变微信小程序结构。

## 实现约束

- 云函数目录使用 `cloudfunctions/<functionName>/index.js`、`package.json`、`config.json` 的现有结构。
- 每个云函数都要调用 `cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })`。
- action 不存在时返回 `UNKNOWN_ACTION`，不要抛出未处理异常。
- 数据库写入必须由云函数执行；前端只调用云函数。
- seed 数据中的示例应用建议：
  - `appKey = "demo_sum"`
  - `name = "积分示例工具"`
  - `entryPage = "/pages/tools/demo-sum/index"`
  - `cloudFunctionName = "sum"`
  - `status = "active"`
  - `pricing = { mode: "fixed", costPoints: 1 }`

## 验证要求

至少运行：

```bash
git status --short --branch
bash scripts/check-js.sh
git diff --check
```

手工/半自动验证：

- 在云环境集合已创建的前提下，部署 `coreUser`、`coreApp`、`adminCore` 后调用 `adminCore.initSchema`，确认 seed 数据存在。
- 调用 `coreUser.bootstrap` 两次，确认第二次不会重置积分账户。
- 调用 `coreApp.listApps`，确认返回默认示例应用。

## 交接说明

Phase 1 交给 Phase 2 的成果：

- 公共 collection 契约文档。
- `users`、`point_accounts`、`apps`、`recharge_packages`、`system_configs` 的 seed 能力。
- `coreUser.bootstrap` 可作为所有后续云函数的用户身份入口。
- `scripts/check-js.sh` 可作为所有后续阶段 gate。

剩余风险：

- 如果当前环境不能自动创建 CloudBase collection，Phase 1 必须把缺失集合清单写清楚，后续阶段依赖用户或 Agent 按文档创建。
