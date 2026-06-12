# LLM Prompt: huli-tools nursing_undercover Phase 3/3

## 阶段目标

完成 `谁是卧底（护理版）` 的历史回看、体验收口、文档同步和完整验收。Phase 3 不新增大范围产品能力，重点是把 Phase 1 和 Phase 2 的实现变成可交付、可维护、可验证的项目成果。

本阶段完成后，新 coding Agent 应能运行 gate、阅读文档、按测试清单验证应用；用户能在小程序里完成对局并查看最近复盘记录。

## 必读输入

- `/Users/huli-dev/Documents/huli-tools/AGENTS.md`
- `/Users/huli-dev/Documents/huli-tools/promptDocs/prompt-pack-huli-tools-nursing-undercover-0609/master_spec_huli-tools-nursing-undercover_0609.md`
- `/Users/huli-dev/Documents/huli-tools/promptDocs/prompt-pack-huli-tools-nursing-undercover-0609/test_case_huli-tools-nursing-undercover_0609.md`
- Phase 1 和 Phase 2 的交接说明
- 当前实际代码

## 任务清单

1. 补齐历史记录和恢复体验。
   - 完整实现 `listMyGames` 分页，默认展示当前用户最近 10 条。
   - 小程序页面增加最近对局入口或下方列表，可查看已完成对局复盘。
   - `getGame` 能打开历史已完成 session，并展示结果、正确答案、关键线索和知识点。
   - 页面重新进入时，如存在未完成 session，可提示继续或取消；不要页面隐藏就自动取消。

2. 打磨小程序交互。
   - 检查所有按钮 loading / disabled 状态，避免重复提交。
   - 发言文本限制长度，空文本不能提交。
   - NPC 发言、投票理由、复盘知识点在小屏不溢出、不遮挡。
   - 结果区区分玩家胜利、玩家失败、取消、失败状态。
   - 所有用户可见错误文案简洁，不暴露内部 token、模型密钥或堆栈。

3. 收口云函数边界和数据质量。
   - 检查所有 action 都校验 openid、session 归属和状态。
   - 检查 `app_nursing_undercover_sessions` 字段不混入公共 collection。
   - 检查 `resultRef` 大小合理，不把完整 transcript 塞进 `app_usage_records`。
   - 检查 `finishUsage` / `failUsage` 重复调用不会重复结算或释放。
   - 如有调试日志，保留必要错误上下文，删除嘈杂日志和敏感输出。

4. 更新项目文档。
   - `docs/cloud_collections.md`：完整描述 `app_nursing_undercover_sessions` 字段、权限建议和 seed。
   - `docs/CODE_WIKI.md`：增加新应用页面、云函数、数据流和测试入口摘要。
   - `docs/app_boundary_and_onboarding.md`：如实际接入流程发现需要补充通用规则，只写长期通用规则；不要写单次过程。
   - `promptDocs/prompt-pack-huli-tools-0526/test_case_huli-tools_0526.md`：追加新应用冒烟和边界用例。
   - `run_manifest_huli-tools_0526.toml`：追加新应用相关说明或 gate，不要写不存在的命令。
   - 视实际情况创建 `docs/app_nursing_undercover_handoff.md`，记录部署、配置、测试和已知风险。

5. 检查是否需要更新 `AGENTS.md`。
   - 默认不更新，因为本应用是业务竖切。
   - 只有发现新的全局架构约束、长期安全规则或平台通用规则时，才最小更新 `AGENTS.md`。
   - 如果更新，必须保持 `AGENTS.md` 简洁，总体 200 行以内，并删除或整合过时内容。

6. 完整验收。
   - 按本 prompt pack 的 `test_case` 执行可自动验证项。
   - 如本地有微信小程序上传私钥且账号有权限，生成预览二维码。
   - 若无法真机预览，明确说明缺少的条件。

## 范围边界

要做：

- 历史回看。
- 异常恢复和体验打磨。
- 项目文档和主测试清单同步。
- 全量 gate 和交接说明。

不要做：

- 不新增教师端、admin-web 管理页或多人联机。
- 不继续扩充大量题库；场景数量达到 master spec 要求即可。
- 不重构公共底座。
- 不做正式发布、提交、推送，除非用户明确要求。

## 实现约束

- 文档中的命令必须能在 `/Users/huli-dev/Documents/huli-tools` 解析。
- 不要把 CloudBase MCP 输出中的敏感凭据写进文档。
- 不要提交二维码图片、私钥、临时调试目录或真实日志。
- 只更新和本应用相关的长期文档，不做无关清理。

## 验证要求

至少运行：

```bash
cd /Users/huli-dev/Documents/huli-tools
bash scripts/check-js.sh
bash scripts/check-boundaries.sh
bash scripts/check-admin-web-boundaries.sh
git diff --check
git status --short --branch
```

建议额外检查：

```bash
node -e "JSON.parse(require('fs').readFileSync('miniprogram/app.json','utf8')); JSON.parse(require('fs').readFileSync('cloudbaserc.json','utf8')); console.log('json ok')"
```

可选预览：

```bash
NODE_OPTIONS=--no-experimental-webstorage npx -y miniprogram-ci preview \
  --appid wx1654159e6e3bb334 \
  --project-path /Users/huli-dev/Documents/huli-tools \
  --private-key-path /Users/huli-dev/Documents/huli-tools/private.wx1654159e6e3bb334.key \
  --use-project-config \
  --upload-version nursing-undercover-preview \
  --threads 0 \
  --qrcode-format image \
  --qrcode-output-dest /tmp/huli-tools-nursing-undercover-preview.png
```

## 交接说明

最终交接必须包含：

- 完成的 phase 和关键文件路径。
- 使用的 CloudBase envId、云函数名、collection 名和 appKey。
- 实际 AI 模型配置与 preflight 结果。
- 运行过的 gate 命令和结果。
- 小程序预览二维码路径，或无法生成的具体原因。
- 剩余风险和明确非目标。
