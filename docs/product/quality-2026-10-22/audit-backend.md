# 后端架构与第一轮质量审计

日期：2026-10-22。角色：高级全栈研发工程师、Apple 风格产品工程专家。审计边界：只读源代码、在线无状态 GET、隔离临时目录执行原存储/上传代码；未读取或输出访问码，未修改用户会话，未修改已验证的 bridge/index.js。此处为工程审计，不冒充真人研究或浏览器验收。

## 架构与业务

单用户优先的本地 Agent Web 客户端。Node 原生 HTTP server 提供静态 SPA、JSON API 和 NDJSON 流；无第三方 Web 框架、无构建产物要求。界面 / 与 /c/:id 共用 index.html。浏览器通过访问码 Cookie 登录；singleUser=false 时使用 client Cookie 哈希作为 owner。会话元数据与消息位于 data/conversations.json，文件位于 data/workspaces 或 data/workspace/chats。存储使用延迟150ms合并写及串行临时文件 rename；软删除8秒后永久清理。引擎支持 DSH native JSON-RPC（TCP loopback桥接）、DSH headless 子进程兜底和 Codex app-server stdio JSON-RPC。原生与 Codex 请求审批/问题，网页回传答案；断开浏览器不会取消后台任务，attach 回放事件。

## 页面、API 与数据清单

| UI/功能 | 接口 | 模型/管理 |
|---|---|---|
| 登录、状态、引擎能力 | POST /api/login、logout；GET /api/me、health、permissions、codex/models、codex/status | access Cookie、client Cookie、权限目录/模型缓存 |
| 首页、侧栏、搜索、分页、归档 | GET/POST /api/conversations；GET/PATCH/DELETE /api/conversations/:id | Conversation：id/owner/title/pinned/engine/permission/createdAt/updatedAt/archivedAt/deletedAt |
| 历史、恢复、副本 | GET :id；POST :id/restore、duplicate | workspace、dshSessionId、codexThreadId、codexModel、codexEffort、mode/nativeCwd/contextEpoch |
| 对话生成、编辑、重试、停止、重连 | POST :id/chat、stop；GET :id/attach | Message：id/role/text/blocks/thinking/status/error/attachments/files/usage/model/createdAt/completedAt/durationMs；activeRuns/startingRuns/事件回放 |
| 引擎审批、用户提问 | POST :id/approval、answer | pendingInteractions；已处理 requestId 去重 |
| Codex桌面跳转 | POST :id/open-codex | thread id + codex URL |
| 文件抽屉、预览、上传、删除 | GET :id/files、files/raw；POST :id/upload、files/delete | 文件相对路径/大小/修改时间/kind；25MB限额；realpath根边界 |
| 设置备份导出、导入 | GET /api/backup；POST /api/backup/import | 版本1JSON，导出消息、不导出工作区文件；导入最多100会话/每会话400消息 |
| 部署/启动 | start.sh、deploy/install.sh、install-native.sh | launchd服务；桌面profile桥接 |

## 可执行候选需求（8项，未为数量制造缺陷）

