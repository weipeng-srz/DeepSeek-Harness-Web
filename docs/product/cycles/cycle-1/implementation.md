# 第 1 轮研发实现说明

## 1. 改动范围

| 层 | 文件 | 说明 |
| --- | --- | --- |
| 服务端 | `server/store.mjs` | 置顶、软删除/恢复、全文搜索、分页、预览清洗、启动清理 |
| 服务端 | `server/index.mjs` | 会话查询参数、restore 路由、重生成/编辑、附件、限流、幂等、gzip/ETag、重启上下文重放 |
| 前端 | `public/index.html` | 搜索清除、结果数、加载更多、附件区、命令面板、快捷键面板、重命名弹窗、跳转链接 |
| 前端 | `public/js/app.js` | 会话菜单、重命名、置顶、撤销、草稿、附件暂存/进度、消息操作、用量浮层、命令面板、焦点陷阱、主题三态、待发重试 |
| 前端 | `public/css/refine.css` | 新增组件、44px 热区、对比度、骨架屏、响应式与 reduced-motion |
| 工具 | `tools/qa/*.mjs` | E2E/API/断网/无障碍/审计脚本 |

## 2. 接口变更

```http
GET /api/conversations?q=&limit=60&offset=0
→ { conversations, total, hasMore, nextOffset }

PATCH /api/conversations/:id
{ "title": "≤60 字", "pinned": true }

DELETE /api/conversations/:id
→ { ok, undoUntil }            # 软删除，8s 后清理工作区

POST /api/conversations/:id/restore
→ { conversation }

POST /api/conversations/:id/chat
{
  "text": "…",
  "retryOf": "m_xxx",          # 重新生成
  "editOf": "m_yyy",           # 编辑重发
  "attachments": [{"path":"uploads/a.txt"}]
}
Header: Idempotency-Key

消息模型新增：user.attachments[]、user.editedAt
```

## 3. 关键实现

### 3.1 搜索

- 标题命中 +4，用户消息 +2，助手消息 +1；按分数、时间排序。
- `snippetAround` 去掉 Markdown 后在命中词前后 42 字截取；保留连字符。
- 前端 240ms 防抖，返回时校验 query 未变，避免串台。

### 3.2 软删除 / 撤销

- `deletedAt` 标记，列表立即过滤；8 秒内 `restore` 清除标记。
- 后台每 2 秒清理过期项并删除工作区；启动时清理上次残留。
- 前端 Toast 6.5s 展示「撤销」，走 restore。

### 3.3 重生成 / 编辑

- `retryOf`：删除目标助手及之后消息，复用前一条用户消息，不新增气泡。
- `editOf`：更新用户消息、删除其后消息，再生成；客户端同步移除 DOM。
- 原生会话在同进程内 resume；服务重启后使用 `SERVER_EPOCH` 判断，旧会话自动新建并注入最近 16 条上下文。

### 3.4 附件

- 前端暂存 → 发送时 XHR 上传（进度/取消）→ 聊天请求携带路径。
- 服务端 `normalizeAttachments` 使用 `resolveWorkspaceFile` 校验真实路径，拒绝穿越/超限。
- 提示词追加附件清单；用户消息持久化 `attachments`，刷新后气泡仍显示。

### 3.5 可靠性

- 静态资源 gzip + ETag + 版本化 immutable；HTML no-store。
- 聊天 12 次/分限流；同会话 `activeRuns` + `startingRuns` 双锁；`Idempotency-Key` 2 分钟去重。
- 断网消息保留在 `pendingSend`，恢复连接时不被 `resumeConnection` 重渲染冲掉。

## 4. 测试命令

```bash
export ACCESS_CODE=$(python3 -c "import json;print(json.load(open('config.json'))['accessCode'])")
node tools/qa/e2e.mjs
node tools/qa/api.mjs
node tools/qa/offline.mjs
node tools/qa/a11y.mjs
node tools/qa/audit.mjs
```

> Node 可使用 DeepSeek Harness 内置运行时；headless Chrome 需开启 `--remote-debugging-port=9222`。

## 5. 回滚

- 前端：`refine.css` 可整体移除；`app.js` 本轮改动均带空值保护，旧 DOM 不致命。
- 服务端：删除新增路由/参数即可回到 v2；数据结构新增字段向后兼容（`pinned`/`deletedAt`/`attachments`）。
- 建议每次发布前 bump `?v=`，避免 immutable 缓存。
