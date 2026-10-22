# 刷新后执行状态修复 — 2026-10-22

## 问题与实现

历史工具卡片的 `data-status` 已读取保存的状态，但徽标文字在 `addTool` 中固定为“运行中”。只有实时 `tool_result` 会更新文字，因此任务完成后刷新页面就复现。

- `public/js/app.js`：历史加载与实时更新统一使用 `renderToolStatus`。`completed` 显示完成，DSR 的 `error` 与 Codex 的 `failed` 均显示失败。
- 终态消息中尚未收到结果的工具，按消息状态显示已停止、已中断或结果未确认；不把缺失结果当成成功，也不保留运行中的占位文字。
- 历史记录没有工具耗时，刷新时不生成虚假的耗时。
- 同次真实断线测试发现浏览器的 `network error` 未被网络异常分类覆盖；补齐空格匹配，让既有重连流程继续接收最终状态。没有重构任务执行协议。
- `public/index.html` 的 App 版本从 57 更新至 59；`public/sw.js` 从 `dsh-v18` 更新至 `dsh-v20`，保证已安装客户端更新缓存。

CSS 与 Codex 文件保持本次修改前的内容，后端、任务记录和用户文件无需迁移。本地服务继续运行于 `http://127.0.0.1:8787/`，没有为此重启正在运行的服务。

## 验收证据

最终产品 App SHA256：`2f4e4e64476eb08f2bc77bcc44a0d7694e7547bb0c3d11b68f8f651ad23d5faf`。

| 验证 | 结果 | 证据 |
| --- | --- | --- |
| 状态专项与断线重连 | 12/12 通过 | `reports/quality/run-refresh-final/run-refresh.json` |
| 常用功能回归 | 15/15 通过 | `reports/quality/run-status-regression-final/features.json` |
| 已安装客户端缓存升级、离线与恢复 | 8/8 通过 | `reports/quality/run-status-cache-final/release.json` |
| 用户当前应用中的既有会话 | 9 条工具卡片由错误的运行中恢复为完成，重复刷新保持 | `reports/quality/run-status-live/verification.json`、`fixed-status.png` |
| 代码语法、差异空白与样式保护 | 通过 | Node 22 `--check`、`git diff --check`、修改前后 CSS 目录逐文件比较 |

状态专项覆盖历史完成、DSR 失败、Codex 失败、停止、中断；实时结果后刷新；运行时刷新后继续接收结果；缺失结果；真实 HTTP socket 中断后重连；无未捕获浏览器异常。初始基线 `run-refresh-baseline` 中 10 项状态断言失败、无浏览器异常检查通过，断线重连诊断也失败；最终源全部通过。断线项在最终报告中可能仍保留于 `diagnostics` 字段，其执行结果为通过，计入上述 12 项。

测试使用隔离的真实 Node 服务、Chrome 和实际刷新操作。动态模型事件通过本地 HTTP 代理合成，连接销毁是真实网络传输中断；没有声称重新执行了外部模型或实际工具。另用应用内浏览器只读检查用户已有的真实工具记录，未重新运行这些任务。

回归覆盖置顶、统计、导出、复制、链接、取消编辑、权限保存、归档恢复、输入边界、场景模板、草稿持久化和阅读偏好。缓存测试实际安装旧版完整前端后使用更新按钮升级，验证旧缓存删除、旧脚本不执行、API 不进入缓存。

## 重跑

使用 Node 22，并保证端口空闲；测试自动建立隔离目录。

```sh
QA_LABEL=run-refresh-check QA_PORT=8812 QA_PROXY_PORT=8813 node tools/qa/quality-run-refresh.mjs
QA_LABEL=run-status-regression-check QA_PORT=8814 node tools/qa/quality-features.mjs
QA_LABEL=run-status-cache-check QA_PORT=8814 QA_BASELINE_PUBLIC="$PWD/data/quality-backups/run-status-before/public" node tools/qa/quality-release.mjs
```

原始前端备份位于 `data/quality-backups/run-status-before/public`。测试脚本为 `tools/qa/quality-run-refresh.mjs`；缓存测试按资源内容判断是否必须更新 URL，允许复用内容完全相同的 CSS/Codex 资源。

结论：本次刷新状态问题验收通过。未进行全产品或所有浏览器的重新认证。
