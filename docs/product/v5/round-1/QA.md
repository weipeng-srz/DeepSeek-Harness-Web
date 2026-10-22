# Round 1 · QA 报告

日期：2026-10-22 · 版本：5.0-r1 · 环境：macOS / Node 22 / Chrome 155

## 1. 自动化结果

| 套件 | 结果 | 覆盖 |
| --- | --- | --- |
| `tools/qa/projects.mjs` | **24/24** | 项目 CRUD、筛选、移动、备份导入、删除回流、移动端布局 |
| `tools/qa/v5-cycle1.mjs` | **21/21** | 权限确认、headless 权限、diff、富文本复制、表格 TSV、CSV 预览、快捷键、撤销、读屏、通知、移动端 |
| `tools/qa/api.mjs` | **23/23** | 登录/鉴权、分页、搜索、重命名、软删除/撤销、上传、ETag/gzip、深链 |
| `tools/qa/quality-baseline.mjs` | **36/36** | 设置/主题/焦点陷阱/320–1440 布局/控制台异常/API 边界 |
| `tools/qa/a11y.mjs` | **0 对比度失败** | 142 文本节点；17 个焦点检查；焦点不逃逸 |
| `tools/review/consolidate.mjs --strict` | **20/20 人 · 1000/1000 条 · 0 问题** | 反馈完整性与去重 |

## 2. 关键证据

- 项目 API：空项目 → 创建 → 会话归档 → 筛选 → 备份（含 projectId）→ 导入（新项目 ID + 会话 remap）→ 删项目后会话回未归类。
- 权限：点击完全权限出现确认框；取消后服务端仍为 `workspace-write`；headless 子进程环境为 `DSH_PERMISSION_MODE=read-only|workspace-write|danger-full-access`。
- 复制：剪贴板同时有 `text/plain` 与 `text/html`；表格复制结果为 `城市\t温度\n杭州\t32…`。
- 文件：CSV 预览渲染 2 行数据；Office 文件给出可行动提示。
- 工具卡：edit 的旧行渲染为 `.diff-del`，新行渲染为 `.diff-add`。
- 删除：Toast「8 秒内可撤销（⌘Z）」；点击撤销后 `GET /api/conversations/:id` 恢复 200。
- 移动端：390px 打开含项目 chips 的侧栏，`scrollWidth === innerWidth`。

## 3. 截图

![Round 1 mobile](../../../../reports/v5/round-1/cycle1-mobile.png)

## 4. 未覆盖/已知限制

- 未做真实 DSH 生成任务的端到端权限行为验证（成本与时间），只验证环境变量透传与 UI 契约；Round 2 用只读任务复验。
- 未测 Safari/iOS 实机；Service Worker 通知仅静态检查与桌面 Chromium 验证。
- 未测 128MB 备份导入的真实峰值内存；Round 4 处理大库时补。
- 通知相关并行改动未纳入本轮验收。
