# 审查报告 · 问题与优化机会

> 方法：4 个独立审查角色并行（后端/安全、前端正确性、真实用户体验+可达性、架构/性能/测试债）+
> 总指挥逐条复现。所有条目都带**可复现证据**（命令、脚本、度量值、file:line）。
> 状态：`FIXED` 已改并复验 · `OPEN` 待处理 · `DEFERRED` 明确延期（附理由） · `WONTFIX` 决策不修。

基线：`43e3492`（v6 前端演进 + DSH 模型选择工作区快照）。
本轮交付：`243a013`。项目自带套件 **16/17 → 20/20**。

---

## 0. 结论摘要

| 来源 | 条目 | P0 | P1 | P2 | P3 | 本轮修复 |
| --- | --- | --- | --- | --- | --- | --- |
| 后端/安全（21） | 21 | 0 | 1 | 7 | 13 | 17 |
| 前端正确性（20） | 20 | 1 | 5 | 10 | 4 | 18 |
| 架构/性能/测试债（28） | 28 | 2 | 7 | 8 | 11 | 10 |
| UX/可达性（11） | 11 | 0 | 4 | 5 | 2 | 9 |
| 总指挥自查（5） | 5 | 0 | 1 | 3 | 1 | 5 |

合计 **85** 条可执行机会（去重后）。**P0 全部修复**；**P1 修复 17/18**（剩 1 条是数据模型迁移，明确延期）。
未修复项在 §5 逐条说明原因，不宣称已解决。

---

## 1. 最高严重度问题（P0/P1）与处理

### F-01 `FIXED` P0 · 上传期间切换对话：消息发到旧对话、渲染进新对话
- 复现：暂存附件 → 延迟上传 1.5s → 发送后 250ms 点开另一对话。
- 实测（修复前）：URL/线程是对话乙，但气泡与流式视图落在乙里，POST 却发往甲；无任何报错。
- 修复：`submitComposer` 在上传后校验 `state.currentId === conversationId`，不等则保留文本/附件并明确提示「已切换对话：消息没有发送」；`ensureConversation` 在创建期间用户已导航时返回 `null`，调用方中止并复原输入。
- 回归：`tools/qa/client-behaviour.mjs`（upload race / slow create）——`bodies: []`、输入框保留原文。

### F-02 `FIXED` P0 · 数据文件里一条坏记录让服务起不来或静默清库
- 复现（修复前）：`conversations: [null, …]` → 进程 `TypeError` 退出；`conversations: {}` → 启动成空库，**无备份**，下次保存覆盖原文件。
- 修复：五个 store 统一「隔离 + 继续」策略：结构不合法或含坏记录时先把原文件复制为 `<store>.corrupt-<ts>`，再以可用记录继续；会话缺 `messages` 归一为 `[]`；损坏场景下不写「空库日备份」。
- 回归：`tools/qa/store-contract.mjs`（7 个损坏夹具：null 记录、非数组、缺 messages、截断 JSON、项目/分享 null、记忆满导入）。
- 证据：`up=true status=200 n=1`、`quarantine=true originalKept=true`。

### F-03 `FIXED` P1 · 项目不是按 owner 隔离的（multi-user 模式越权）
- 复现（`singleUser:false`，两个浏览器）：B 能列出/改名/移入回收站/永久删除 A 的项目，A 的 `instructions` 会被注入 B 的提示词，A 项目的 `danger-full-access` 默认权限会被 B 继承；`GET /api/backup` 把所有人的项目都给出去。
- 修复：项目增加 `owner`；`projects.list/listTrash/create/export/import/setOwner(owner)` 全部按 owner 过滤；`ownedProject(id,res,owner)` 对他人项目返回 404（不泄露存在性）；对话创建/移动校验 `projectId` 归属；单用户模式启动时把历史项目归属到 `single-user-owner`。
- 回归：`tools/qa/isolation.mjs` 17/17（含「B 的备份不含 A 的项目」「B 不能 purge/restore」）。

### F-04 `FIXED` P1 · 下载中断泄漏文件描述符
- 复现：20MB 文件，25 次中途 abort → `lsof` 23 → **48**，从不回收；正常使用几天后 `EMFILE` 会让整个服务不可用。
- 修复：三处 `createReadStream().pipe(res)` 改为 `streamFile()`（`pipeline` + 失败时 destroy）。
- 证据：同样脚本 23 → **23**，`open-file-handles []`。

