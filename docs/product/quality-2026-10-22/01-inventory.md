# 当前产品与功能清单

## 业务和架构

DSH Chat 是单用户、跨设备访问的本地聊天工作台。浏览器提交消息，Node 服务管理会话和流式订阅；DSR原生桥接进入桌面宿主，桥接不可用时使用Headless，另支持Codex app-server。

- 前端：public/index.html + IIFE app.js（约7,143行）、codex.js、markdown.js；无框架/构建阶段。KaTeX按需加载。
- 样式：7个历史CSS层由服务器动态合并，另有Codex样式；系统字体、CSS变量、light/dark/auto主题。历史追加层较多，是维护债务。
- 路由：`/`、`/c/<conversationId>`，`#m-<messageId>`和`#q=<query>`。其余功能以抽屉、菜单、弹窗呈现。
- 状态：app.js闭包state；草稿、书签、提示词、滚动、主题/阅读偏好和离线缓存位于localStorage。正在运行任务在服务端，页面断开不等于停止。
- 持久化：data/conversations.json（ConversationStore原子写），会话工作区data/workspaces及data/workspace/chats，无关系数据库。
- 访问保护：随机访问码、HttpOnly Cookie、同源写请求校验、速率与体积限制。
- 桥接：bridge/index.js部署到DSH desktop profile；native.mjs为长连接JSON-RPC客户端。codex-bridge.mjs复用app-server。
- 测试：tools/qa已有CDP脚本，但依赖9222且若干断言依赖原开发机数据；本轮建立隔离的可重复Playwright/API验证。

## 页面/功能覆盖清单

|模块|已发现功能|关键状态/边界|验证责任|
|---|---|---|---|
|登录|访问码、频率限制、登录失效、退出|错误码、断网、重新登录|QA/主agent|
|首页|5个场景、直接提问、模型/引擎/权限|空会话、引擎不可用、长提示词|QA/UI/UX|
|会话导航|最近、分页、标题+正文搜索、置顶、重命名、深链、前后退|慢请求竞态、404、60+条列表|QA/研发|
|会话组织|归档/恢复、批量归档/删除、8秒撤销、副本、统计|部分失败、运行中任务、工作区文件|QA/后端|
|消息输入|按会话草稿、Enter/Shift+Enter、IME、字符限制、斜杠命令|空白、24k边界、引擎切换|QA/UX|
|模型|DSR/Codex、Codex模型与思考强度、桌面打开|桥接断开、会话中锁定引擎|QA/主agent|
|生成|流式正文/推理、工具卡、停止、继续、重新生成、编辑重发|断开/重连、后台完成、服务重启、错误重试|QA/主agent|
|审批提问|权限选择、单次/完全/拒绝、选择题/自定义/跳过|刷新不重放已处理交互、失效|QA/后端|
|阅读|Markdown、公式、表格/代码复制、消息链接、时间/usage|长回答、60+消息、转义/XSS|QA/UI|
|查找|当前会话搜索、上下匹配、分享查找链接|更早消息、无匹配、键盘|QA/UX|
|文件|选择/拖拽/粘贴、暂存、进度/取消、文件抽屉|25MB/5个、重名、失败重试、路径越界|QA/后端|
|文件查看|文本/图片/PDF、下载/打开、插入路径、删除|HTML安全处理、缺失文件、切换会话|QA/UI|
|效率工具|命令面板⌘K、快速切换⌘P、快捷键、消息导航|输入中/IME/模态层、方向键|QA/UX|
|资料|收藏、提示词新增/插入/删除、结构化总结|草稿保护、空状态、本机持久化|QA/UX|
|设置|主题、密度、字号及预览、通知、全部已读、存储|系统主题、缩放、权限拒绝|QA/UI|
|备份|导出/导入JSON、会话Markdown导出、回答导出|格式非法、全量保留、无文件备份说明|QA/后端|
|离线/PWA|SW缓存、离线shell、重连、更新提示、安装图标|首次离线、缓存过期、未授权、配额不足|QA/研发|
|响应式/无障碍|320/390/768/1440、键盘/焦点、触控、减少动态/透明度|长标题、弹层滚动、文字放大|QA/UI/主agent|

## API族与数据对象

`/api/health`、`/api/me`、`/api/login/logout`；`/api/permissions`；`/api/codex/models/status`；`/api/conversations`列表/创建；单会话GET/PATCH/DELETE、chat/attach/stop、restore/duplicate/stats、upload/files、approval/question；`/api/backup`及import。

Conversation关键字段：id/owner/title/engine/permission/mode、createdAt/updatedAt、pinned/archivedAt/deletedAt、workspace/nativeCwd、dshSessionId/codexThreadId、codexModel/codexEffort、messages。Message包含id/role/text/blocks/thinking/status/error/usage/attachments/files等。未经测试的接口不因出现在清单即标通过。

## 已有实际体验（主agent）

2026-10-22：在IAB中从DSR验证会话打开侧栏、设置，查看字号密度/备份/通知，关闭后焦点回到设置按钮；再打开提示词库。保存settings基线截图。登录后的退出按钮在可访问树中缺失，代码确认其一直hidden，待独立浏览器复现。先前DSR原生对话已真实返回“DSR 已连接”；这只证明一条基本对话，不代表所有工具/审批已验证。

## 环境局限

本次可运行本机Chromium和IAB。没有真实iPhone/iPad触控、VoiceOver真人操作、生产流量或跨网络字段数据；这些持续列为未验证，不用模拟视口冒充真机结论。
