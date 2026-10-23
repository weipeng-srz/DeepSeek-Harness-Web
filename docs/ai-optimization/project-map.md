# 项目功能地图 · DSH Chat

> 基线：`main` @ `31999f1` + 未提交的 v6 前端演进 / DSH 模型选择工作区（2026-10-23）
> 本文档由 AI 研发团队通过实际读码 + 实际运行核验后编写。凡未经核验的推断均标注「未验证」。

## 1. 项目是什么

| 维度 | 事实 |
| --- | --- |
| 产品 | 本地优先（local-first）的个人 AI 工作台，中文 UI |
| 形态 | 单页 Web 应用 + 本地 Node 服务（127.0.0.1:8787），可内网/ Tailscale 访问，可装到手机主屏（PWA） |
| 用户 | 单一用户（`singleUser: true`）多设备；访问码登录，无多租户、无成员角色 |
| 核心价值 | 在手机/浏览器上换一个壳去用本机的 DeepSeek Harness Agent：流式回答、工具过程、文件、项目上下文、可交付的只读分享 |
| 规模 | 源码约 40.6k 行：`server/` 17 模块（`index.mjs` 3230 行）、`public/js` 5 文件（`app.js` 11181 行）、`public/css` 11 文件、`bridge/index.js` 921 行 |
| 运行环境 | Node ≥ 22（实测 v24.21.0），零运行时依赖（无 express / 无 bundler / 无 TS / 无 lint） |
| 数据 | `./data` 下 JSON 文件 + 工作区目录；单用户真实数据 `conversations.json` 已 8.6MB |

### 三个执行引擎（同一套 UI）

| 引擎 | 触发条件 | 行为 | 代码 |
| --- | --- | --- | --- |
| `native` | 桌面版 DeepSeek Harness 在跑且桥接已装 | 通过 `bridge/index.js` 在桌面宿主内建会话，网页与桌面共享会话、工具、模型；token 级流式 | `server/native.mjs`、`bridge/index.js` |
| `headless` | 桌面版未运行/桥接未启用时的兜底 | 起 `dsh --profile headless --json` 子进程，提交级流式 | `server/dsh.mjs`、`server/profile.mjs` |
| `codex` | 用户在新建对话时选 Codex 引擎 | app-server 协议线程，独立会话与模型目录 | `server/codex-bridge.mjs`、`server/codex.mjs` |

## 2. 架构

```
浏览器 (public/index.html + app.js + codex.js + dsh-models.js)
   │  fetch / NDJSON 流 (POST /api/conversations/:id/chat)
   ▼
server/index.mjs  ── 路由 + 鉴权 + 限流 + 原子写 + SSE hub
   ├── store.mjs          会话（conversations.json，去抖 150ms + 串行 flush + fsync + 日备份）
   ├── project-store.mjs  项目（projects.json + data/projects/<id>/ 文件）
   ├── share-store.mjs    只读分享快照（shares.json，令牌加密）
   ├── library-store.mjs  收藏 / 提示词（library.json）
   ├── memory-store.mjs   记忆（memory.json，按 owner/project 隔离）
   ├── audit.mjs          审计（audit.json，含设备指纹）
   ├── native.mjs  ──┐
   ├── dsh.mjs       ├── 三个引擎
   └── codex-bridge.mjs ┘
   └── notify.mjs         通知（macOS / iMessage / Web Push）
```

### 关键不变式（改动前必须读）

1. **单用户多设备**：`owner` 恒为 `single-user-owner`；所有资源读取必须走 `ownedConversation/ownedProject` 之类的归属校验，不能仅凭 id 直取。退出登录通过「纪元递增」吊销所有历史 Cookie。
2. **数据不能丢**：会话/项目/分享/记忆的写入必须保持原子（临时文件 + fsync + rename）；回收站 30 天；删除有 8 秒撤销窗口。
3. **分享是只读快照**：分享页 `/s/<token>` 用独立 `share.html` + `share.js`，无内联脚本、`noindex`、默认不选敏感内容、可选口令与有效期；源对话删除后分享联动撤销。
4. **敏感内容不可由客户端绕过**：分享/导出时的敏感扫描在服务端执行。
5. **CSS 只有一条交付路径**：`/css/bundle.css` 由 `server/index.mjs` 的 `CSS_BUNDLE_FILES` 顺序拼接（后者覆盖前者），`?v=` 变更才 immutable 缓存。新增样式表必须同时进 bundle 列表，否则线上不生效。
6. **app.js 单文件 IIFE**：没有模块系统，所有状态在闭包内；`app.js` 有 450KB 静态预算。
7. **零依赖**：不引入 npm 运行时依赖（Playwright 只在 QA 工具里用，来自外部 runtime 目录）。