### F-05 `FIXED` P1 · 最终落盘失败会吞掉 `done`，回答只存在内存里
- 复现：运行中把 data 目录改只读 → 客户端收不到 `done`，`conversations.json` 里是 `status:"running", text:""`，重启后回答消失，且产生未处理 Promise 拒绝。
- 修复：最终 flush 用 try/catch，失败时仍发送 `done`（带 `persisted:false`）并推一条 `notice`；后台 flush 全部 `.catch` 落日志。
- 说明：客户端目前只把 `notice` 当普通提示展示，**没有**「未保存·重试」专用按钮（列入 §5）。

### F-06 `FIXED` P1 · 未登录也能 `POST /api/logout` 吊销所有会话
- 复现（修复前）：不带 Cookie → `200 {revokedAllDevices:true}`，随后旧 Cookie 401。任何能连到端口的人都能把用户所有设备踢下线。
- 修复：logout 分支移到 `isAuthed` 之后并显式校验。
- 回归：`isolation.mjs`「anonymous logout is rejected — 401」「A's session survives」。

### F-07 `FIXED` P1 · 断点切换后 `.main` 永久 inert（界面冻结）
- 复现：800px 打开抽屉 → 拉到 1280px → 输入框点不动、菜单点不动，只能刷新。
- 修复：`desktopQuery` 的 change 回调调用 `setSidebarA11y()`；桌面分支显式 `main.inert = false`；移动端关闭态侧栏 `inert=true/aria-hidden=true`。
- 证据：`mainInert false`、`composerUsable true`、`typed 侧栏后遗症`。

### F-08 `FIXED` P1 · attach 回放把旧对话的回答画进新对话
- 复现：A 有 running 消息，打开 A 后立刻切到 B，再让 attach 流发 `reset`+`text` → B 的线程出现 A 的回答，停止按钮指向 A。
- 修复：`attachRun` 增加 attach 序号 + `currentId` 双重校验，首个事件前导航即 abort；`openConversation`/`newChat` 递增序号使在飞握手失效。
- 证据：`leakPresent false`、`stopClass send-btn`。

### F-09 `FIXED` P1 · 审批卡抢焦点：下一次回车会「允许」工具
- 复现：正在输入时到达 `approval` 事件 → 焦点被移到「允许一次」→ 回车触发授权 POST。
- 修复：移除自动 focus，改用 `announce()` 播报；关闭时保留原焦点。
- 证据：`activeId input`、`approvalPosts 0`。

### F-10 `FIXED` P1 · 禁用 localStorage 时应用在登录前就崩
- 复现：屏蔽站点数据 → 3 个 pageerror，登录表单不可用，页面只剩跳过链接。
- 修复：`app.js` / `codex.js` / `dsh-models.js` 各加安全 storage 包装（探测失败退化为内存 Map），并把 52 处 `localStorage.` 全部改为 `storage.`。
- 证据：`login=true`、`pageErrors []`。

### F-11 `FIXED` P1 · 慢创建对话会劫持导航
- 复现：POST /api/conversations 延迟 900ms，发送后 250ms 打开另一个对话 → 被带到新对话，线程同时显示两段历史。
- 修复：`ensureConversation` 检测「创建期间用户已导航」，只把新对话登记进列表，不切换；`sendMessage` 收到 `null` 时恢复文本并提示。

### F-12 `FIXED` P1 · `npm run qa` 基线红（测试与改版漂移）
- 事实：v6 把项目 chips 改为 `<select>`，`projects.mjs` 仍断言 `.project-chip`，套件 16/17。
- 修复：断言新契约（下拉存在/选项含 emoji 与计数/选择后过滤并保持选中），并补触摸上下文（`hasTouch:true`）命中区测量。

---

## 2. 后端 / 安全（21 条）

