# Apple重设计：功能保留覆盖

下表仅描述已经真实执行的范围，状态随最终证据归并。主要浏览器/API测试使用独立源码、配置、存储和合成数据。主agent另在本机主服务的专用QA会话完成真实DSR及Codex只读基本回复，二者不能互相替代。没有调用工具执行、通知授权或接触用户真实会话。

## 18个功能族

| 功能族 | 已执行范围及证据（`reports/quality/apple-final/`） | 仍未验证或产品限制 |
| --- | --- | --- |
| 1 登录与访问保护 | `results.json`：登录、退出入口、未认证拒绝、跨源写拒绝 | 生产HTTPS/反向代理、多账号隔离、长时速率限制 |
| 2 首页与场景 | `features.json`、`polish.json`：五场景、占位符拦截、保留原稿、即时刷新不丢失 | 首次真人理解；模板中的外部业务任务不等于已经执行 |
| 3 会话导航 | `results.json`、`advanced.json`：深链刷新、全文搜索、超60会话quick、乱序/404恢复；`file-flows.json`：真实浏览器前进/后退及双草稿 | Safari/Firefox历史矩阵未覆盖 |
| 4 会话组织 | `features.json`：置顶、取消、统计、归档恢复；`batch.json`：部分/全部失败、重复点击、撤销失败；`results.json`：复制/删除撤销 | 活动模型任务中全部组织操作组合未遍历 |
| 5 输入与草稿 | `features.json`、`polish.json`：24k Unicode边界、空格、换行、编辑取消、缓存启动、A/B独立草稿 | 真实输入法组合、移动软键盘、编辑后真实生成未全测 |
| 6 模型与引擎配置 | `exploration.json`、`polish.json`、`radio.json`：模型设置、模态隔离、正反Tab、回焦、resize和引擎禁用跳过 | 跨tab模型归属沿用R3专项；真实工具执行配置效果待验 |
| 7 生成与恢复 | `native.json`：主agent真实DSR生成/主动停止/同session续接/刷新及Codex基本回复6/6；`results.json`：503失败重试 | Codex停止/续接、服务重启恢复、长时内存、真实工具审批 |
| 8 权限与审批 | `features.json`：只读权限真实保存及刷新；主API保护 | 单次允许/拒绝/完全允许、动态问题/跳过未触发外部执行 |
| 9 内容阅读 | `design.json`：双主题、两类表格；`features.json`：真实代码/消息复制及Markdown下载；`recovery.json`：KaTeX首请求失败重试 | 全Markdown/XSS审计、全部文字对比度认证未完成 |
| 10 历史查找 | `find.json`：跨窗口查找、旧消息hash、循环跳转、空结果、取消防抖；`advanced.json`：历史结果focus不丢会话 | 1000消息有历史独立证据，未因视觉改动重复无关压测 |
| 11 文件操作 | `file-flows.json`：真实PNG上传/下载字节、5个数量限制、25MiB和+1字节UI/API边界、DataTransfer拖入、真实剪贴板图像粘贴、删除取消/确认、路径插入及目录越界拒绝 | OS文件管理器拖入、上传取消/失败续传、完整格式矩阵未测 |
| 12 文件预览 | `file-flows.json`：PNG真实解码、PDF真实Chrome原生阅读器、文本、二进制安全下载回退、HTML不执行；`advanced.json`：慢请求及关闭竞态 | PDF在iOS/Android/Safari的原生阅读器待真机验收；同源PDF策略专项另见`apple-file-policy-after/results.json` |
| 13 效率工具 | `results.json`：重复CmdK/P无锁泄漏；`file-flows.json`：斜杠files/shortcuts/permission/scenario、方向键/Esc；`advanced.json`：全文quick及提示词键盘撤销 | 所有快捷键逐项及OS冲突矩阵未测；通知命令未触发 |
| 14 资料管理 | `exploration.json`、`advanced.json`、`find.json`：收藏回跳、提示词验证/持久化/追加/删除撤销 | 真人长期使用、模型结构化总结未测 |
| 15 设置 | `features.json`、`radio.json`：主题/密度/字号保存及非法值回退、方向键/Home/End、单一Tab点 | 系统通知授权及后台交付未请求 |
| 16 备份与导出 | `results.json`：合成JSON备份API；`features.json`：Markdown下载真实内容；历史后端专项覆盖导入原子性 | 用户真实数据恢复演练未执行；JSON备份不含工作区文件 |
| 17 离线与版本升级 | `release.json`8/8：完整v15旧HTML/app54/codex2/bundle48/CSS2→旧页面更新按钮→v17/app56/codex3/bundle50/CSS3；旧cache清除、API不缓存、离线shell与在线恢复 | 首次离线安装、全部浏览器PWA生命周期未测 |
| 18 响应式与无障碍 | `design.json`46/46、`polish.json`、`modal.json`：四宽双主题、模型触控/几何/局部对比、焦点、减少动态与模态叠层；`apple-sheets.json`28/28：七类面板在320/390×568两主题实际可达并能关闭；`apple-visual.json`：真实Chrome截图/计算样式 | 非iOS/Android真机、非VoiceOver、非完整WCAG认证、非真人可用性研究 |

## 证据规则

固定71项评分的分母保持不变。新增文件/短屏保护检查独立统计；美观变化用同视角截图和可重复的字号、尺寸、溢出测量说明，不凭主观感受加分。未验证的工具审批、真机和真人反馈继续保留限制。

新夹具首轮错误保留：`file-flows-first-attempt.json`记录HTML预期过窄和测试PNG无法写入剪贴板；后续改为产品真实支持的安全下载回退、浏览器canvas产生有效PNG再真实粘贴。PDF首轮失败是真产品缺陷：iframe返回200但被响应头拒绝，修后原生PDF viewer通过。`apple-sheets-first-attempt.json`记录错误关闭选择器及归档fixture字段；更正脚本后重新运行，不将脚本错误算作产品修复。截图首轮端口冲突单独保留为`apple-visual-port-conflict.json`，harness已增加端口占用拒绝，防止连接到其他QA服务。

最终完整结论由`qa-report.md`汇总，本文件不将仍在进行的专项预先标为通过。
