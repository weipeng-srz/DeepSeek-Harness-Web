# Round 2 · QA 报告

日期：2026-10-22 · 版本：5.0-r2 · 环境：macOS / Node 22 / Chrome 155

## 1. 结果

| 套件 | 结果 | 覆盖 |
| --- | --- | --- |
| `share.mjs` | 37/37 | token、有效期、单条分享、工具/思考开关、公开页、撤销、删除联动、加密落盘、导出 |
| `trust.mjs` | 18/18 | 审计 8 类事件、令牌加密、撤销清空、幂等导入、Secure Cookie/HSTS、对外地址、登出吊销 |
| `project-files.mjs` | 11/11 | 上传/列表/打开/鉴权/删除、复制到工作区、UI 上传 |
| `productivity.mjs` | 16/16 | 变量填充、安全默认导出、工具/元数据开关、单条分享、语音入口 |
| `versions.mjs` | 17/17 | 版本保存/采用/并排对比、分叉、行号 diff |
| `library.mjs` | 10/10 | 收藏/提示词跨设备、备份合并、非法条目过滤 |
| `v5-cycle1.mjs` | 23/23 | 权限确认、diff、富文本复制、CSV 全表复制/GBK、快捷键、撤销、读屏 |
| `projects.mjs` | 24/24 | 项目 CRUD/筛选/移动/导入导出/移动端 |
| `api.mjs` | 23/23 | 鉴权/分页/搜索/软删除/上传/缓存 |
| `stop.mjs` | 6/6 | 假 DSH 下权限透传、停止后保留部分回答 |
| `quality-baseline.mjs` | 36/36 | 布局/焦点/控制台/API 边界 |
| `large-text.mjs` | 3/3 | 超大字号无横向溢出 |

## 2. 关键证据

- 分享：未登录 `GET /api/share/:token` 200；撤销/过期 410；公开 JSON 不含 owner/conversationId/token/projectName；工具/思考默认不出现。
- 单条分享：快照恰好 2 条消息；另一轮回答不出现。
- 删除：8 秒撤销窗口内链接 200；purge 后 410；恢复对话链接仍有效。
- 落盘：`shares.json` 无明文 token；撤销后 `snapshot.messages == []`；文件 0600。
- 导出：默认 Markdown 不含 `权限：`、`工具：`、`echo hello`；勾选后出现；HTML 无 `<script>`。
- 导入：同一备份第二次 `imported=0, skipped=1`。
- 登出：旧 Cookie 由 200 变 401。
- HTTPS 信号：`X-Forwarded-Proto: https` → `Secure` Cookie + HSTS。
- 项目文件：上传后下一次提问出现在 `<workspace>/project/<name>`，内容一致。

## 3. 已知限制

- 未在真实 4G/公网环境验证分享链接；`publicBaseUrl` 与 TLS 只验证配置与协议行为。
- 未生成真实证书，TLS 仅代码路径与反向代理头验证。
- 审计无操作者身份（单访问码模型）；分享撤销后快照正文清空但标题/计数保留。
- 未做 2MB 以上快照的浏览器性能测试；>500 条消息明确 413。
- 实时运行实例需要在验收前重启才能加载本轮接口（评审期间旧进程 `/api/shares` 返回未知接口）。