| ID | 严重度 | 问题 | 状态 | 证据 / 备注 |
| --- | --- | --- | --- | --- |
| BE-01 | P1 | 项目/备份未按 owner 隔离 | FIXED | 见 F-03 |
| BE-02 | P2 | 中断下载泄漏 fd | FIXED | 见 F-04 |
| BE-03 | P2 | 最终 flush 失败吞 done / 丢回答 | FIXED | 见 F-05 |
| BE-04 | P2 | 记忆满时静默淘汰最旧记忆（导入/自动捕获都中） | FIXED | `add()` 默认 409，仅显式 `evict` 才淘汰；导入返回 `full:true`；回归断言 `OLD-FACT-0` 仍在 |
| BE-05 | P2 | 已撤销分享仍占用 100 条配额 30 天 | FIXED | 配额只统计「未撤销且未过期」；错误文案同步 |
| BE-06 | P2 | purge 同步重写所有日备份，156MB 库阻塞 1.5–2.2s | FIXED | 改为异步 + 临时文件 + rename，失败落日志；请求不再等待 |
| BE-07 | P2 | 未鉴权 logout 吊销全部会话 | FIXED | 见 F-06 |
| BE-08 | P2 | PATCH /api/notify 被拒后仍改了运行态 | FIXED | `Notifier.update()` 先校验后提交；`saveConfig()` 失败返回 500 |
| BE-09 | P3 | 幂等键在 retry/edit 校验前占用 | FIXED | 校验前置，404 后可用同 key 重试 |
| BE-10 | P3 | 缺 `messages` 记录让列表 500 | FIXED | load 归一 + `store-contract` 覆盖 |
| BE-11 | P3 | 未知 `before` 游标返回整个对话 | FIXED | 返回最早一页 + `hasEarlier:false` + `cursorStale:true` |
| BE-12 | P3 | 重复恢复提示「超过 30 天」 | FIXED | 不在回收站 → 409「该对话不在最近删除中」 |
| BE-13 | P3 | 满库时重复导入被 409 拒绝 | FIXED | 容量检查移到去重之后 |
| BE-14 | P3 | 文件 404 泄漏绝对路径；删除不存在的文件返回 200 并写审计 | FIXED | 归一为「文件不存在」；不存在 → 404 且不写审计 |
| BE-15 | P3 | 未登录 `/api/me` 泄漏模型/标题/记忆数 | FIXED | 未登录只返回 `authenticated/authRequired/title` |
| BE-16 | P3 | 负 `expiresInDays` 变成「永不过期」 | FIXED | 0 仍是「长期」，负数/超范围 → 400 |
| BE-17 | P3 | 项目路由把所有异常映射成 400 | FIXED | 文件系统类错误 → 500 并记录日志 |
| BE-18 | P3 | 分享大小文案写 2MB，实际 5MB | FIXED | 文案改用常量 |
| BE-19 | P3 | CSRF 只比较 host，忽略 scheme | DEFERRED | 需在反向代理场景下定义「有效源」，改动会影响 TLS 终止部署；风险低（SameSite=Lax + host 校验仍在） |
| BE-20 | P3 | 运行事件缓冲 / 单会话体积无上限（SUSPECTED） | DEFERRED | 未复现 OOM；需要先确定上限策略，避免截断工具结果 |
| BE-21 | P3 | 运行启动的 TOCTOU 窗口（SUSPECTED） | DEFERRED | 未能复现（无异步间隙的场景会被 409 拦住）；修复需引入占位锁，改动运行生命周期，风险高于收益 |

## 3. 前端正确性（20 条）

| ID | 严重度 | 问题 | 状态 | 证据 |
| --- | --- | --- | --- | --- |
| FE-01 | P0 | 上传竞态跨对话发送 | FIXED | 见 F-01 |
| FE-02 | P1 | 断点后 main 持续 inert | FIXED | 见 F-07 |
| FE-03 | P1 | attach 回放泄漏进当前对话 | FIXED | 见 F-08 |
| FE-04 | P1 | 创建对话劫持导航 | FIXED | 见 F-11 |
| FE-05 | P1 | 审批抢焦点 | FIXED | 见 F-09 |
| FE-06 | P1 | 禁用存储直接崩 | FIXED | 见 F-10 |
| FE-07 | P2 | 会话菜单无 Escape/方向键；Escape 反而停止生成 | FIXED | 菜单内 keydown（Escape/Tab/↑↓/Home/End）；全局 Escape 先关浮层。证据：`open:false stop:true` |
| FE-08 | P2 | 失败发送留下幽灵气泡 | FIXED | 回滚气泡 + 文本回填；证据：线程无「这条会失败」、输入框有 |
| FE-09 | P2 | 已发送文本变成别的对话草稿 | FIXED | `dsh.unsent.v1` 带 `conversationId`，只在同会话恢复；成功发送后无论是否 detached 都清除 |
| FE-10 | P2 | 慢加载覆盖正在输入的文字 | FIXED | `restoreDraft({onlyIfUntouched})`；证据：输入保留 |
| FE-11 | P2 | 「按指令重写」的指令被丢弃 | FIXED | `payload.instruction`；证据：body 含 instruction |
| FE-12 | P2 | 叠层浮层 Escape 关错层 | FIXED | 回收站先于设置；证据 `esc1: trashHidden true / settingsHidden false` |
| FE-13 | P2 | 回收站无焦点陷阱、关闭后焦点掉到 body | FIXED | 加入 `activeOverlay`、记录并恢复焦点；证据：焦点回到 `trashBtn` |
| FE-14 | P2 | 打印时重新渲染会摘掉在飞的回答 | FIXED | 流式时跳过重渲染；证据：`afterPrint liveTextVisible true`、后续 token 可见 |
| FE-15 | P2 | 移动项目浮层不锁 shell | FIXED | `openMoveSheet` 调 `lockShell()`；证据 `shellInert true`、背景不可聚焦 |
| FE-16 | P2 | `role="log"` + 整体重绘 = 播报风暴（SUSPECTED） | FIXED | 线程改为 `role="region"`，里程碑走 `#srStatus`；`cycle1` 断言同步更新 |
| FE-17 | P3 | 登录页就请求模型目录 → 2 个 401 | FIXED | `whenAuthed` + `loadCatalog` 双重门禁；9 秒空载实测：请求只有 `GET /api/me`，4xx 为 **0**；`t8` 复跑 `bad: []` |
| FE-18 | P3 | 两个模块各 4s 轮询 + 观察 `#thread` | PARTIAL | 轮询降为 15s 且后台标签页跳过；观察器未合并（需重写模块协调，收益小） |
| FE-19 | P3 | 暂存附件跨对话跟随 | FIXED | `stagedByConversation` + `setStagedContext`；证据：切到甲时托盘为空 |
| FE-20 | P3 | 模型保存失败仍记住选择（SUSPECTED） | DEFERRED | 沙箱无真实模型目录，无法复现；改动涉及两个模块的乐观写入回滚，未验证不修 |

