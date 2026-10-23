# 测试与验证报告

> 所有结果均来自**实际执行**。命令、退出码、关键输出都在本文里；无法验证的内容单独列出，不冒充通过。
> 环境：macOS，Node v24.21.0（`/Users/liupengbin/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/node/bin/node`），
> Chromium（Playwright）。所有浏览器/接口测试都在 `createSandbox()` 的临时副本里跑，使用 88xx 端口，
> **从未接触真实 `./data` 或 8787 上的线上服务**。

## 1. 总览

| 项 | 基线（`43e3492`） | 现在（本轮） |
| --- | --- | --- |
| `node tools/qa/run-all.mjs` | **16/17**（`projects` 失败） | **20/20 全绿** |
| 套件数 | 17 | 20（新增 `isolation` / `store-contract` / `client-behaviour`） |
| 静态检查 | 5 项（预算漏算 44KB） | 8 项（预算从源码派生 + 孤儿样式表） |
| 脚本语法 | 121 文件 | 125 文件（新增 4 个脚本） |
| CSS bundle | 303KB 实际 / 258KB 被统计 | 303KB 实际 / 303KB 被统计（320KB 预算的 94.7%） |
| app.js | 419KB | 430KB（450KB 预算的 95.6%） |

### 最终回归输出（节选）

```
════════ QA SUMMARY ════════
PASS  projects
PASS  cycle1
PASS  share
PASS  versions
PASS  library
PASS  productivity
PASS  trust
PASS  stop
PASS  api
PASS  project-files
PASS  large-text
PASS  trash
PASS  memory-scope
PASS  rewrite
PASS  print
PASS  static
PASS  isolation
PASS  store-contract
PASS  client-behaviour
PASS  baseline
20/20 suites passed
```

复现：

```bash
cd ~/Code/DS/dsh-chat
node tools/qa/run-all.mjs          # 约 6–8 分钟
node tools/qa/run-all.mjs --quick  # 跳过 share/trash/baseline/client-behaviour
node tools/qa/static.mjs           # 8 项静态检查，约 3 秒
```

## 2. 新增/更新的套件

### `tools/qa/isolation.mjs`（17 条，新增）
两个独立 Cookie 客户端 + `singleUser:false`：
- B 不能列出/改名/回收/永久删除/恢复 A 的项目；B 的备份不含 A 的项目；B 不能在 A 的项目里建对话；
- B 读 A 的对话 → 404；
- 匿名 `POST /api/logout` → 401，且 A 的会话仍然有效。

### `tools/qa/store-contract.mjs`（7 条，新增）
真实启动进程 + 损坏夹具：

| 夹具 | 断言 | 结果 |
| --- | --- | --- |
| `conversations:[null, ok]` | 启动成功、列表 200、好记录仍在 | PASS `n=1` |
| `conversations` 是对象 | 启动成功、生成 `.corrupt-*`、副本保留原文 | PASS `quarantine=true originalKept=true` |
| 会话缺 `messages` | 列表/搜索 200 | PASS `n=2 search=200` |
| 截断 JSON | 启动成功 + 隔离 | PASS |
| `projects:[null, ok]` | 启动成功、项目列表 1 条 | PASS |
| `shares:[null, ok]` | 启动成功、分享列表 1 条 | PASS |
| 200 条记忆 + 导入 2 条 | 不淘汰旧记忆、返回 `full:true` | PASS `{"imported":0,"skipped":2,"full":true}` |

### `tools/qa/client-behaviour.mjs`（20 条，新增）
真实 Chromium + 受控 `/chat`、`/attach`、`/upload` mock：