## 3. 数据文件

| 路径 | 内容 | 备注 |
| --- | --- | --- |
| `data/conversations.json` | 全部会话与消息（含 blocks/thinking/tool 结果引用） | 8.6MB（实测）；工具结果 >200KB 落盘按需加载 |
| `data/backups/conversations-YYYY-MM-DD.json` | 日备份，保留 5 份 | 15MB（实测） |
| `data/projects.json` | 项目元数据 + 回收站 | |
| `data/shares.json` | 分享快照 | 令牌加密存储 |
| `data/library.json` | 跨设备收藏与提示词 | |
| `data/memory.json` | 记忆条目 | 按 owner/project 隔离 |
| `data/audit.json` | 操作审计 | 含设备指纹 |
| `data/workspace/chats/<convId>/` | 每个会话的工作区（上传文件、Agent 产物） | 665MB（实测，用户真实数据） |
| `data/auth-epoch` | 登录纪元，用于吊销 Cookie | |
| `config.json` | 端口、访问码、引擎开关 | 0600 |

**已知脏数据**：`data/` 下存在 2 个 0 字节 `conversations.json.*.tmp` 残留（原子写失败/中断的遗骸），没有清理机制。

## 4. 服务端接口

鉴权：除 `/api/health`、`/api/login`、`/api/share/:token` 外，全部要求 `dsh_access` Cookie；跨站写请求被 `Origin`/`Sec-Fetch-Site` 双重拒绝。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 存活探针 |
| POST | `/api/login` `/api/logout` | 访问码登录（IP 级 8 次/分钟）、登出吊销全部 Cookie |
| GET | `/api/me` | 能力与配置快照（模型、引擎、记忆、权限、baseUrl） |
| GET | `/api/conversations` | 列表：`q` 全文检索、`limit/offset`、`archived`、`trash`、`projectId`、`unfiled` |
| POST | `/api/conversations` | 新建（引擎/权限/项目默认值覆盖） |
| GET | `/api/conversations/:id` | 详情：`tail`/`before`/`limit` 分页，`full=1` 全量，`summary=1` 摘要 |
| PATCH | `/api/conversations/:id` | 标题/置顶/项目/归档/记忆开关/引擎/模型 |
| DELETE | `/api/conversations/:id` | 软删除（8 秒撤销） |
| POST | `.../chat` | 发消息并流式返回（NDJSON）；支持 `retryOf`/`editOf`/`attachments`/`instruction`；限流 12 次/分钟、并发 4 |
| POST | `.../stop` `.../answer` `.../approval` `.../messages/:mid/*` | 停止、答题卡、授权、消息级操作 |
| POST | `.../fork` `.../duplicate` `.../restore` `.../purge` `.../versions/:mid/*` `.../attach` `.../upload` `.../context` `.../open-codex` `.../activate` `.../tool` `.../raw` | 分叉、副本、回收站、版本历史与采用、附件、上传、上下文、唤起桌面 |
| GET/POST/PATCH/DELETE | `/api/projects[...]` | 项目 CRUD、文件上传/下载/删除、`restore`、`purge` |
| GET/DELETE/POST | `/api/shares[...]` | 分享列表、撤销、`refresh` 快照 |
| GET/POST | `/api/share/:token` | 匿名只读访问（可选口令，失败 8 次锁 10 分钟，IP 限 120 次/分钟） |
| GET/PATCH | `/api/settings` | 对外地址（分享链接 base） |
| GET | `/api/audit` `/api/library` `/api/memory` `/api/permissions` `/api/notify` | 审计/收藏/记忆/权限目录/通知 |
| GET | `/api/backup`、POST `/api/backup/import` | 全量导出、幂等导入（引用重映射） |
| GET | `/api/dsh/models`、`/api/codex/models`、`/api/codex/status` | 模型目录 |
| GET | `/css/bundle.css`、`/c/*`、`/s/*`、静态文件 | 样式打包、会话深链、分享页 |

## 5. 客户端功能清单

`public/index.html` 有 1 个登录视图 + 1 个主壳 + **20 个浮层**（sheet / modal / popover）。下表按用户旅程归类。

