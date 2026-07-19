# MAIC 原生核心来源

- 来源仓库：`https://github.com/THU-MAIC/OpenMAIC`
- 本地归档仓库：`https://github.com/mkf2s8sw77-crypto/huli-MAIC`
- 独立服务归档 commit：`2c7ae521226aad7784969c09165ea7ba5fb56fde`
- 上游基准 commit：`c56929510ceba5122572da7916ba3174177649ed`
- 许可证：MIT，见同目录 `LICENSE`

本目录只保留协议、Prompt、JSON 修复、normalizer、validator、确定性兜底和测试所需实现。未引入 Next.js、SQLite、Drizzle、编辑器、Web 登录、图片/语音/视频生成或导出模块。

本地改造以微信小程序原生播放器和 CloudBase 状态机为边界：过滤 HTML、脚本、WebView、危险 URL 和 `navigate`，校验 PBL 引用，新课程首版固定空 `assets`。上游更新只评估生成质量、协议、JSON 修复、模型适配和安全修复。