| 场景 | 断言 | 结果 |
| --- | --- | --- |
| 禁用 localStorage | 登录可见、可登录、无 pageerror | PASS |
| 800→1280 断点 | `main.inert=false`、输入框可输入 | PASS |
| 移动端关闭态侧栏 | `inert=true`、`aria-hidden=true` | PASS |
| 审批到达 | 焦点仍在 `#input`、未发 `/approval` | PASS |
| 上传中切换 | 不渲染、不 POST、文本保留 | PASS `bodies:[]`、`input:附件消息…` |
| 创建中切换 | URL 不变、线程不变 | PASS |
| attach 回放 | 不泄漏、停止键未点亮 | PASS |
| 慢加载 | 正在输入的文字不被覆盖 | PASS |
| 按指令重写 | POST body 含 `instruction` | PASS |
| 菜单键盘 | 打开即焦点第一项、↑↓ 移动、Escape 只关菜单 | PASS `stop:true` |
| 发送被拒 | 气泡回滚、文本回填 | PASS |

### 更新：`tools/qa/projects.mjs`（29 条）
`.project-chip` → 下拉契约（选项含全部项目/未归类/emoji/计数、选择后过滤且保持选中），
并新增触摸上下文（`hasTouch:true`）的命中区测量：行 44px、`<select>` 覆盖行高减 1px 边框。

### 更新：`tools/qa/api.mjs`（28 条）
新增 5 条：幂等键不被失败请求烧掉、幂等键按会话隔离、并发重复仍 409、拒绝的 PATCH 不产生副作用 ×2。

### 更新：`tools/qa/v5-cycle1.mjs`（24 条）
`role="log"` → 「具名、非 live 的对话区域」（见 ADR-004）。

### 更新：`tools/qa/static.mjs`（8 条）
预算从 `CSS_BUNDLE_FILES` 派生；新增「每个 bundled 文件存在」与「无孤儿样式表」。

## 3. 行为验证（修复前后对照）

| 缺陷 | 修复前 | 修复后 | 证据来源 |
| --- | --- | --- | --- |
| 上传竞态 | 气泡/流落进新对话，POST 发往旧对话 | 不渲染、不 POST、文本保留 | `client-behaviour` |
| fd 泄漏 | `lsof` 23 → 48 | 23 → 23 | 原审计脚本 `t7`（`QA_SOURCE_ROOT=$PWD`） |
| 断点冻结 | 1280 下 `.main` 仍 inert，点不动 | `mainInert=false`，可输入 | `t4` 复跑 |
| attach 泄漏 | 新对话出现旧回答 + 停止键误点 | `leakPresent=false` | `t5` 复跑 |
| 审批抢焦点 | 焦点在「允许一次」，回车授权 | 焦点在 `#input`，`approvalPosts=0` | `t4` 复跑 |
| 存储禁用 | 3 个 pageerror、页面空白 | 登录可用、0 错误 | `t1` 复跑 |
| 打印中流式 | 回答从屏幕消失 | 回答保留、后续 token 可见 | `t3` 复跑 |
| 菜单 Escape | 菜单不关且停止生成 | 菜单关、生成继续（`stop:true`） | `t6` 复跑 |
| 登录页 401 | 2 个 401 | 9 秒只发 `GET /api/me`，4xx=0 | `t8` 复跑 + 空载探针 |
| 选中行对比度 | 4.40 / 4.11 | **4.81 / 4.80** | 渲染色实测脚本 |
| 320px 顶栏 | 透明、正文穿到图标下 | 滚动后实底 `srgb 1 1 1 / 0.88` + `blur(14px)` | 320 探针 + 截图 |
| 标题可见性 | `display:none`，0×0 | 320 下 106×44 可见 | 320 探针 |

## 4. 性能度量（做决策用，不冒充优化成果）

数据来自架构审计的基准脚本（`.tmp-audit-arch/bench-*.mjs`），运行在隔离副本上：

