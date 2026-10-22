# QA 回归报告 v2

日期：2026-10-21 18:40（Asia/Shanghai）
构建：DSH Chat v2（液态玻璃 + 场景中心 + 文件上传）；原生桥接 preset=standard；服务 launchd 运行中。
环境：macOS、Chrome 155 headless（390×844 / 1440×900）、Node 24、curl；原生桥接 127.0.0.1:47821。

## 结论

**P0 通过，允许发布；P1 基本通过，保留已记录的限制。** 无 S1/S2 未解决缺陷。视觉复核为 “pass with minor”，修复后再次复核通过。

## 覆盖与结果

| 领域 | 结果 | 证据 |
| --- | --- | --- |
| 登录 / 会话隔离 | PASS | 未登录 API 401；登录 cookie HttpOnly；第二标签保持登录；owner 隔离沿用原实现 |
| CSRF / Origin | PASS | 跨站 Origin POST → 403；同源 POST → 201 |
| 访问码泄露 | PASS | README 不含真实码；启动日志不打印；日志权限 600；`umask 077` |
| 文件上传 | PASS | 新对话未发消息可上传；文本/HTML 上传成功；文件名穿越被清洗为 basename；同名自动改名 |
| 上传限制 | PASS | 26MB 上传 → 413；>5 个截断提示；临时文件清理 |
| 文件列表/下载 | PASS | 上传文件进入 `uploads/`；文本 `text/plain` 内联；HTML `application/octet-stream` 附件；`nosniff` + CSP sandbox |
| 路径穿越 | PASS | `../../config.json`、绝对路径、Windows 路径、子目录穿越全部 404 |
| 后台任务 | PASS | 客户端 2.5s 断开后任务继续完成（18s/1603 字）；GET 显示 running→done；部分内容持久化 |
| 刷新续接 | PASS | 刷新后 2s 内自动 attach：stop 按钮出现、文本 546 字、live 块存在；最终 3368 字、2 条消息、无重复 |
| 切换不终止 | PASS | 生成中切到新对话：列表 running=true；返回后任务已完成 2071 字；后端继续执行 |
| 显式停止 | PASS | attach/生成中点击停止：status=stopped，UI stop 消失，无错误 |
| Token 流式 | PASS | 单次回答 200 个 delta；UI live 文本 26→276 字后提交为 317 字；live 块清空、无重复 |
| 原生会话 | PASS | 创建文件/执行工具；桌面版 “DSH Chat” 工作区同步；上下文续聊 |
| 提问交互 | PASS | 单选→提交→工具结果→继续；停止生成时卡片立即变 “已停止生成” 且按钮不可用 |
| 网页总结场景 | PASS | 实际调用 `web_fetch`；输出 TL;DR + 要点 + 追问 + 来源 |
| 日报场景 | PASS | 输出完成/进行中/风险/明日计划，日期正确 |
| 内容分析场景 | PASS（模板/UI） | 场景卡与模板可用；一次终端解析脚本报错为测试脚本问题，非应用错误 |
| 股票 / 操作电脑 | 模板验证 | 入口、安全提示、免责声明已就位；真实数据质量与权限行为依赖桌面版工具/审批，未做长链路压测 |
| 场景 UI | PASS | 5 张卡、点击填充并选中占位符；发送前占位符校验；场景抽屉 5 行 |
| 侧栏搜索/分组 | PASS | 今天分组；搜索无结果显示“没有匹配的对话” |
| 模式徽标 | PASS | 侧栏显示 “原生” / “Headless”，tooltip 正确 |
| 回到底部 | PASS | 长内容滚动后按钮出现，点击回底并隐藏 |
| 可访问性 | PASS（关键项） | 关闭侧栏 `inert`；抽屉/场景层背景 `inert`；焦点进入关闭按钮并在关闭后回到触发点；Escape 关闭；Reduce Motion 关闭动画 |
| Reduce Motion | PASS | CDP 模拟后极光 `animation-name: none`，卡片 transition 0s |
| 图片缩略图 | PASS | 上传 PNG 后文件抽屉 `<img>` naturalWidth=780，lazy 加载 |
| Apple 轻量化 | PASS | 白/浅灰底、大留白、细边框；场景卡改实体浅灰；玻璃只留顶栏/侧栏/弹层；二次视觉复核通过 |
| Codex 引擎 | PASS | 新建 codex 对话；app-server token delta、命令结果、usage、文件列表正常；第二条消息 `thread/resume` 返回 `codex-web.txt` |
| 跨设备共享 | PASS | 两个独立 Cookie 登录：A 创建会话后 B 立即可见（20→21），B 可删除；旧 20 个会话 owner 已迁移为共享；UI 显示“跨设备”徽标 |
| 跨设备续接 | PASS | A 发起 800 字任务后 2.5s 断开客户端；B 看到 running，attach 收到 reset/ready/status；任务完成 795 字；B 删除成功 |
| Codex 权限等级 | PASS | Codex 新对话选只读 → 发消息；实际 thread context：`sandbox.type=read-only`、`approvalPolicy=on-request`；UI 权限菜单可用，无控制台错误 |
| Codex Computer Use | PASS | Arc 首次控制弹出 “Allow Computer Use to use Arc?” 授权卡；允许一次后 Codex 激活 Arc 成功；后续运行不再重复询问 |
| Codex 授权 | PASS | 网络请求触发授权卡（拒绝/完全权限/允许一次）；允许后 curl 成功；`/approval` 200；无控制台错误 |
| Codex UI | PASS | 390px 切换 Codex，顶栏/徽标/列表显示 Codex；2m21s 完成；授权卡与最终输出正常 |
| 引擎切换 | PASS | PATCH 空对话 dsr→codex 成功；首条消息后入口锁定 |
| 手机授权-允许 | PASS | 真实 bash danger-full-access 请求；卡显示 bash/原因；允许一次后 `approval-ok`，退出码 0 |
| 手机授权-拒绝 | PASS | 拒绝后命令未执行；Agent 收到 fail-closed；未绕过权限 |
| 授权跨刷新 | PASS | 授权等待中刷新：卡重新出现（bash/拒绝/允许一次）；允许后命令执行成功 |
| 手机重进恢复 | PASS | 缓存会话先渲染（cache-ok）；阻塞 `/api/me`、会话列表、attach 时仅显示重连条，无 Load failed/toast；恢复后自动同步/续接 |
| 编辑式首页 | PASS | orb + 双行标题 + 双 CTA；1 大 + 4 小 bento；320/390/1440 无溢出；视觉复核 clean |
| 输入框对齐 | PASS | 修复前空输入 `#input` 仅 18px 且底对齐（文字掉落）；修复后 min-height 44px、padding 10px、line-height 24px，实测空/输入均垂直居中；320/390px 无裁切 |
| 视觉 | PASS | 明暗两套；移动/桌面；玻璃、场景卡、提问卡、文件抽屉通过视觉复核；桌面补充折射光晕 |
| 性能基线 | PASS（轻量） | 仅同源资源；318 DOM 节点；load 19ms；移动端场景卡去除逐卡 blur，模糊层数下降 |
| 控制台 | PASS | 全流程无 console error |