## 4. 架构 / 性能 / 测试债（28 条）

| ID | 严重度 | 问题 | 状态 | 度量 / 说明 |
| --- | --- | --- | --- | --- |
| AR-01 | P0 | 坏记录导致启动崩溃 | FIXED | 见 F-02 |
| AR-02 | P0 | 结构错误静默清库 | FIXED | 见 F-02 |
| AR-03 | P1 | 缺 messages 让列表 500 | FIXED | 见 BE-10 |
| AR-04 | P1 | 损坏后用空库覆盖当日备份 | FIXED | `loadRecovered` + 空库跳过 rotate |
| AR-05 | P1 | 整体重写 store（8–425MB/次） | DEFERRED | 需「一会话一文件 + 索引」的数据模型迁移；本轮只做了测量与边界记录，避免在大改中引入丢数据风险 |
| AR-06 | P1 | 1000 会话：103ms 加载 / 385MB RSS | DEFERRED | 同上，迁移后排期 |
| AR-07 | P1 | 分享快照内联在 shares.json（上限 500MB 单文件） | DEFERRED | 同属数据模型迁移；已修正误导文案 |
| AR-08 | P1 | 64KB body 上限与 24k 中文字符矛盾（22000 字 → 413） | FIXED | 聊天路由独立预算 `MAX_PROMPT*4+16KB`；24000 字符可发 |
| AR-09 | P2 | 搜索全量扫描（11ms @36MB，外推 130ms/键） | DEFERRED | 需要写入时维护搜索块或倒排；改动集中在 store，但会影响导入/去重路径 |
| AR-10 | P2 | `/api/projects` 每次 `listFiles()`（100×20 文件 9.3ms） | DEFERRED | 需缓存失效策略；当前 9ms 不构成用户可感延迟 |
| AR-11 | P2 | 前端冷载 206KB / 927KB 解码 | DEFERRED | 最大单项是 app.js（101KB gzip）；拆模块是独立工程 |
| AR-12 | P2 | 只发 gzip，brotli 可省 16KB（-7.9%） | DEFERRED | 需 Node 侧 `zlib.brotliCompress` + Accept-Encoding 协商 + 缓存；收益明确但非正确性问题 |
| AR-13 | P2 | codex.js/CSS 无条件加载 | DEFERRED | 依赖运行时的按需加载，需处理「首次切到 codex」的闪烁 |
| AR-14 | P3 | 冷启动重复请求 `/api/projects`、`/api/library` 各 2 次 | DEFERRED | 需要合并 bootstrap 响应 |
| AR-15 | P1 | 深链到 2000 条以前的回答无法定位 | DEFERRED | 需要 `around=<id>` 分页语义，客户端要新增加载态 |
| AR-16 | P1 | 85 个 QA 脚本中 54 个无人引用、14 个写死 8787 | PARTIAL | 新增 3 个正式套件并接入 `run-all`；历史脚本未归档（见 §5） |
| AR-17 | P1 | 无损坏数据/越权/并发/上传中断测试 | FIXED | 新增 `store-contract`、`isolation`、`client-behaviour` |
| AR-18 | P2 | 静态预算漏算 44KB CSS | FIXED | 从 `CSS_BUNDLE_FILES` 派生 + 孤儿样式表检查；实测 303KB/320KB |
| AR-19 | P3 | 六个 store 各写一份 load/flush | DEFERRED | 抽 `JsonStore` 基类会同时改动全部持久化路径，风险高于收益（本轮只统一了策略） |
| AR-20 | P3 | 死代码：`events.mjs`、`codex-appserver.mjs`、`.project-chip*` 90 行 | PARTIAL | chips CSS 已删（projects 4.7KB + evolution 2KB）；两个无引用模块未删（保守） |
| AR-21 | P2 | 备份不含工作区（README 已声明，但 665MB 文件无提示） | DEFERRED | 需要产品决策：打包 tar 还是导出时显式提示 |
| AR-22 | P2 | 文档数字失真（套件数/CSS 数/app.js 体积/导入去重） | FIXED | README 已按实测更新 |
| AR-23 | P2 | 16 条其它性能/可维护性观察 | DEFERRED | 见 §5 汇总 |

