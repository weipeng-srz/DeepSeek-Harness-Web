# DSH Chat 五轮体验优化 · 最终报告

> 项目：DSH Chat（<http://127.0.0.1:8787>）
> 周期：2026-10-22 · 5 轮「用户试用 → 50 条需求 → PRD → 研发 → 测试 → PM 验收 → 用户复测」
> 版本：v3.4
> 结论：**可日常使用、可回滚、可验证的发布候选**；仍有明确未做项，不宣称「完美」。

---

## 1. 一页结论

| 指标 | 结果 |
| --- | --- |
| 反馈需求 | **250 条**（每轮 50） |
| 最终交付 | **190 条** |
| 部分交付 | **10 条** |
| 明确延后 | **50 条**（逐条列在每轮验收） |
| 自动化检查 | **88 项全绿**（E2E 60 + API 23 + 断网 5） |
| 无障碍 | 312 文本节点 0 对比度失败；16 次 Tab 不逃逸 |
| 首屏 | CSS 6 请求 → 1；无公式时 KaTeX 0 字节；FCP 88ms |
| 窄屏 | 320px 无横向滚动；可点目标 ≥44px |
| 离线 | Service Worker 离线 shell + 已缓存会话可开 |
| 缺陷 | 无 S1/S2 未关闭；控制台 0 报错 |

**一句话**：从「能用」推进到「敢每天用」——不丢、找得到、留得下、断网能开、窄屏能点、数据能带走。

---

## 2. 五轮主线

| 轮次 | 主题 | 用户问题 | 关键交付 | 验收 |
| --- | --- | --- | --- | --- |
| 1 | 可信赖的日常使用 | 删了没、草稿丢、传文件没进度、手机点不准 | 重命名/置顶/全文搜索/删除撤销、草稿、附件暂存、重新生成/编辑重发、用量、快捷键、焦点陷阱、gzip/软删除 | 29/29 + 18/18 |
| 2 | 从容管理更多对话 | 40 条会话找不到、长文翻不动、刷新回错会话 | 深链 `/c/<id>`、消息锚点、会话内查找、滚动恢复、归档/批量、⌘P、设置、统计、副本、备份、PWA | 17/17 + 29/29 |
| 3 | 把好内容留下来 | 好回答只能复制、提示词重复打、长对话没总结 | 收藏/面板/跳回、提示词库、结构化总结、阅读进度、未读基线、`#q=` 查找分享、批量撤销 | 8/8 + 46/46 |
| 4 | 轻、稳、可达 | 首屏为公式买单、长对话卡、断网白屏、320 挤 | CSS bundle、KaTeX 懒加载、长对话窗口化、Service Worker 离线、更新提示、Alt+↑/↓、高对比度、打印 | 54/54 |
| 5 | 收口 | 备份不能导回、文件不能删、设置分散 | 备份导入、文件上传/插入/删除、存储占用、全部已读、跨标签同步、测试数据清理 | 88/88 |

每轮文档：

- `docs/product/cycles/cycle-1/` ~ `cycle-5/`
- 每轮含 `user-trial.md`、`requirements.md`、`test-report.md`、`acceptance.md`
- 第 1 轮另有 `implementation.md`（接口与回滚）

---

## 3. 产品能力地图（最终态）

### 3.1 对话

- 新建/切换/重命名/置顶/归档/删除（8 秒撤销）/批量归档/批量删除（撤销）
- 全文搜索（标题 + 正文 + 片段高亮）、⌘P 快速切换、深链与消息锚点
- 会话内查找（⌘F）、命中计数/上下跳、日期分隔、滚动位置恢复
- 统计（消息/Token/用时/文件/引擎/权限/时间）、创建副本（含工作区）、结构化总结

### 3.2 消息

- 流式正文/思考、工具卡（参数/结果/耗时/复制/失败展开）
- 重新生成、编辑重发、停止、继续、失败重试、用量浮层
- 复制提问/回答、导出 Markdown、消息链接、收藏、时间戳

### 3.3 输入与文件

- 按会话草稿、字数提示、斜杠命令、快捷键帮助
- 拖拽/粘贴附件、5 个上限、25MB 校验、进度/取消、随消息持久化
- 文件抽屉：上传、预览、下载、插入路径、删除、空状态

### 3.4 设置与数据

- 主题三态、密度、字号、完成通知、全部已读、存储占用
- 备份导出/导入（新 ID、`[导入]` 前缀、24MB 限制）
- 跨标签页同步收藏/提示词/偏好

### 3.5 可靠性与性能

- 原生 token 流、headless 兜底、重启上下文重放、跨设备续接
- 单会话单飞、限流、幂等、软删除、原子写
- CSS bundle、KaTeX 懒加载、长对话窗口化、Service Worker、ETag/gzip/immutable

---

## 4. 质量证据

### 4.1 自动化

