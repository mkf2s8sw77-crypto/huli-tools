# Implementation Plan

- [x] 1. 完成删除前保护
  - 推送 standalone/stash 两个归档分支并核对远端 SHA
  - 将 `huli-MAIC` 设为只读归档，只把文本模型 Key 暂存到 Keychain
  - _Requirement: 10_

- [x] 2. 停用并删除独立 MAIC 运行时
  - 通过 `adminCore` 将 `maic` 设为 disabled、0 积分并保留数据
  - 删除 PM2、60322 路由和本地目录，验证无监听与引用
  - _Requirement: 3, 10, 11_

- [x] 3. 建立 CloudBase 原生资源与协议核心
  - 创建 runtime/artifacts 集合、任务索引和私有权限
  - 实现协议 schema、normalizer、validator、JSON 修复与兜底课程
  - _Requirement: 2, 4, 8, 9_

- [x] 4. 实现任务 API、Worker 与 reconcile
  - 重构 app_maic 为队列 API，保留响应兼容和每日限额
  - 新增单并发 Event Worker、模型策略、artifact 导入和 usage 结算
  - 将 reconcile 收口为租约恢复、超时和遗留迁移
  - _Requirement: 1-7_

- [x] 5. 收口小程序、文档和上游检查
  - 更新 M2.7 展示文案、collection/env/运行清单/测试用例/AGENTS
  - 记录许可证与来源，新增只读上游 SHA 检查脚本
  - _Requirement: 4, 5, 8, 9_

- [x] 6. 本地门禁与 CloudBase 部署
  - 运行单测和项目边界检查
  - 核实目标环境套餐/模型组，部署无 timer Worker 并人工 smoke
  - 成功后启用 timer、部署 API/reconcile 并执行遗留迁移
  - _Requirement: 1-11_

- [ ] 7. 真实体验版验收与 Git 收口
  - 验证后台生成、取消/失败/超时、跨用户和旧课程
  - 通过后恢复 active/0 积分、删除 Keychain 临时项
  - 提交推送并快进合并 origin/main，不发布正式版
  - _Requirement: 1-11_
