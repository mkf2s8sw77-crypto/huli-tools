# 应用交付说明: 护理论文英文润色 (paper_polish)

## 1. 概述

- appKey: `paper_polish`
- 应用名称: 护理论文英文润色
- 云函数: `app_paper_polish`
- 入口页面: `/pages/apps/paper_polish/index`
- 积分定价: `{ mode: "fixed", costPoints: 0 }`（免费）
- 模型绑定: `paper_polish__polish`（经 `coreModel.generateText` 调用，应用不直连任何大模型）

## 2. 功能描述

用户粘贴护理论文草稿（中文或英文，≤20000 字符），可选指定章节类型（摘要/引言/方法/结果/讨论/结论/标题，默认自动检测），服务端组装 prompt 后经 `coreModel` 调大模型，返回 Nature 风格英文成稿与中文改动要点；成稿页面展示并支持一键复制。

润色规则蒸馏自开源项目 [nature-skills](https://github.com/Yuan1z0825/nature-skills) 的 `nature-polishing` 技能（Apache License 2.0，固定 commit `1562ab71e5aec0b313f5311130438ba04c7830c9`），并叠加原创护理领域附录（PICO、CONSORT/STROBE/COREQ/PRISMA 表述对齐、护理术语一致性）。蒸馏内容位于 `cloudfunctions/app_paper_polish/prompts/`，各文件头部已保留署名与改动声明；上游后续更新需人工重新蒸馏，不做自动同步。

### 执行模式（异步任务）

1. 客户端 `createUsage("paper_polish")`（0 积分，usage 状态保持 `created`，无积分冻结）。
2. `app_paper_polish.submit` 校验 usage 与输入，创建任务文档（`_id=usageId`，幂等），随后以函数间自调用触发内部 `runTask`（带 `_internalToken`，不等待完成）。
3. `runTask` 组装 prompt → `coreModel.generateText`（`capability: "polish"`，单次调用不自行重试）→ 成功写任务并 `finishUsage`，失败按错误分类写任务并 `failUsage`。
4. 客户端每 3s 轮询 `query`；`processing` 超 10 分钟由 `query` 置 `timed_out` 并结束 usage（read-time 兜底）；页面隐藏/退出只停轮询，重新进入时经 `latest` 恢复。

## 3. 私有集合

| 集合名 | 用途 |
|---|---|
| `app_paper_polish_tasks` | 润色任务文档（输入元数据、状态、成稿、改动要点、错误信息），`_id=usageId`，默认 7 天过期。字段契约见 `docs/cloud_collections.md` §15 |

## 4. 部署步骤

1. 部署云函数 `app_paper_polish`（IDE 右键「创建并部署：云端安装依赖」，或 `tcb fn deploy app_paper_polish`；`cloudbaserc.json` 已登记，超时 300s）。
2. 配置环境变量：`INTERNAL_API_SECRET`（与其他云函数一致的随机字符串）。
3. 在云开发控制台创建集合 `app_paper_polish_tasks`，权限设置为「仅管理端可读写」（客户端无权限）。
4. 管理员调用 `adminCore.upsertApp` 注册应用：
   ```js
   { appKey: "paper_polish", name: "护理论文英文润色", description: "粘贴论文草稿，生成 Nature 风格英文成稿",
     entryPage: "/pages/apps/paper_polish/index", cloudFunctionName: "app_paper_polish",
     status: "active", pricing: { mode: "fixed", costPoints: 0 }, sortOrder: 4 }
   ```
5. 管理员调用 `adminCore.upsertModelBinding` 配置模型绑定：
   ```js
   { appKey: "paper_polish", capability: "polish", providerKey: "minimax_default",
     fallbackProviderKeys: [], enabled: true }
   ```
   （providerKey 以管理端「模型管理」中已启用且 smoke 通过的 provider 为准。）
6. `miniprogram/app.json` 页面路径与首页磁贴映射已在代码中注册，无需手工配置。

## 5. 测试用例

参见 `promptDocs/prompt-pack-huli-tools-0526/test_case_huli-tools_0526.md` TC-26（异步任务状态机、输入校验、幂等、超时兜底、错误分类）。
单元测试：`node --test tests/paper-polish-core.test.js`（语言检测、章节归一化、prompt 组装、输出解析）。

## 6. 已知限制

- 仅支持粘贴文本输入，不支持 docx/pdf 文件上传；单次最长 20000 字符，整篇长论文需分段提交。
- 单次模型调用、不分块；成稿长度受 `maxTokens: 8192` 约束，输入侧以字符上限规避截断；成稿异常短时按 `POLISH_OUTPUT_INVALID` 失败处理。
- 模型输出未按 JSON 契约解析时降级为原始文本返回（`degraded=true`，无改动摘要）。
- `runTask` 依赖函数间自调用实现后台执行，无独立 Worker/timer；函数异常退出时由 `query` 的 10 分钟超时兜底结算。
- 未配置模型绑定时任务以 `POLISH_SERVICE_UNAVAILABLE` 失败，需管理员在「模型管理」完成绑定后重试。