## 本轮发现并修复的缺陷

| ID | 缺陷 | 严重度 | 修复 |
| --- | --- | --- | --- |
| D1 | 文件/场景抽屉打开时焦点落在 backdrop，未进入弹层 | P1 | 改为聚焦 `.sheet-head` 内的关闭按钮 |
| D2 | 移动端 5 张场景卡各自使用 backdrop-filter，模糊层数过多 | P2 | ≤720px 场景卡改为渐变实体玻璃，保留高光/阴影 |
| D3 | 场景占位符 `{{...}}` 可被直接发送，模型会收到占位文本 | P2 | 发送前校验并选中占位符，Toast 提示 |
| D4 | 深色次要文字对比偏低 | P2 | `--text-3` 提升至 `#b4b4ba`；场景描述改高对比 |
| D5 | 发送按钮与 +/✦ 工具按钮同尺寸，主次不清 | P2 | 发送按钮 40px 渐变，工具按钮 36px |
| D6 | HTML 在文档中写“强制下载”，实际作为 text/plain 内联 | P1 | `.html/.htm` 移出文本类型，作为 `application/octet-stream` 附件 |
| D7 | README/启动日志出现真实访问码 | S1 | README 脱敏；日志只提示见 config；日志 600 |
| D8 | 停止生成后提问卡可能保持可操作 | P1 | `stopStreaming()` 立即 `expireQuestions()`；服务端 409 |
| D9 | 原生 `chat/agentError` 无 turn/end 可挂 30 分钟 | P1 | 8s 兜底 finish(error) |
| D10 | 文件抽屉无图片缩略图 | P3 | 图片行使用 lazy `<img>` 缩略图 |
| D11 | 跨站 POST 无 Origin 校验 | P1 | 变更类 API 校验 Origin/Sec-Fetch-Site |
| D12 | 新对话无上传入口，分析内容只能粘贴 | P0(PM) | `+` 上传，自动创建工作区，填写分析提示 |
| D13 | 能力不可发现、空状态只有 4 个泛化提示 | P0(PM) | 5 个场景卡 + 场景抽屉 + 原生模式徽标 |
| D14 | 关闭的移动侧栏仍可被键盘聚焦 | P1 | `inert` + `aria-hidden` + `aria-expanded` |
| D15 | 无会话搜索/分组 | P2 | 按今天/昨天/更早分组 + 标题搜索 |
| D16 | 长对话无回底入口 | P2 | 玻璃悬浮按钮 + 滚动监听 |

