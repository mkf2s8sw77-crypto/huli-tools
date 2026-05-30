# LLM Prompt huli-tools-admin-web Phase 1/4

## 阶段目标

建立 Web 管理端可用的安全后端基础：`adminCore` 能识别 CloudBase Web Auth 管理员 `uid`，并提供只读管理 API MVP。阶段完成后，即使还没有 Web UI，也可以通过脚本或 CloudBase SDK 验证 Web 管理员鉴权、Dashboard、用户/订单/流水/使用记录查询。

## 本阶段输入

- 必读总文档：`/Users/huli-dev/Documents/huli-tools/promptDocs/prompt-pack-huli-tools-admin-web-0530/master_spec_huli-tools-admin-web_0530.md`
- 可参考测试文档：`/Users/huli-dev/Documents/huli-tools/promptDocs/prompt-pack-huli-tools-admin-web-0530/test_case_huli-tools-admin-web_0530.md`
- 必读项目规则：`/Users/huli-dev/Documents/huli-tools/AGENTS.md`
- 重点参考：
  - `cloudfunctions/adminCore/index.js`
  - `docs/admin_operations.md`
  - `docs/cloud_collections.md`
  - `scripts/check-js.sh`
  - `scripts/check-boundaries.sh`

## 任务清单

1. 扩展 `adminCore` 管理员身份解析。
   - 保留现有 `ADMIN_OPENIDS` 小程序管理员能力。
   - 新增 `ADMIN_WEB_UIDS`，支持 Web SDK 调用时校验 CloudBase Auth `uid`。
   - 新增内部 helper，例如 `resolveAdminIdentity(event, context)`，返回 `{ adminUserId, source, roles }`。
   - Web 管理员无法识别时返回稳定错误码：`UNAUTHORIZED`、`ADMIN_NOT_CONFIGURED`、`FORBIDDEN`。

2. 新增只读管理 action。
   - `getAdminMe`
   - `dashboardSummary`
   - `listUsers`
   - `getUserDetail`
   - `listPointTransactions`
   - `listOrders`
   - `listUsageRecords`
   - `listApps`
   - `listPackages`
   - 可增强现有 `listAuditLogs` 筛选，但不得破坏旧参数。

3. 统一分页、筛选和字段白名单。
   - 分页参数：`page`、`pageSize`，`pageSize` 最大 100。
   - 时间参数：`startAt`、`endAt`，无效时间返回 `INVALID_PARAM`。
   - 列表返回结构：`{ list, total, page, pageSize }`。
   - 不返回内部 token、支付私钥、回调密文等敏感字段。

4. 补充后端测试脚本或最小验证工具。
   - 可新增 `scripts/admin-web-smoke.js` 或 `scripts/admin-core-smoke.js`，用于说明/执行调用 `adminCore` action 的 smoke 验证。
   - 如果无法在本地无登录态直接调用 Web 身份，可脚本中明确要求通过 CloudBase Web 登录态或控制台测试，并覆盖参数校验逻辑。

5. 更新文档。
   - 更新 `docs/admin_operations.md`：新增 Web 管理端前置条件、`ADMIN_WEB_UIDS`、只读 action 列表、错误码。
   - 必要时更新 `docs/CODE_WIKI.md` 的 `adminCore` 说明。

## 范围边界

- 要做：后端鉴权与只读查询 API。
- 不要做：新建 `admin-web/` 前端、调分 UI、应用/充值包编辑 UI、部署静态站点。
- 不要做：直接暴露数据库集合给 Web；不要引入外部业务数据库。
- 不要做：改变小程序现有用户端调用协议。

## 实现约束

- `adminCore` 继续 CommonJS，两空格缩进。
- 所有 action 保持 `{ ok, data/error, requestId }` 响应结构。
- `validateAdmin` 可重构，但必须兼容现有小程序 openid 管理调用。
- 所有集合查询必须考虑 collection 不存在时返回稳定错误。
- `dashboardSummary` 只做轻量聚合；不要扫描超大集合做复杂统计。可使用 `count()`、有限 `limit()` 和按时间排序的最近数据。

## 验证要求

至少运行：

```bash
bash scripts/check-js.sh
bash scripts/check-boundaries.sh
git diff --check
```

人工/脚本验证：

- 非管理员调用 `getAdminMe` 返回 `FORBIDDEN` 或 `UNAUTHORIZED`。
- 未配置 `ADMIN_WEB_UIDS` 时，Web 管理调用返回 `ADMIN_NOT_CONFIGURED`。
- 管理员身份下只读接口返回字段白名单，不包含敏感字段。
- 小程序 openid 管理路径仍可调用原有 `initSchema`、`listAuditLogs`。

## 交接说明

- 给 Phase 2：交接新增的身份 helper、只读 action 名称、分页/筛选约定和已更新文档。
- 剩余风险：真实 Web `uid` 需要用户在 CloudBase Auth 创建账号后配置；没有真实 uid 时可通过控制台/模拟 event 做结构验证，但要在交接中说明未做真实登录验证。