| 套件 | 覆盖 | 结果 |
| --- | --- | --- |
| `tools/qa/e2e.mjs` | 会话/消息/附件/重生成/编辑/快捷键/删除撤销 | 29/29 |
| `tools/qa/e2e2.mjs` | 深链/查找/滚动/归档/批量/设置/统计/副本 | 17/17 |
| `tools/qa/e2e3.mjs` | 收藏/提示词/进度/未读/查找分享 | 8/8 |
| `tools/qa/e2e5.mjs` | 文件增删/插入/导入/全部已读 | 6/6 |
| `tools/qa/api.mjs` | 鉴权/分页/搜索/归档/软删除/穿越/CSRF/压缩/导入 | 23/23 |
| `tools/qa/offline.mjs` | 离线保留/重试/连接条 | 5/5 |
| `tools/qa/a11y.mjs` | 对比度 + 焦点陷阱 | 0 失败 |
| `tools/qa/_sw.mjs` | 离线 shell | 通过 |
| `tools/qa/_math.mjs` | KaTeX 按需 | 0 → 1 |
| `tools/qa/_narrow.mjs` | 320px/键盘导航 | 通过 |

复跑：

```bash
export ACCESS_CODE=$(python3 -c "import json;print(json.load(open('config.json'))['accessCode'])")
node tools/qa/e2e.mjs && node tools/qa/e2e2.mjs && node tools/qa/e2e3.mjs && node tools/qa/e2e5.mjs
node tools/qa/api.mjs && node tools/qa/offline.mjs && node tools/qa/a11y.mjs
```

### 4.2 手工验收

- 真实模型发消息、附件、重生成、编辑重发、总结确认
- 删除 → 撤销、批量归档/删除 → 撤销
- 断网 → 发送 → 恢复 → 自动/手动重试
- 320px、键盘 Tab/Alt+↑↓、移动端键盘弹起
- 离线刷新、更新提示、导入备份、文件删除

---

## 5. 架构与接口变更

### 5.1 服务端

- `server/store.mjs`：`pinned`/`archivedAt`/`deletedAt`、搜索/分页、软删除与恢复、副本、备份/导入、原子写。
- `server/index.mjs`：
  - `GET /api/conversations?q=&limit=&offset=&archived=`
  - `PATCH /api/conversations/:id`（`title`/`pinned`/`archived`/`permission`）
  - `DELETE` 软删除 + `POST /:id/restore`
  - `POST /:id/chat`（`retryOf`/`editOf`/`attachments`/Idempotency-Key/限流）
  - `POST /:id/duplicate`、`GET /api/backup`、`POST /api/backup/import`
  - `POST /:id/files/delete`、`/c/<id>` SPA fallback
  - CSS bundle、gzip/ETag、immutable 缓存

### 5.2 前端

- `public/js/app.js`：单 IIFE，新增路由、查找、窗口化、收藏、提示词、设置、导入、SW 注册、消息导航等。
- `public/css/refine.css`：v3 增量层；`ux.css` 为并行体验层；二者由 `/css/bundle.css` 统一输出。
- `public/sw.js`：shell/静态缓存，API 直连。
- `public/manifest.webmanifest` + 图标：可安装。

> 回滚：前端移除 `refine.css`/`ux.css` 与对应 JS 增量；服务端新字段向后兼容，删除新路由即可回到 v2。

---

## 6. 明确未做（不假装完美）

| 项 | 原因 | 建议 |
| --- | --- | --- |
| 收藏/提示词跨设备同步 | 需要服务端模型与冲突策略 | 引入用户设置表 |
| 从任意消息 fork | 需要会话截断 + 新会话上下文 | 第 6 轮 |
| AI 自动标题 | 每轮额外模型调用 | 可选开关 |
| 导入去重/合并 | 冲突语义复杂 | 先按新 ID 导入 |
| 文件批量下载/跨对话库 | 使用频率低 | 观察 |
| 全部 Markdown 导出 | 需压缩打包 | 后续 |
| 虚拟滚动 | 窗口化已覆盖 300 段上限 | 观察长会话 |
| 拆分 `app.js` | 无构建链 | 引入 Vite/esbuild |
| 设计 token 文档 | 实现已用变量 | 工程化时补 |
| VoiceOver 全流程 | 需人工 | 发布前人工走查 |
| Safari 打印 | 未实机 | 发布前验证 |

---

## 7. 下一步路线（若继续）

1. **工程化**：Vite 拆分 `app.js`，CSS 只保留 token + 组件两层；建立 CI 跑 88 项检查。
2. **协作**：多用户 owner、会话共享（只读快照）、收藏/提示词服务端同步。
3. **知识库**：文件跨对话检索、引用回答、RAG 索引。
4. **可观测**：前端错误上报、长任务耗时、模型成本看板。
5. **移动端**：PWA 安装引导、通知权限引导、长按菜单。

---

## 8. 交付物

- 运行中的服务：<http://127.0.0.1:8787>（访问码见 `config.json`）
- 代码：`server/`、`public/`、`bridge/`
- 测试：`tools/qa/`
- 产品过程：`docs/product/cycles/cycle-1..5/`（250 条完整记录）
- 收敛版发布文档：`docs/product/v3/`（50 条总 PRD / 发布说明 / 追踪矩阵）
- 文档索引：`docs/product/README.md`
- 数据备份：`data/conversations.backup-2026-10-22.json`
- 本报告：`docs/product/final-report.md`