| ID | 优先级/发现角色 | 问题、复现与代码证据 | 用户影响/优化建议 | 验收标准/依赖 |
|---|---|---|---|---|
| BE-001 | P1 全栈 | 在本机正常PATH下 node 是14.16.0；start.sh:11-19仅判存在不判版本。执行 node import(node:stream/promises) 返回 ERR_UNKNOWN_BUILTIN_MODULE。项目使用该模块和randomUUID、cpSync等现代API。 | 用户按README运行 ./start.sh 失败，而数据目录临时启动器才可运行。按最低支持版本筛选PATH与已安装运行时，并提供明确错误。 | 模拟Node14优先/现代Node备选能选择现代运行时；缺现代运行时时明确报错。无需改变运行中服务。 |
| BE-002 | P1 全栈/产品工程 | store.mjs:352-399在验证消息前create；导入两项，第二项messages:[null]抛TypeError，数据中却新增2项。隔离实测 evidence/backend-baseline.json。 | 导入失败仍污染历史，重试产生重复，可能触发prune。先完整验证/规范化，再一次性提交；异常返回400且不改变存储。 | 含null/非对象/非法数组格式都得到明确错误；失败前后列表/文件一致；合法导入可恢复。 |
| BE-003 | P1 产品工程 | store.mjs:180-190第301项创建时splice(300)，对被移除会话直接removeWorkspace。隔离实测已置顶最旧会话与important.txt一起消失。 | 日常积累或导入会无提示永久丢失用户数据。容量满时返回可恢复错误并引导整理/备份；不得自动删除现有会话。 | 300项时新建/批量导入拒绝且已有300项及文件保持；导入容量检查原子化。 |
| BE-004 | P1 全栈 | store.mjs:340-347把副本文件复制到WORKSPACE_ROOT/id；index.mjs:661-664、1246-1249、1299-1302在Codex/native首次上传/运行时切换到SHARED_WORKSPACE/chats/id。副本复制异常被吞。 | 副本刚创建可见附件，继续使用会丢失工作区入口；用户以为副本完整。统一副本与引擎工作区路径，复制失败回滚并明确反馈。 | Codex/native/headless副本继续上传/发送前后原附件仍可访问；复制失败不留下成功副本。 |
| BE-005 | P1 全栈 | index.mjs:691-727两个同名上传在尚未落目标文件时选择同一target与同一.part。执行原函数并行上传：1 fulfilled、1 ENOENT，仅1文件。 | 同时选中同名文件或双设备上传导致文件覆盖/失败。使用独占保留目标、每上传唯一临时文件，完成时原子提交。 | 两并发同名上传均成功、文件名不同且内容各自正确；取消/错误清理临时文件。 |
| BE-006 | P2 产品工程 | index.mjs:105-116 decodeURIComponent没有异常保护；在线GET /api/me 携带 Cookie:dsh_access=%ZZ 得到500 URI malformed。 | 坏Cookie导致启动认证反复失败，用户难自助恢复；忽略非法Cookie并返回未登录。 | 畸形百分号、空值、正常Cookie均不500；非法认证仍401/未登录。 |
| BE-007 | P2 全栈 | store.mjs:326仅复制engine/permission，codexModel/codexEffort仍null；隔离实测源chosen-model/high变null/null。 | 复制对话后模型和推理强度意外变化，破坏操作预期。继承有效会话模型/强度，保持新thread/session ID为空。 | 副本保留模型/强度/权限，且不继承引擎会话标识。 |
| BE-008 | P1 全栈 | index.mjs:1833-1837在try之外构造new URL；无效Host会同步抛错并使async request listener产生未处理拒绝。代码已定位，尚未向运行中服务发送以免中断用户。 | 畸形请求可能终止整个本地服务。将URL解析移入请求错误边界并返回400。 | 在隔离服务发送畸形Host/URL后返回400，随后health仍200；在线不做破坏性验证。 |

## 其他后续风险（尚未列为已验证缺陷）

- PATCH组合请求先更新engine/model，再校验title；不合法title可能导致部分修改。建议统一验证后提交。
- readJsonBody接受JSON null或数组，路由随后访问字段可能500；建议共享对象体契约。导入的版本/归档/置顶/中断状态保留需另评审。
- hub.send忽略backpressure，事件回放无体积上限；文件扫描与gzip为同步操作。应在第四轮基于真实压测决定限额/优化，不凭代码直接给性能结论。
- 上传目录若被Agent改为外部符号链接，uploadDestination缺少realpath根边界。文件读取已有边界保护；建议上传写入同步保护并隔离验证。
- 原生已存在会话断开后不会自动切换headless；这是上下文保护选择，应通过明确可恢复状态说明而不是悄然换引擎。

## 初始工程观察与覆盖限制

已真实验证：运行中health 200、畸形Cookie 500、当前PATH Node14不支持必要模块；临时store导入部分失败、301项数据删除、副本配置遗漏、工作区根路径不一致；执行原上传辅助函数并发竞态。未执行生产数据删除、并发真实Agent生成、故意崩溃运行中服务。已有 tools/qa 包含API和CDP浏览器脚本；依赖运行服务器与Chrome 9222，api.mjs当前假设列表至少2项，不能作为空安装无条件验收。

建议第一轮完成BE-001至BE-008并建立独立临时目录回归；第四轮再测大型会话、SSE重连与慢客户端资源边界。没有依据把后端性能、双引擎全流程、权限审批或跨浏览器验证标记为通过。