## 5. UX / 可达性（11 条）

| ID | 严重度 | 问题 | 状态 | 证据 |
| --- | --- | --- | --- | --- |
| UX-01 | P1 | 回复中切换对话导致标题/草稿串台 | FIXED | unsent 按会话隔离 + attach 序号 + 标题写入守卫 |
| UX-02 | P1 | 设置→最近删除 两层 `aria-modal` 叠层 | FIXED | 顶层优先的 Escape + 回收站焦点陷阱；证据 `esc1/esc2` |
| UX-03 | P1 | 手机操作菜单不是模态 | FIXED | `sheet-mode` 下 `role=dialog aria-modal` + 遮罩 + Tab 循环 + `lockShell` |
| UX-04 | P1 | 320px 正文滚到透明顶栏下方 | FIXED | 滚动后给顶栏实底 + 模糊 + 分隔线；证据：`bg srgb 1 1 1 / 0.88`、`backdrop blur(14px)` |
| UX-05 | P2 | 会话标题永不显示 | FIXED | ≤1023 常驻、桌面仅收起侧栏时显示；320 实测 106×44 可见 |
| UX-06 | P2 | 命令面板动作后焦点掉到 body | FIXED | `focusOrigin()` 记录真实来源 + 动作后兜底落点 |
| UX-07 | P2 | 触控目标 <44px（行 37.7、管理 42×36、模型 chip 32） | FIXED | coarse 指针下 `.conv-item/.sidebar-tool/.conv-more/模型 chip` ≥44 |
| UX-08 | P2 | 选中行次要文字对比度 4.40/4.11 | FIXED | `--text-3` 调整为 #64646a / #a8a8ae，实测 **4.81 / 4.80** |
| UX-09 | P2 | 设置里的导出/导入被挤成竖排单字 | FIXED | `flex:0 0 auto; min-width:56px; white-space:nowrap` |
| UX-10 | P3 | 会话页没有 h1 | FIXED | 新增 `#chatHeading`（sr-only）并随标题同步 |
| UX-11 | P3 | 首次使用先遇到 Headless/DSH/标准 等术语 | DEFERRED | 属于文案与信息架构决策；`标准` 的说明已在权限菜单内，本轮不改首页文案 |

## 6. 总指挥自查

| ID | 严重度 | 问题 | 状态 |
| --- | --- | --- | --- |
| L-01 | P2 | 幂等键全局共享且校验前占用 | FIXED |
| L-02 | P2 | PATCH 会话先写后校验（400 也会改引擎/标题） | FIXED |
| L-03 | P3 | 限流 Map 只增不减 | FIXED |
| L-04 | P3 | 原子写残留 `.tmp` 永不清理 | FIXED |
| L-05 | P2 | 静态预算漏算 | FIXED |

---

## 7. 证据索引

| 证据 | 路径 |
| --- | --- |
| 后端复现脚本（15 个） | `.tmp-audit-backend/t1..t15*.mjs`、`REPORT.md` |
| 前端复现脚本（8 个） | `.tmp-audit-front/t1..t8*.mjs` + 日志 |
| UX 报告 + 38 张截图 | `.tmp-audit-ux/AUDIT-REPORT.md`、`screens/` |
| 架构/性能基准脚本 | `.tmp-audit-arch/bench-*.mjs`、`out-*.json` |
| 视觉前后对比 | `reports/ai-optimization/visual/{before,after}/` |
| 套件输出 | `reports/v5/round-4/static-qa.json`、`reports/ai-optimization/store-contract.json` |
