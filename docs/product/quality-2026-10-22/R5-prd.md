# R5 PRD：完整退出体验与可交付更新

## 目标和评审
批准4项：P1 3/P2 1（P0/P3 0）。前四轮已解决发现的大部分独立问题，本轮不为了50虚构。重点关闭残余键盘回焦失败、让已安装客户端真正得到改进，并执行最终完整回归。R4验收后实施。

## 需求
### R5-001 · P2 · 模型面板无可见关闭且Escape后焦点落body；快速切换只有Esc文字缺少触控关闭
- 来源与用户场景：Apple工程/UX/移动及键盘用户。
- 表现/复现：打开模型设置→Escape→activeElement是body；手机无键盘时只能猜测点外部；quick顶部Esc不是按钮。证据：round1/2/3 exploration模型回焦失败；r2-after模型截图及当前index quick结构。
- 实现与验收：两个面板都有明确有名关闭按钮，触控44px；Codex modal Tab/ShiftTab圈内、Escape只关顶层并回有效触发器，背景隔离与app其它modal一致；重复打开/关闭不遗留inert；viewport变化布局不保留旧sheet样式；减少动态效果生效。
- 文件：public/js/codex.js, public/css/codex.css, public/js/app.js, public/index.html；风险：不能将关闭旧modal误解为停止生成；外部点击不执行被遮挡操作；与既有锁状态协调。
- 价值：触控和键盘用户能退出弹层并继续任务。

### R5-002 · P1 · 已修改资源仍沿用原immutable URL和SW版本，已有用户可能继续执行旧代码
- 来源与用户场景：工程/已有用户。
- 表现/复现：index仍bundle?v47/app?v53/codex?v1，codex动态CSS?v1，sw版本dsh-v14；服务器对版本资源返回一年immutable。证据：当前public/index.html、codex.js ensureStyles、sw.js及server静态Cache-Control。
- 实现与验收：发布涉及的JS/CSS URL统一递增，SW版本递增；真实浏览器从旧SW安装更新，点击更新后使用新URL并清理旧缓存；离线shell可重开且不缓存API；主服务最新版重启后真实健康与核心AI验收，明确外部未覆盖范围。
- 文件：public/index.html, public/js/codex.js, public/sw.js；风险：更新不可自动中断正在生成；沿用现有用户点击更新流程；无数据迁移或凭据更换。
- 价值：已安装用户获得经过验收的新行为，触控/键盘用户能退出并继续任务。

### R5-003 · P1 · 场景模板覆盖草稿且刷新丢失
- 来源与场景：QA/新用户尝试模板/已有草稿的日常用户。
- 复现和证据：冻结R3 features实测：44字草稿→场景库首项→78字模板，原稿丢失；立即刷新恢复旧44字，模板又丢失。与提示词插入规则不一致。
- 需求与验收：非空草稿双换行追加模板，空稿直接填入；立即调用既有草稿持久化；选中追加模板的首个占位符（偏移包含原稿），无占位符光标末尾；仍阻止未替换占位符发送，不增加确认或自动发送。
- 价值：保护输入劳动，让模板成为辅助写作工具；刷新不会丢失刚加入的内容。
- 范围/风险：app.js useScenario，复用已有draft机制和输入校验；无数据迁移；手机焦点与原草稿分隔需要实测。
- QA：真实浏览器原稿保留、立即刷新、空稿填入、占位符选区/发送校验；回归提示词追加和会话切换草稿。

### R5-004 · P1 · 缓存启动未恢复当前会话草稿，认证后空值覆盖持久化
- 角色/场景：QA/日常与手机用户在已有对话中写作，刷新或断线后继续输入。
- 复现与证据：R5-003桌面与390px真实测试中，插入后localStorage有正确草稿，刷新并等待真实对话GET结束后input为空且存储被删。证据 reports/quality/r5-scenario-currentdraft-bug/results.json，14/16中两项失败。
- 根因：applyCachedShell先设currentId但未恢复其草稿；enterApp的openConversation先saveDraftNow，把空input写入当前会话键。
- 实现：缓存壳恢复当前ID后立即恢复该ID草稿；保留认证刷新与深链切换的save/restore顺序；恢复后的发送按钮继续执行24k长度校验。
- 验收：已有会话模板/普通草稿在立即刷新、缓存显示阶段及认证完成后均保留；缓存A访问B时两者草稿不串；新会话草稿不回归；超24k恢复后发送按钮保持禁用；仍不自动发送。
- 范围/风险：app.js applyCachedShell与restoreDraft；不改键、不迁移、无账户或存储策略改变。QA增加独立已有会话用例，不以首页成功替代。

## 设计与状态
Codex弹层：保存opener→显示role=dialog/aria-modal=true→广播overlay变化→背景inert→圈内Tab→关闭并广播→按关闭原因恢复焦点。与app主锁统一由可见层推导，禁止另用不平衡计数。
快速切换保留Esc键说明，改为有aria-label的44px关闭按钮，外部/键盘原路径保持。模型标题区加入可见X按钮，不增加多余确认。减少动态效果关闭过渡。
静态更新：新资源URL+新SW→等待用户点击更新→控制器升级/刷新；已有草稿由既有持久化保留。离线只呈现已缓存shell/对话；任何API都不由SW假装成功。

## QA、发布与交付
后端agent负责codex.js/css关闭体验，frontend负责场景模板，主agent负责app锁桥接/quick关闭和资源版本。QA全59固定+专项回归、四尺寸浅深图、SW升级/离线、最终普通用户任务。主agent检查无运行任务后重启本机服务，真实只读DSR/Codex基本消息；没有真实证据的工具审批/真机/读屏/现场性能不得算通过。
需关联五轮全部需求与测试、分数、截图、运行方法及已知限制。只做本地交付，不外网发布。真实引擎或账户不可用须明确阻塞；有任何未解决P0/P1不得建议无条件发布。
