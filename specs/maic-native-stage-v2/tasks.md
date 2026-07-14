# Implementation Plan

- [x] 1. 修复自动翻页
  - 生成器不再请求或保留 `navigate`
  - 播放器忽略旧 `navigate` 并补齐隐藏/退出取消逻辑
  - _Requirement: 1, 2, 4, 7_

- [x] 2. 建立原生舞台视图模型
  - 推导场景标签、布局模板、互动完成状态与按钮文案
  - 提取可独立测试的纯函数
  - _Requirement: 3, 5, 6_

- [x] 3. 重构播放器界面
  - 实现章节轨道、舞台标题、内容模板、教师旁白浮层和手动导航
  - 保留 quiz、interaction、pbl 的原生交互能力
  - _Requirement: 3, 4, 5_

- [x] 4. 补测试与门禁
  - 扩展 MAIC 协议/生成测试和 huli-tools 播放器测试
  - 运行项目 JavaScript、边界、构建和 diff 检查
  - _Requirement: 1-8_

- [x] 5. 部署与真实验收
  - 部署 MAIC dev 集成改动；确认 CloudBase `app_maic` 接口未变，无需重复部署云函数
  - 生成小程序预览并用真实课程验证无自动跳页
  - _Requirement: 1-8_
