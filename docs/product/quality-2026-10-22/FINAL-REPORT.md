# 产品体验与工程质量优化总结报告

交付日期：2026-10-22。项目：DeepSeek-Harness-Web。当前服务：[打开本地应用](http://127.0.0.1:8787/)。

连续五轮已完成，共批准并落实 **30 项有效需求**，逐项测试和产品验收 **30/30**。每轮基于上一轮最新源码开展审查、实施、独立QA、模拟用户复测并保存回退快照。目标每轮50项，但实际只找到11、5、4、6、4项经过验证且值得独立实施的问题；没有拆分重复项或制造需求。

最终结论为 **有条件发布**：适合当前已验证的单用户、本机运行场景；不作为商业化、公网、多用户、全浏览器或完整无障碍认证。批准范围内未遗留已知P0/P1失败；未验证领域和技术债仍单独保留。项目正在运行，DSR和Codex真实基本消息均已验证。

## 1. 五轮闭环与交付

|轮次|重点|有效需求|P0/P1/P2/P3|开发/未开发/阻塞/延期|关联需求验收|固定主回归|质量分|
|---|---|---:|---|---|---|---|---:|
|基线|真实运行、18个功能族清单、隔离浏览器审计|—|—|—|—|43/59 · 72.9%|59.0|
|R1|核心功能、数据与基础可靠性|11|1/9/1/0|11/0/0/0|11/11 · 100%|54/59 · 91.5%|73.0|
|R2|字体、触控、对比度、表格与草稿保护|5|0/1/4/0|5/0/0/0|5/5 · 100%|56/59 · 94.9%|77.0|
|R3|全库检索、历史查找、撤销与标签页隔离|4|0/1/3/0|4/0/0/0|4/4 · 100%|57/59 · 96.6%|78.8|
|R4|缓存I/O、并发恢复、键盘及偏好持久化|6|0/0/6/0|6/0/0/0|6/6 · 100%|58/59 · 98.3%|79.4|
|R5|弹层退出、版本更新、场景及缓存草稿|4|0/3/1/0|4/0/0/0|4/4 · 100%|59/59 · 100%|81.4|

每轮“关联需求验收100%”仅指该轮批准项的验收条件，不等于全产品测试100%。例如R1主回归仍有5项已归后续轮次的问题；R4仍有模型回焦与新发现的场景覆盖失败，R5逐项关闭。完整PRD、设计规范、状态流、异常边界、分工和单轮报告均已保存。

[R1 PRD](/Users/liupengbin/Work/DeepSeek-Harness-Web/docs/product/quality-2026-10-22/R1-prd.md) · [R2 PRD](/Users/liupengbin/Work/DeepSeek-Harness-Web/docs/product/quality-2026-10-22/R2-prd.md) · [R3 PRD](/Users/liupengbin/Work/DeepSeek-Harness-Web/docs/product/quality-2026-10-22/R3-prd.md) · [R4 PRD](/Users/liupengbin/Work/DeepSeek-Harness-Web/docs/product/quality-2026-10-22/R4-prd.md) · [R5 PRD](/Users/liupengbin/Work/DeepSeek-Harness-Web/docs/product/quality-2026-10-22/R5-prd.md)

[R1 验收](/Users/liupengbin/Work/DeepSeek-Harness-Web/docs/product/quality-2026-10-22/R1-report.md) · [R2 验收](/Users/liupengbin/Work/DeepSeek-Harness-Web/docs/product/quality-2026-10-22/R2-report.md) · [R3 验收](/Users/liupengbin/Work/DeepSeek-Harness-Web/docs/product/quality-2026-10-22/R3-report.md) · [R4 验收](/Users/liupengbin/Work/DeepSeek-Harness-Web/docs/product/quality-2026-10-22/R4-report.md) · [R5 验收](/Users/liupengbin/Work/DeepSeek-Harness-Web/docs/product/quality-2026-10-22/R5-report.md)

各角色以独立关注点审查，但均为代理角色/模拟用户，不是真人研究：

|角色|实际职责与证据|
|---|---|
|Apple风格产品工程|统一弹层状态、焦点归还、44px触控、克制动效和减少动态效果；回归实际浏览器|
|UI设计|模型小字/截断、标签对比度、主题与表格响应式，逐尺寸截图和几何测量|
|UX设计|全文检索、旧消息定位、草稿保护、删除撤销与错误恢复路径|
|模拟普通用户|新用户场景填写、熟练用户草稿/设置、效率用户搜索、手机模拟与键盘任务|
|产品经理|去重排序、30个唯一ID、逐项验收与未验证领域跟踪|
|全栈研发|真实源代码实现、请求归属/数据事务、持久化与缓存；无示例替代|
|独立QA|独立源码快照/数据/配置，实际HTTP和Chrome；发现草稿新边界后返工重冻|

[项目结构、页面及API清单](/Users/liupengbin/Work/DeepSeek-Harness-Web/docs/product/quality-2026-10-22/01-inventory.md) · [初始QA基线](/Users/liupengbin/Work/DeepSeek-Harness-Web/docs/product/quality-2026-10-22/qa-baseline.md) · [最终功能覆盖矩阵与未测边界](/Users/liupengbin/Work/DeepSeek-Harness-Web/docs/product/quality-2026-10-22/qa-coverage.md)

## 2. 统一需求追踪

下表保留全部批准需求；每行测试/验收结论均有实际执行证据。完整复现、发现角色、验收条件与风险在机器可读台账及对应PRD中。合计P0 1、P1 14、P2 15、P3 0。

[requirements.json](/Users/liupengbin/Work/DeepSeek-Harness-Web/docs/product/quality-2026-10-22/requirements.json)

|编号/来源|优先级|问题|实际修改|代码关联|开发|测试/验收|证据|
|---|---|---|---|---|---|---|---|
|R1-001 / R1|P1|登录后无法找到退出入口|登录态同步退出入口；退出成功后清缓存，失败保留页面并提示；防重复提交|[app.js](/Users/liupengbin/Work/DeepSeek-Harness-Web/public/js/app.js)|已开发|测试通过 / 验收通过|[results.json](/Users/liupengbin/Work/DeepSeek-Harness-Web/reports/quality/round1/results.json)|
|R1-002 / R1|P1|慢响应覆盖最近选择的会话|navigationRequest递增令牌丢弃旧响应，空白/登录视图也作废请求|[app.js](/Users/liupengbin/Work/DeepSeek-Harness-Web/public/js/app.js)|已开发|测试通过 / 验收通过|[results.json](/Users/liupengbin/Work/DeepSeek-Harness-Web/reports/quality/round1/results.json)|
|R1-003 / R1|P1|新建/空白会话与浏览器地址不同步，失败导航骨架不恢复|统一创建/清空/失败路由同步；404恢复上一可用视图，前进后退不重复push|[app.js](/Users/liupengbin/Work/DeepSeek-Harness-Web/public/js/app.js)|已开发|测试通过 / 验收通过|[results.json](/Users/liupengbin/Work/DeepSeek-Harness-Web/reports/quality/round1/results.json)|
|R1-004 / R1|P1|重复打开模态层会遗留inert锁|背景inert由当前可见模态推导；重复打开复用当前焦点|[app.js](/Users/liupengbin/Work/DeepSeek-Harness-Web/public/js/app.js)|已开发|测试通过 / 验收通过|[results.json](/Users/liupengbin/Work/DeepSeek-Harness-Web/reports/quality/round1/results.json)|
|R1-005 / R1|P1|批量归档/删除及撤销吞错后报告全部成功|批量变更返回成功与失败集合；失败保留选择、仅撤销成功集合、忙碌锁|[app.js](/Users/liupengbin/Work/DeepSeek-Harness-Web/public/js/app.js)|已开发|测试通过 / 验收通过|[batch.json](/Users/liupengbin/Work/DeepSeek-Harness-Web/reports/quality/round1/batch.json)、[frontend-batch-unit.json](/Users/liupengbin/Work/DeepSeek-Harness-Web/docs/product/quality-2026-10-22/evidence/frontend-batch-unit.json)|
|R1-006 / R1|P1|非法备份导入会部分落库|整个备份先验证再构造提交；保留完整历史、偏好与消息状态|[store.mjs](/Users/liupengbin/Work/DeepSeek-Harness-Web/server/store.mjs)、[index.mjs](/Users/liupengbin/Work/DeepSeek-Harness-Web/server/index.mjs)|已开发|测试通过 / 验收通过|[backend-R1.json](/Users/liupengbin/Work/DeepSeek-Harness-Web/docs/product/quality-2026-10-22/evidence/backend-R1.json)|
|R1-007 / R1|P0|301个会话静默删除旧置顶会话及工作区|容量显式409，禁止旧数据与工作区被静默淘汰|[store.mjs](/Users/liupengbin/Work/DeepSeek-Harness-Web/server/store.mjs)|已开发|测试通过 / 验收通过|[backend-R1.json](/Users/liupengbin/Work/DeepSeek-Harness-Web/docs/product/quality-2026-10-22/evidence/backend-R1.json)|
|R1-008 / R1|P1|副本附件在后续操作切换目录后不可见且模型偏好丢失|副本规范工作区与后续引擎目录一致；完整复制后才发布并保留模型/强度|[store.mjs](/Users/liupengbin/Work/DeepSeek-Harness-Web/server/store.mjs)、[index.mjs](/Users/liupengbin/Work/DeepSeek-Harness-Web/server/index.mjs)|已开发|测试通过 / 验收通过|[backend-R1.json](/Users/liupengbin/Work/DeepSeek-Harness-Web/docs/product/quality-2026-10-22/evidence/backend-R1.json)|
|R1-009 / R1|P1|并发同名上传竞争.part及最终文件|独立临时文件+排他硬链接发布，竞争时生成独立文件名；失败清理|[index.mjs](/Users/liupengbin/Work/DeepSeek-Harness-Web/server/index.mjs)|已开发|测试通过 / 验收通过|[backend-R1.json](/Users/liupengbin/Work/DeepSeek-Harness-Web/docs/product/quality-2026-10-22/evidence/backend-R1.json)|
|R1-010 / R1|P2|畸形Cookie使健康身份查询500|忽略坏Cookie片段；JSON对象校验与畸形Host防护|[index.mjs](/Users/liupengbin/Work/DeepSeek-Harness-Web/server/index.mjs)|已开发|测试通过 / 验收通过|[backend-R1.json](/Users/liupengbin/Work/DeepSeek-Harness-Web/docs/product/quality-2026-10-22/evidence/backend-R1.json)|
|R1-011 / R1|P1|默认Node14导致直接启动失败|选择受支持Node22+并尊重NODE_BIN；安装服务写入选中运行时且XML转义|[start.sh](/Users/liupengbin/Work/DeepSeek-Harness-Web/start.sh)、[install.sh](/Users/liupengbin/Work/DeepSeek-Harness-Web/deploy/install.sh)|已开发|测试通过 / 验收通过|[backend-R1.json](/Users/liupengbin/Work/DeepSeek-Harness-Web/docs/product/quality-2026-10-22/evidence/backend-R1.json)|
|R2-001 / R2|P2|Codex模型设置字号过小且深入说明被裁切|说明至少12px、标题至少14px；取消截行，长中文可完整阅读；面板超高时内部滚动且不溢出视口|[codex.css](/Users/liupengbin/Work/DeepSeek-Harness-Web/public/css/codex.css)|已开发|测试通过 / 验收通过|[design.json](/Users/liupengbin/Work/DeepSeek-Harness-Web/reports/quality/round2/design.json)、[exploration.json](/Users/liupengbin/Work/DeepSeek-Harness-Web/reports/quality/round2/exploration.json)|
|R2-002 / R2|P2|触控平板的模型入口与弹窗操作目标过小|coarse设备所有Codex交互目标最小44px；320/390/768不横溢出，桌面保持紧凑|[codex.css](/Users/liupengbin/Work/DeepSeek-Harness-Web/public/css/codex.css)|已开发|测试通过 / 验收通过|[design.json](/Users/liupengbin/Work/DeepSeek-Harness-Web/reports/quality/round2/design.json)、[exploration.json](/Users/liupengbin/Work/DeepSeek-Harness-Web/reports/quality/round2/exploration.json)|
|R2-003 / R2|P2|浅色默认标签对比度不足|标签普通文本在浅/深色均达到4.5:1；使用明确语义颜色，不依赖叠透明度|[codex.css](/Users/liupengbin/Work/DeepSeek-Harness-Web/public/css/codex.css)|已开发|测试通过 / 验收通过|[design.json](/Users/liupengbin/Work/DeepSeek-Harness-Web/reports/quality/round2/design.json)、[exploration.json](/Users/liupengbin/Work/DeepSeek-Harness-Web/reports/quality/round2/exploration.json)|
|R2-004 / R2|P2|多列表格在小屏挤成单字竖排|表格单元格保留可读最小宽度，横向滚动发生在表格容器内；正文/代码区不造成页面横溢出|[style.css](/Users/liupengbin/Work/DeepSeek-Harness-Web/public/css/style.css)|已开发|测试通过 / 验收通过|[design.json](/Users/liupengbin/Work/DeepSeek-Harness-Web/reports/quality/round2/design.json)、[exploration.json](/Users/liupengbin/Work/DeepSeek-Harness-Web/reports/quality/round2/exploration.json)|
|R2-005 / R2|P1|提示词插入静默覆盖已写草稿|已有草稿保留并在末尾分段追加提示词，空稿仍直接插入；焦点返回输入框，草稿立即持久化；刷新内容一致|[app.js](/Users/liupengbin/Work/DeepSeek-Harness-Web/public/js/app.js)|已开发|测试通过 / 验收通过|[design.json](/Users/liupengbin/Work/DeepSeek-Harness-Web/reports/quality/round2/design.json)、[exploration.json](/Users/liupengbin/Work/DeepSeek-Harness-Web/reports/quality/round2/exploration.json)|
|R3-001 / R3|P2|Cmd+P只查已加载标题与末条预览，遗漏历史内容和第61项以后的会话|使用现有服务端全文API；200ms去抖、过期请求不覆盖新查询；显示加载/空/失败可重试；键盘上下/Enter及combobox语义；选中历史结果后重新聚焦页面仍保持该对话|[app.js](/Users/liupengbin/Work/DeepSeek-Harness-Web/public/js/app.js)、[index.html](/Users/liupengbin/Work/DeepSeek-Harness-Web/public/index.html)|已开发|测试通过 / 验收通过|[results.json](/Users/liupengbin/Work/DeepSeek-Harness-Web/reports/quality/r3-quick-after/results.json)、[advanced.json](/Users/liupengbin/Work/DeepSeek-Harness-Web/reports/quality/round3/advanced.json)|
|R3-002 / R3|P2|长会话查找及旧消息链接被60条渲染窗口限制|静态会话查找全部可读正文；可在命中间前后跳转；定位旧消息时仅渲染附近窗口，保留前后加载/回最近入口；关闭查找恢复普通阅读；初次仍最多60条；生成中不破坏live view|[app.js](/Users/liupengbin/Work/DeepSeek-Harness-Web/public/js/app.js)|已开发|测试通过 / 验收通过|[find.json](/Users/liupengbin/Work/DeepSeek-Harness-Web/reports/quality/round3/find.json)、[find-flow.json](/Users/liupengbin/Work/DeepSeek-Harness-Web/reports/quality/round3/find-flow.json)|
|R3-003 / R3|P2|自定义提示词误删没有恢复路径且焦点丢失|删除后显示含名称的撤销提示；撤销恢复原内容与位置且持久化；保留可见焦点；删除多个时撤销只恢复对应条目且不重复|[app.js](/Users/liupengbin/Work/DeepSeek-Harness-Web/public/js/app.js)、[style.css](/Users/liupengbin/Work/DeepSeek-Harness-Web/public/css/style.css)|已开发|测试通过 / 验收通过|[advanced.json](/Users/liupengbin/Work/DeepSeek-Harness-Web/reports/quality/round3/advanced.json)、[find.json](/Users/liupengbin/Work/DeepSeek-Harness-Web/reports/quality/round3/find.json)|
|R3-004 / R3|P1|Codex设置受共享localStorage和迟响应影响，可误改另一标签页会话|会话归属从当前页路由获得；A操作只修改A；过期summary/PATCH/create响应不覆盖当前B；打开Codex操作也绑定点击时ID；两tab与延迟响应三类回归通过|[codex.js](/Users/liupengbin/Work/DeepSeek-Harness-Web/public/js/codex.js)|已开发|测试通过 / 验收通过|[codex-state-R3.json](/Users/liupengbin/Work/DeepSeek-Harness-Web/docs/product/quality-2026-10-22/evidence/codex-state-R3.json)、[codex-tabs.json](/Users/liupengbin/Work/DeepSeek-Harness-Web/reports/quality/round3/codex-tabs.json)|
|R4-001 / R4|P2|CSS缓存命中仍重复读取全部七文件|CSS bundle先stat算缓存键，仅miss读文件/压缩；保持ETag、HEAD、gzip与错误恢复|[index.mjs](/Users/liupengbin/Work/DeepSeek-Harness-Web/server/index.mjs)|已开发|测试通过 / 验收通过|[backend-R4-cache.json](/Users/liupengbin/Work/DeepSeek-Harness-Web/docs/product/quality-2026-10-22/evidence/backend-R4-cache.json)|
|R4-002 / R4|P2|文件预览旧请求污染新的文件或关闭后的容器|预览打开/关闭递增版本并取消读取；文本/图片回调及延后焦点核验本次请求|[app.js](/Users/liupengbin/Work/DeepSeek-Harness-Web/public/js/app.js)|已开发|测试通过 / 验收通过|[advanced.json](/Users/liupengbin/Work/DeepSeek-Harness-Web/reports/quality/round4/advanced.json)、[results.json](/Users/liupengbin/Work/DeepSeek-Harness-Web/reports/quality/r5-image-preview/results.json)|
|R4-003 / R4|P2|公式资源一次加载失败使同页永久无法渲染|CSS/脚本全部就绪后渲染；失败清理promise/标签，可重试且复用成功资源|[app.js](/Users/liupengbin/Work/DeepSeek-Harness-Web/public/js/app.js)|已开发|测试通过 / 验收通过|[recovery.json](/Users/liupengbin/Work/DeepSeek-Harness-Web/reports/quality/round4/recovery.json)、[edges.json](/Users/liupengbin/Work/DeepSeek-Harness-Web/reports/quality/r4-frontend-after/edges.json)|
|R4-004 / R4|P2|分页旧响应混入新搜索结果|列表/搜索/分页用版本和请求对象隔离，避免旧响应/旧finally影响当前查询|[app.js](/Users/liupengbin/Work/DeepSeek-Harness-Web/public/js/app.js)|已开发|测试通过 / 验收通过|[recovery.json](/Users/liupengbin/Work/DeepSeek-Harness-Web/reports/quality/round4/recovery.json)、[edges.json](/Users/liupengbin/Work/DeepSeek-Harness-Web/reports/quality/r4-frontend-after/edges.json)|
|R4-005 / R4|P2|设置单选组宣称radio却没有箭头键行为|统一radio方向键、Home/End、单Tab入口，跳过禁用并保持选择焦点|[app.js](/Users/liupengbin/Work/DeepSeek-Harness-Web/public/js/app.js)|已开发|测试通过 / 验收通过|[radio.json](/Users/liupengbin/Work/DeepSeek-Harness-Web/reports/quality/round4/radio.json)、[advanced.json](/Users/liupengbin/Work/DeepSeek-Harness-Web/reports/quality/round4/advanced.json)|
|R4-006 / R4|P2|阅读密度和字号保存后刷新恢复默认|PREFS_KEY提前初始化，启动loadPrefs正确读取既有存储|[app.js](/Users/liupengbin/Work/DeepSeek-Harness-Web/public/js/app.js)|已开发|测试通过 / 验收通过|[radio.json](/Users/liupengbin/Work/DeepSeek-Harness-Web/reports/quality/round4/radio.json)、[features.json](/Users/liupengbin/Work/DeepSeek-Harness-Web/reports/quality/round4/features.json)|
|R5-001 / R5|P2|模型面板无可见关闭且Escape后焦点落body；快速切换只有Esc文字缺少触控关闭|quick和Codex增加44px关闭；模型modal共享背景锁、焦点圈/回焦/顶层Escape与resize定位|[codex.js](/Users/liupengbin/Work/DeepSeek-Harness-Web/public/js/codex.js)、[codex.css](/Users/liupengbin/Work/DeepSeek-Harness-Web/public/css/codex.css)、[app.js](/Users/liupengbin/Work/DeepSeek-Harness-Web/public/js/app.js)、[index.html](/Users/liupengbin/Work/DeepSeek-Harness-Web/public/index.html)、[refine.css](/Users/liupengbin/Work/DeepSeek-Harness-Web/public/css/refine.css)|已开发|测试通过 / 验收通过|[polish.json](/Users/liupengbin/Work/DeepSeek-Harness-Web/reports/quality/round5/polish.json)、[release.json](/Users/liupengbin/Work/DeepSeek-Harness-Web/reports/quality/round5/release.json)、[codex-modal-R5.json](/Users/liupengbin/Work/DeepSeek-Harness-Web/docs/product/quality-2026-10-22/evidence/codex-modal-R5.json)|
|R5-002 / R5|P1|已修改资源仍沿用原immutable URL和SW版本，已有用户可能继续执行旧代码|bundle48/app54/codex2/codex.css2与SWv15；真实旧缓存升级及离线/在线恢复；主服务安全重启|[index.html](/Users/liupengbin/Work/DeepSeek-Harness-Web/public/index.html)、[codex.js](/Users/liupengbin/Work/DeepSeek-Harness-Web/public/js/codex.js)、[sw.js](/Users/liupengbin/Work/DeepSeek-Harness-Web/public/sw.js)|已开发|测试通过 / 验收通过|[release.json](/Users/liupengbin/Work/DeepSeek-Harness-Web/reports/quality/round5/release.json)、[local-restart.json](/Users/liupengbin/Work/DeepSeek-Harness-Web/reports/quality/round5/local-restart.json)、[native.json](/Users/liupengbin/Work/DeepSeek-Harness-Web/reports/quality/round5/native.json)|
|R5-003 / R5|P1|场景模板覆盖已有草稿且刷新后模板丢失|场景模板双换行追加保留原稿，立即保存，正确选择新占位符并校验输入上限|[app.js](/Users/liupengbin/Work/DeepSeek-Harness-Web/public/js/app.js)|已开发|测试通过 / 验收通过|[features.json](/Users/liupengbin/Work/DeepSeek-Harness-Web/reports/quality/round5/features.json)、[polish.json](/Users/liupengbin/Work/DeepSeek-Harness-Web/reports/quality/round5/polish.json)、[results.json](/Users/liupengbin/Work/DeepSeek-Harness-Web/reports/quality/r5-scenario-after/results.json)|
|R5-004 / R5|P1|缓存启动不恢复当前会话草稿，认证后空输入覆盖已保存内容|缓存恢复currentId后立刻恢复对应草稿，避免空值回写；恢复发送状态保留24k校验|[app.js](/Users/liupengbin/Work/DeepSeek-Harness-Web/public/js/app.js)|已开发|测试通过 / 验收通过|[polish.json](/Users/liupengbin/Work/DeepSeek-Harness-Web/reports/quality/round5/polish.json)、[results.json](/Users/liupengbin/Work/DeepSeek-Harness-Web/reports/quality/r5-scenario-after/results.json)|

R4-002原文本竞态之外，最终另补4个图片load/error迟到场景，确认关闭/换B后不污染B，且下载路径/文件名正确；不据此推断PDF和全部图片格式都通过。

## 3. 固定质量评分对比

采用固定71个维度检查：通过1，失败/阻塞/未测0，全部保留在分母；同一证据可能出现在多个维度。权重保持20/20/15/15/15/10/5。它是有限证据下的就绪度分数，不是满意度、WCAG认证或发布认证，也没有因为新增测试而改变分母。

|维度|权重|基线|R1|R2|R3|R4|R5|
|---|---:|---:|---:|---:|---:|---:|---:|
|功能完整性|20%|85.7|85.7|85.7|85.7|85.7|92.9|
|UX用户体验|20%|45.5|72.7|81.8|90.9|90.9|90.9|
|UI视觉品质|15%|57.1|57.1|71.4|71.4|71.4|71.4|
|性能和响应速度|15%|50.0|50.0|50.0|50.0|50.0|50.0|
|稳定性与可靠性|15%|35.7|92.9|92.9|92.9|92.9|92.9|
|移动端和响应式体验|10%|80.0|80.0|80.0|80.0|80.0|80.0|
|无障碍与易用性|5%|66.7|66.7|66.7|66.7|77.8|88.9|
|**加权总分**|**100%**|**59.0**|**73.0**|**77.0**|**78.8**|**79.4**|**81.4**|

稳定性和UX提升主要来自竞态、可恢复批量操作、数据保护与搜索。UI改善有局部尺寸/对比度和截图证据，完整全页面对比度仍未覆盖。性能分仍50，是因为低端真机、慢网、10分钟流式内存缺少证据，未因CSS I/O减少而擅自加分。移动分仍80，模拟视口不替代真机。

R5隔离评分79.9，加上真实DSR生成/停止/续接完整证据后为81.4；这一部分是验收覆盖增加，不能全部归因于新增代码。DSR接入修复在五轮开始前已完成，本轮只是保留并实测。Codex仅基本回复通过，固定项“Codex生成/工具审批”整体仍计未通过。

[固定评分实现](/Users/liupengbin/Work/DeepSeek-Harness-Web/tools/qa/quality-score.mjs) · [最终评分明细](/Users/liupengbin/Work/DeepSeek-Harness-Web/reports/quality/round5/score.json)

## 4. 可重复的前后收益

|场景|原表现|当前结果与证据|
|---|---|---|
|容量/导入|301条会话时静默删旧记录；无效导入可能写入部分数据|容量409并提示整理；完整校验后一次提交，失败原数据不变|
|批量操作|全失败仍可能称成功，选择丢失，重复点击重复请求|报告精确成功/失败数，保留失败项重试，仅撤销成功项，忙碌期间不重复发送|
|模型设置|24/32px平板触控、说明小且截断|44px粗指针目标；14px模型名/12px完整说明；模型/quick明确关闭与回焦|
|默认标签对比度|浅3.60:1、深5.68:1|浅6.27:1、深6.81:1；仅这组实测，不代表全站合规|
|窄屏表格|列被压窄，难以阅读|320px下容器290、内容520、每列104，可局部横向滚动，页面无横溢出|
|历史检索|quick仅已有列表；find只最近渲染窗口|CmdP→关键词→Enter找第75个会话或早期正文；find能定位1000消息中的首条|
|长会话DOM|旧命中不在渲染窗口，无法定位|1000消息样本初始60条/1356节点；定位旧命中30条/679节点；关闭恢复60条；一次查找184ms含去抖|
|模板与草稿|插入覆盖、未立即保存；已有会话刷新又被空input删稿|双换行追加并即时保存，正确选择新占位符；刷新与A/B深链不串稿；超24k禁发|
|CSS暖缓存|100次请求读取700次文件，共21,902,300字节|内容读取/压缩均0，仍700次stat确保更新失效；gzip/HEAD/ETag/错误恢复通过|
|交付更新|旧immutable URL与SW v14可能继续使用旧码|bundle48/app54/codex2/css2、SW v15；真实升级、旧cache清理、离线和在线恢复通过|

导航load基线16ms、最终16ms；encoded资源107,354→115,139字节（约增加7.3%）。这是本机单次样本，不能证明首屏全面变快，也不是LCP/INP/CLS现场数据。可靠性改动增加了部分代码体积，缓存I/O减少另有单独计数证据。

### 截图

以下设计截图使用明确QA夹具，原生运行截图来自实际本地账户。截图在动画稳定后保存，未把过渡中透明帧当最终界面。

- [当前应用内浏览器首页](/Users/liupengbin/Work/DeepSeek-Harness-Web/reports/quality/round5/final-in-app-home.png)
- [基线模型面板](/Users/liupengbin/Work/DeepSeek-Harness-Web/reports/quality/baseline/codex-model-settings.png)
- [最终桌面浅色模型与表格](/Users/liupengbin/Work/DeepSeek-Harness-Web/reports/quality/round5/design-1440-light.png)
- [最终手机深色模型与表格](/Users/liupengbin/Work/DeepSeek-Harness-Web/reports/quality/round5/design-390-dark.png)
- [最终320px减少动态效果](/Users/liupengbin/Work/DeepSeek-Harness-Web/reports/quality/round5/polish-model-320-reduced-motion.png)
- [真实DSR停止后续接](/Users/liupengbin/Work/DeepSeek-Harness-Web/reports/quality/round5/native-dsr.png)
- [真实Codex基本回复](/Users/liupengbin/Work/DeepSeek-Harness-Web/reports/quality/round5/native-codex.png)
- [明确离线状态](/Users/liupengbin/Work/DeepSeek-Harness-Web/reports/quality/round5/release-offline-shell.png)

![最终桌面设计验证](/Users/liupengbin/Work/DeepSeek-Harness-Web/reports/quality/round5/design-1440-light.png)

## 5. 最终测试与验收

|测试层/范围|实际结果|证据|
|---|---|---|
|固定浏览器/API/批量主套件|59/59|round5/results、exploration、batch.json|
|功能补测：置顶/导出/复制/统计/权限/输入等|15/15|round5/features.json|
|打磨：模板精确选区、草稿刷新/深链、焦点圈/锁/resize/减少动态效果|10/10|round5/polish.json|
|扩展：quick全库、预览、radio、撤销|7/7|round5/advanced.json|
|视觉/响应式：320/390/768/1440、浅深主题、表格/触控/局部对比度|46/46|round5/design.json及8张截图|
|完整历史查找、分享hash、空结果、重复跳转|8/8|round5/find.json|
|真实旧HTML/资源和SW完整升级及触控关闭|8/8|round5/release.json|
|真实DSR与Codex基本流、停止/续接/刷新|6/6|round5/native.json|
|图片load/error旧回调4个边界|4/4|r5-image-preview/results.json|
|后端数据/上传/请求/启动专项|R1时21/21；其后无相关存储修改|evidence/backend-R1.json|
|CSS生产函数真实HTTP计数|R4时6/6，主代理独立复跑|evidence/backend-R4-cache.json|
|公式恢复/分页额外边界|R4 recovery2/2与edges8/8|round4/recovery.json、r4-frontend-after/edges.json|
|Codex弹层/状态与场景专项|10/10、7/7、22/22（20浏览器+2函数边界）|evidence/codex-modal-R5.json、codex-state-R5.json；r5-scenario-after/results.json|

最终独立QA七个隔离套件共153个断言通过，存在交叉覆盖，不等于153个独立业务需求或真实用户。真实引擎专项不混入隔离测试通过率。当前核心9个产品文件与最终QA快照逐字节一致；Node语法、shell语法、git diff --check通过。

### 真实原生验收

在确认没有运行任务后重启本机服务，健康检查通过，保持127.0.0.1绑定。DSR首条1564ms；已出现29个流式字符时点击停止，341ms后服务状态stopped；同一session续接1041ms返回先前四位数字7429；刷新保留3条assistant。Codex真实基本回复10024ms。时间均为单次当前网络观测。

首次原生脚本错把持久化text当作实时delta，错过停止后超时；保留失败原始记录，改观察真实DOM后重跑通过。没有通过修改产品或虚增超时伪装通过。测试仅创建专用只读QA会话，结束后归档；未动原有会话或扩大权限。真实工具执行/审批没有包含在这些结论内。

### 模拟用户最终复测

|用户视角|实际完成任务|结果/限制|
|---|---|---|
|第一次访问|选择场景→改占位符→检查输入有效性；模板可刷新保留|通过模拟；文案理解仍待真人|
|高频熟练用户|设置阅读偏好→刷新；会话A写稿→B→刷新→A|通过，偏好与各自草稿保留|
|普通用户|部分归档失败→按明确数量重试；提示词误删→撤销|通过，失败选择不丢、撤销内容与顺序恢复|
|移动用户|390px触控开关模型/quick；320px读取宽表格|通过模拟；真实软键盘/系统浏览器未测|
|效率型用户|CmdP全文检索、Enter打开；find历史首条；键盘Tab/Escape退出|通过，原来无法完成的历史定位现可执行|

## 6. 工程交付、运行与回退

主要产品变更为app.js、codex.js、index.html、3个CSS文件、sw.js、server/index.mjs、store.mjs、start.sh、deploy/install.sh。沿用原有无框架结构，无新的生产依赖、无数据库迁移。bridge/index.js包含此前DSR消息结构兼容修复，保留原改动且不重复计为五轮成果。

本地服务已启动，不需要再次启动占用相同端口。未来重启可在项目目录运行：

```sh
cd /Users/liupengbin/Work/DeepSeek-Harness-Web
CODEX_BIN="/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex" ./start.sh
```

start.sh会寻找Node22+；可用 `./start.sh --check-runtime` 只检查运行时，或显式 `NODE_BIN=/path/to/node`。本机默认全局Node14和Homebrew Codex0.46较旧；上述CODEX_BIN使用已安装ChatGPT包内0.163版本，不要求改变全局环境。现有本地便捷启动器为data/start-local.sh；该文件与config/data均被Git忽略，不提交凭据。

升级专项实际载入旧app53/codex1/bundle47/CSS1/SWv14，再由旧页面的更新提示刷新到app54/codex2/bundle48/CSS2/SWv15；原始旧客户端截图保存在 reports/quality/round5/release-old-v14-client.png。

没有npm build：服务直接提供public静态资源并合并CSS。config.json保持原私有配置。重启前检查运行任务；不要直接覆盖data目录。当前主服务PID记录于round5/local-restart.json，实际PID可能随后改变。

自动化复跑（默认使用隔离数据，不调用模型）：

```sh
NODE22=/Users/liupengbin/.nvm/versions/node/v22.17.1/bin/node
QA_LABEL=recheck QA_PORT=8798 "$NODE22" tools/qa/quality-cycle.mjs
QA_LABEL=recheck QA_PORT=8799 "$NODE22" tools/qa/quality-features.mjs
QA_LABEL=recheck QA_PORT=8799 "$NODE22" tools/qa/quality-polish.mjs
QA_LABEL=recheck QA_PORT=8799 "$NODE22" tools/qa/quality-release.mjs
```

Playwright来自现有本地运行时，无新增项目依赖；不同电脑可用QA_NODE_MODULES和QA_CHROME指定模块目录及浏览器。升级专项默认使用记录的Git基线提交，QA_BASELINE_REF可覆盖；该提交必须包含原v14 public树。其他专项脚本位于tools/qa/quality-*.mjs。真实引擎测试需显式 `QA_LIVE=1`，会用现有账户创建并归档QA会话，不能把它当作无外部调用的普通单测。

每轮源码快照在data/quality-backups/source-before-round1.tgz及source-after-round1至5.tgz。回退应先停服务，在独立目录展开需要的源码后按差异恢复；不覆盖config.json、data或用户工作区。JSON会话备份本身不包含工作区附件，完整迁移另需备份工作区。源码快照没有凭据或用户对话。

文档和测试源码可提交；reports/与data/为本地证据/运行文件，Git忽略。小型评分、后端和最终验收摘要已复制到docs/product/quality-2026-10-22/evidence/以便审阅。未自动提交Git、创建PR、部署外网或更换用户凭据。

## 7. 未完成验证与技术债

这些是已明确保留的后续工作，不被30项已验收需求覆盖，也没有被标记为测试通过。

|跟踪项|状态|为何仍需处理/下一步|
|---|---|---|
|V-01 真实iOS Safari、Android Chrome、系统软键盘与输入法|阻塞/未测|本环境仅本机Chrome/IAB及模拟视口；安排真机核心输入/滚动/弹层任务|
|V-02 VoiceOver及其他读屏、完整浅深对比度审计|未测|局部键盘/对比度通过不等于WCAG合规；安排全路径审计|
|V-03 真实工具执行/授权/选择题、Codex停止续接|未测|本次引擎测试有意限于只读基本消息及DSR停止续接；需独立受控测试矩阵|
|V-04 引擎断线、服务重启中断、长时流式内存|未测|启动健康不是运行中恢复；需故障注入及10分钟以上资源采样|
|V-05 慢网/低端设备/真实Core Web Vitals|未测|本地导航计时不可外推；增加网络与设备实验、上线后现场采样|
|V-06 文件完整矩阵|部分已测|上传/list/raw/text与图片竞态通过；PDF、拖拽/粘贴、上传取消/重试、25MB/5文件浏览器全集仍需补测|
|V-07 安全/多用户/公网部署|未完整审计|现有同源/认证/路径边界已测；完整Markdown/XSS、代理HTTPS、多租户隔离尚无发布级证明|
|V-08 真人首次/长期使用研究|待真人测试|当前皆模拟角色，邀请真实新手和高频用户测理解、任务效率和长时阅读|
|V-09 其余交互覆盖|部分未测|通知实际投递、斜杠命令全集、所有浏览器历史组合、实际用户全量恢复演练见覆盖矩阵|
|D-01 前端维护债|延期|app.js大IIFE和7层历史CSS；未来按功能拆分并保持现有回归，不为本轮重构冒险|
|D-02 存储扩展性|保留现状|单进程JSON/300会话上限适配当前本地用法；增长需单独持久化方案与迁移|
|D-03 部署差异|有运行说明|本机需指定当前Codex二进制；跨机器安装/服务管理需再验证，不假定所有安装布局一致|

## 8. 发布评估

|维度|评估|
|---|---|
|功能完整性|已验收核心范围可用；全18功能族的未测子功能明确保留|
|核心流程可靠性|导航、草稿、组织、搜索、只读DSR与Codex基本生成有真实证据；真实工具审批/中断恢复尚不完整|
|视觉一致性|关键模型面板、字体、触控、表格和浅深主题已打磨；全站对比度/真机需补|
|操作效率|全库quick、跨窗口find、草稿保护与误删撤销减少无法完成或重复劳动|
|性能|本地响应可接受，DOM有界与缓存I/O有证据；不可承诺真实网络/低端设备指标|
|安全和无障碍|已验证基础保护与键盘流程；不宣称完成完整安全或WCAG认证|
|发布阻断|当前批准范围没有未修复P0/P1；若发布目标为公网/商业/多用户，V-01至V-07中的相关验收必须先补齐|

**建议：有条件发布。** 保持当前单用户本地访问范围，可继续使用并收集实际反馈；正式对外发布前完成对应验证。五轮交付以真实代码和可追溯证据为准，没有用主观满分替代工程事实。
