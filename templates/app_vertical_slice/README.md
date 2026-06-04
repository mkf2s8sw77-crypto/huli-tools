# 新应用竖切模板

> 本目录包含新应用接入所需的全部模板文件。模板已预配置柔彩多巴胺设计系统，新应用默认引用全局 Token 和公共组件。

## 设计系统约束

- 模板页面通过 `app.json` 全局注册的 `ui-page`、`ui-card`、`ui-form-field` 等公共组件构建 UI。
- 页面样式使用 `var(--color-*)` Token，**不得重新定义平台主色、卡片、按钮、状态标签等公共视觉规则**。
- 页面 wxss 仅保留该应用的业务私有样式（如业务结果区布局）。
- 当前设计系统为柔彩多巴胺风格（薄荷青、晴空蓝、桃粉、珊瑚橙、薰衣草紫），不得回退到旧版深蓝青色板。
- 详见 `docs/design_system.md`。

## 使用方法

假设新应用的 `appKey` 为 `my_app`：

### 1. 复制云函数模板

```bash
cp -r templates/app_vertical_slice/cloudfunctions/app___appKey__ cloudfunctions/app_my_app
mv cloudfunctions/app_my_app/index.js.template cloudfunctions/app_my_app/index.js
```

在 `index.js` 中全局替换 `__appKey__` 为 `my_app`，然后实现你的业务逻辑。

### 2. 复制前端页面模板

```bash
cp -r templates/app_vertical_slice/miniprogram/pages/apps/__appKey__ miniprogram/pages/apps/my_app
cd miniprogram/pages/apps/my_app
for f in *.template; do mv "$f" "${f%.template}"; done
```

在所有文件中全局替换 `__appKey__` 为 `my_app`，替换 `__appName__` 为应用显示名。

### 3. 注册页面

在 `miniprogram/app.json` 的 `pages` 数组中添加：

```json
"pages/apps/my_app/index"
```

### 4. 注册应用

管理员调用 `adminCore.upsertApp`，在 `apps` 集合中注册应用信息。参见 `docs/app_boundary_and_onboarding.md` 的接入流程。

### 5. 部署

在微信开发者工具中右键 `cloudfunctions/app_my_app` → 「创建并部署：云端安装依赖」。

应用云函数必须配置与公共云函数一致的 `INTERNAL_API_SECRET`，否则无法回调 `coreApp.finishUsage` / `failUsage`。

### 6. 更新文档

- `docs/cloud_collections.md`：如有私有集合，追加说明。
- `promptDocs/prompt-pack-huli-tools-0526/test_case_huli-tools_0526.md`：增加冒烟用例。
- `run_manifest_huli-tools_0526.toml`：如有新 phase，追加。

## 模板文件清单

| 文件 | 说明 |
|---|---|
| `cloudfunctions/app___appKey__/index.js.template` | 应用云函数模板 |
| `cloudfunctions/app___appKey__/package.json` | 云函数依赖 |
| `cloudfunctions/app___appKey__/config.json` | 云函数配置 |
| `miniprogram/pages/apps/__appKey__/index.js.template` | 页面逻辑模板 |
| `miniprogram/pages/apps/__appKey__/index.wxml.template` | 页面结构模板（使用 ui-page 等公共组件） |
| `miniprogram/pages/apps/__appKey__/index.wxss.template` | 页面样式模板（仅业务私有样式） |
| `miniprogram/pages/apps/__appKey__/index.json.template` | 页面配置模板 |
| `docs/app___appKey___handoff.md.template` | 应用交付说明模板 |