| 指标 | 值 | 说明 |
| --- | --- | --- |
| 空库启动 → 首个 200 | 67–76 ms | 本地 SSD |
| 1000 会话（36.4MB）启动 | 245 ms（进程内 load 103 ms） | 命中上限时约 4GB RSS（外推） |
| `GET /api/conversations?limit=60` | 1.23 ms（p95 2.89） | 1000 会话 |
| 搜索命中（36.4MB） | 11.06 ms | 全量扫描，约 0.31 ms/MB |
| 5000 条会话 `?full=1` | 56.6 ms / 210KB gzip | 默认走 `tail=60`（1.9ms / 3.3KB） |
| 冷载 bundle.css | 6.50 ms（gzip 构建在事件循环） | 304 命中 0.34ms |
| 前端冷载 | 206KB 传输 / 927KB 解码 | 19 个资源，DCL 83ms |
| 4× CPU 节流冷载 | DCL 161.8 ms | 移动端下限参考 |
| 上传 24MB | 32.3 ms | 上传期间列表接口 1.4ms |

**本轮没有做的性能改动**：数据模型迁移（一会话一文件）、搜索索引、brotli、懒加载 codex。
原因见 `requirements.md` 的 `DEFERRED` 表：它们都需要新的加载/写入路径与对应回归，和「不丢数据」的目标冲突面较大，
本轮选择先把正确性与安全性收口。**因此不宣称性能已改善**，只提供基线供后续对比。

## 4.1 真实数据兼容性冒烟（只读副本）

把**线上真实 `data/` 的副本**（`conversations.json` 8.6MB / 95 段会话、7 个项目、3 条记忆、分享与审计）
放进独立临时目录，用当前代码启动并只读访问：

| 检查 | 结果 |
| --- | --- |
| 启动 | 正常（`up:true`），日志无错误 |
| `GET /api/conversations?limit=5` | 200，`total: 95` |
| `GET /api/conversations/:id?tail=20` | 200，首条会话 8 条消息 |
| `GET /api/projects` | 200，7 个项目（含启动时的一次性 owner 归属） |
| `GET /api/conversations?q=的&limit=3` | 200，命中 68 |
| `GET /api/shares` | 200 |

结论：本轮的数据层改动对现有真实数据是向后兼容的，没有破坏读取路径。

同一份副本再做一次**真实浏览器**冒烟（1440×900）：

| 步骤 | 结果 |
| --- | --- |
| 登录 → 主壳可见 | 180 ms |
| 会话列表渲染 | 60 行（首屏 60 条上限） |
| 打开最近一段会话 | 8 条消息，标题与 `#chatHeading` 同步 |
| 控制台 | **0 error / 0 page error** |
| 截图 | `.tmp-audit-lead/real-data-conversation.png` |

## 5. 视觉验证

`tools/qa/visual-snapshot.mjs` 在隔离沙箱里拍 12 张固定场景（桌面 1440 首页/深色/会话/搜索/命令面板/项目、
手机 390 首页/抽屉/会话、320 会话/抽屉/首页），输出到
`reports/ai-optimization/visual/{before,after}/`。

- `before`：修复前（含 320px 透明顶栏、标题缺失）。
- `after`：修复后（顶栏实底、标题可见、模型胶囊不再压正文、控制台 0 错误）。
- 差异不再只靠文字描述：截图 + `manifest.json`（含每次运行捕获的控制台错误）。

## 6. 未验证 / 不能宣称的部分

| 项 | 原因 | 影响 |
| --- | --- | --- |
| 真实模型回复下的端到端质量 | 沙箱没有可用模型（无桌面桥接、无 API key） | 只验证了客户端消费流与导航行为，未评估回答质量 |
| 模型选择器的选择/回滚 | 沙箱目录为空，按钮 disabled | FE-20 标为 SUSPECTED 并延期 |
| iOS 真机键盘 / VoiceOver / 安全区 | 无设备，headless Chrome 上报 0 inset | 320/390 只验证了布局，不声称真机通过 |
| PWA 安装 / iOS Web Push | 需要 HTTPS 与真机 | 未验证 |
| 分享页在真实外网域名下的表现 | 需要反向代理 | 只验证了本地 `/s/<token>` 语义 |
| 5000 会话规模的真实交互 | 只做了接口/进程内基准 | 未做 5000 会话的浏览器交互压测 |
| 项目文件/记忆注入对模型输出的影响 | 无真实模型 | 只验证了请求体与提示词拼装 |