## 本轮新增缺陷与修复

| ID | 缺陷 | 严重度 | 修复 |
| --- | --- | --- | --- |
| D24 | Codex Computer Use 的 `mcpServer/elicitation/request` 被适配器当作未知请求拒绝，报 “Computer Use was not approved to use Arc” | S1 | 转发为网页授权卡；允许回 `{action:'accept'}`，拒绝回 decline；已完成 Arc 实测 |

| ID | 缺陷 | 严重度 | 修复 |
| --- | --- | --- | --- |
| D17 | run hub 初版插入到文件下载函数，导致 `hub is not defined`、流提前断开 | S1 | 将 hub 移入 `handleChat` 作用域，并加流式错误日志 |
| D18 | 浏览器缓存旧 `app.js`，后台续接时代码报 `streamingRef is not defined` | S1 | 静态 JS/CSS 改为 no-store，入口加 `?v=4` 缓存戳 |
| D19 | 旧前端 `renderAssistantMessage` 把 running 消息直接标记为中断，无法续接 | P1 | running 消息渲染为 live 视图并存储，attach reset 后替换 |
| D20 | 重连回放已回答的问题卡仍可交互 | P2 | 对应 tool_result 到达时按 callId 清理问题卡 |

## 未执行 / 保留风险

1. 真实 iPhone Safari 与低端 Android 的帧率、键盘、安全区未实机测试；仅 Chrome 移动模拟。
2. 多选/多问题提问、审批类提问仅做代码路径验证；单选真实链路已过。
3. 股票数据时效性、电脑操作的危险动作审批依赖桌面版工具与权限；未做破坏性操作测试。
4. 服务重启会丢失内存中的运行实例；正在生成的消息会标记中断（非断线场景）。重新生成/消息编辑仍未实现（P1）。
5. 300 会话裁剪不会归档对应原生会话；极端规模未压测。
6. 硬链接、Range 请求、超大目录扫描未覆盖。
7. **Codex Desktop 侧栏不显示网页新建的 Codex thread**：桌面侧栏读取 `state_5.sqlite`，独立 app-server 只写 `~/.codex/sessions`；目前只能通过导入/后续官方 IPC 解决，不能依赖刷新。
8. 删除网页对话不会删除 Codex 本地 rollout；需要单独清理 Codex 线程历史。
7. 内容分析场景的一次自动化输出因测试脚本 JSON 解析心跳空行失败，非应用缺陷；模板与 UI 已验证。

## 二次评审

- PM：**sign off**，无 blocker；确认 P0 全部满足，建议下一轮优先 P1（断线重连、重新生成、消息编辑）。
- UI/UX 视觉复核：**pass with minor**；桌面玻璃层次在补充折射光晕后通过，剩余仅为对比/间距微调。
- QA：P0 通过，S1/S2 清零。

## 发布门槛对照

- P0：通过（AUTH、上传/路径、原生聊天、文件、提问、场景入口、视觉基线、无控制台错误）。
- 无 S1/S2 未解决。
- 玻璃可读性、降级（Reduce Motion / 不支持 blur）、移动布局通过。
- 性能基线通过；真实设备性能待补测。