| ID | 功能 | 入口 | 预期行为 | 测试状态 | 已知问题 |
| --- | --- | --- | --- | --- | --- |
| F-01 | 访问码登录 | 登录视图 | 错误码有内联提示，成功后进主壳 | QA `api`/`baseline` 覆盖 API；UI 登录在多数套件里隐式覆盖 | — |
| F-02 | 新建对话 / 切换对话 | 侧栏「新对话」、会话列表 | 切换不串流、草稿按会话保存 | `productivity`、`large-text` | 切换时在飞流是否泄漏到新视图需实测 |
| F-03 | 发消息 + 流式 | composer | token 级增量、停止、错误内联 | 多套件 + 真机 | — |
| F-04 | 工具调用卡片 | 消息内 | 可展开、默认折叠成组、200KB 大结果按需加载 | `api`、`large-text` | — |
| F-05 | 授权卡片 / 答题卡 | 流内 | 完全权限二次确认、过期失效 | `trust` | — |
| F-06 | 会话搜索 | 侧栏顶部搜索 | 标题+正文，摘要高亮，分页 | `api`、`baseline` | 同步全量扫描，随数据量变慢 |
| F-07 | 置顶 / 重命名 / 归档 / 删除+撤销 | 会话行、批量管理栏 | 8 秒撤销、归档独立列表 | `api`、`trash` | — |
| F-08 | 项目空间 | 侧栏「项目」+ 项目筛选下拉 | 项目指令/资料/文件/默认引擎/默认权限、归档、30 天回收站、按项目隔离记忆 | `projects`（**当前失败**） | 筛选控件已由 chips 改为 `<select>`，`projects.mjs` 仍断言 `.project-chip` → 测试与实现漂移 |
| F-09 | 模型选择 | composer 上方浮层 | provider/模型/推理强度、按对话固定、跟随桌面默认 | 无自动化套件 | 需补 E2E |
| F-10 | 权限选择 | composer 权限按钮 | 三档权限、完全权限二次确认 | `trust` | — |
| F-11 | 文件上传/暂存/预览 | `+`、拖拽、粘贴 | ≤25MB×5、进度、断网待发送、文本/图片/PDF 预览 | `project-files`、`api` | — |
| F-12 | 只读分享 | 对话操作 → 分享 | 有效期/单条/选段/口令/自动打码/更新快照/撤销 | `share` | — |
| F-13 | 导出与打印 | 对话操作 | Markdown/HTML 安全默认、打印全量/仅正文 | `print` | — |
| F-14 | 版本历史 / 重写 / 就地编辑 / 分叉 | 消息操作 | 30 版、并排对比、保留工具与思考 | `versions`、`rewrite` | — |
| F-15 | 记忆 | 侧栏「记忆」 | 自动捕获、手动增删、按项目隔离、可关闭 | `memory-scope` | — |
| F-16 | 收藏 / 提示词 | 侧栏 | 跨设备同步 | `library` | — |
| F-17 | 回收站 | 侧栏 | 30 天、恢复、永久删除 | `trash` | — |
| F-18 | 备份导入导出 | 设置 | 幂等、引用重映射 | `projects`、`api` | 工作区/项目文件不随 JSON 备份（已声明） |
| F-19 | 命令面板 / 快捷键 / 斜杠命令 | `⌘K` `⌘F` `⌘⇧K` `?` `/` | 顺序先对话后命令、焦点正确 | `baseline`（Meta+k 不遗留 inert） | — |
| F-20 | 主题（浅/深/系统） | 顶栏 | 三态、首屏无闪烁 | `baseline` | — |
| F-21 | 设置 | 侧栏/顶栏 | 通知、备份、对外地址、主题、快捷键 | `quality-*`（历史） | — |
| F-22 | 通知 | 回答完成 | macOS 通知 / Web Push / App Badge | `notify` 单测式 | HTTP 内网下 PWA/通知不可用（已声明） |
| F-23 | PWA / 离线 | manifest + sw.js | 可安装、离线壳 | `offline`（历史） | — |
| F-24 | 响应式 320–1440 / 5 档字号 | 全局 | 无横向溢出、44px 触控 | `large-text`、`baseline` | — |
| F-25 | 侧栏收起 / 手机抽屉 | 顶栏 | 桌面可收起、手机抽屉隔离背景 | 无自动化套件 | 新增功能，需补 |
| F-26 | 审计日志 | 设置/侧栏 | 操作 + 设备指纹 | 无自动化套件 | — |

## 6. 现有质量基座

- `npm run qa` = 17 套件（`tools/qa/run-all.mjs`）：**基线 16/17 通过，`projects` 失败**。
- `npm run qa:static` = 语法/预算/分享页约束 5 项，基线通过。
- 60+ 个历史 QA/UX 脚本（`tools/qa/quality-*.mjs`、`tools/ux/*`），部分依赖已改版的旧选择器（`.project-chip`），不可作为当前契约。
- 无 CI、无 lint、无类型检查、无单元测试框架。

## 7. 明确不做什么（本轮边界）

- 不上生产、不做不可逆数据删除、不改真实 `data/`。
- 不改分享/鉴权语义去"简化"，不引入运行时依赖，不做无收益的大重构。
- 不改外部契约（API 路径、字段名、NDJSON 事件名）。
