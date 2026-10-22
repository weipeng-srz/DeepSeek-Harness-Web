# R5 场景模板与草稿恢复交付证据

## 需求与代码

R5-003：`public/js/app.js` 的 `useScenario` 现在保留已有草稿的完整文本（含尾部空白），双换行追加模板；只有空白的草稿直接替换为模板。复用 `updateComposerMeta` 更新计数和发送状态，复用 `saveDraftNow` 立即持久化，不等待输入事件。选中模板中第一个占位符时，加上原稿与分隔符的 UTF-16 偏移；没有占位符时将光标放到合并文本末尾。没有自动发送、确认步骤或数据迁移。

R5-004：本专项追加发现已有会话缓存恢复会丢草稿。失败链为 `applyCachedShell` 设置当前会话但留下空输入 → `openConversation` 的 `saveDraftNow` 删除当前会话草稿 → `restoreDraft` 读取空值。主 agent 在 `applyCachedShell` 当前 ID 恢复后先恢复对应草稿，并修复 `restoreDraft` 末尾手动设置发送状态时忽略 24,000 字限制的问题。本 agent 未修改这些区段。

## 真实验证方法

运行 `tools/qa/quality-scenario-draft.mjs`，用本机 Chrome + Playwright，复制源码到独立临时目录和数据库；1440×1000 桌面与 390×844 触控模拟手机各执行 10 项，另有 2 项提取实际 `useScenario` 函数的边界单测。所有数据都是合成草稿、合成会话，没有访问用户会话或调用模型。浏览器测试拦截 `/api/chat` 作为兜底，同时断言占位符提交没有产生模型请求。

当前内建场景全部含占位符，因此“无占位符模板”明确采用提取生产函数、注入合成 SCENARIOS 的边界测试；不冒充现有可点选场景。手机结果来自 Chrome 模拟，不代表 iOS Safari 真机或系统软键盘测试。

每个设备覆盖：

1. 空稿填入、输入框焦点、首个占位符、即时存储。
2. 原稿含 emoji、相同旧占位符和尾部空格时，精确保留，并选中新模板占位符。
3. 立即刷新恢复合并草稿。
4. 未替换占位符阻止发送，无模型请求。
5. 纯空白原稿不留下多余空行，立即存储。
6. 追加后超过上限，字符计数更新且发送禁用。
7. 当前会话单独草稿立即存储、刷新后恢复；等待真实会话 GET 返回后再断言。
8. 新对话超限草稿刷新后仍禁用发送。
9. 已有会话超限草稿离开、清空新稿、重新打开后仍禁用发送。
10. 缓存会话 A 后深链 B、再深链 A，两份不同草稿都精确保留。

## 对照结果与验收

| 检查阶段 | 结果 | 证据 |
|---|---:|---|
| 冻结 R4，最初 16 项 | 2 通过 / 14 失败 | `reports/quality/r5-scenario-before/results.json` |
| 仅 R5-003 已实现，缓存恢复问题复现 | 14 通过 / 2 失败 | `reports/quality/r5-scenario-currentdraft-bug/results.json` |
| R5-004 修前快照，完整 22 项 | 16 通过 / 6 失败 | `reports/quality/r5-draft-hydration-before/results.json` |
| R5-003/004 修复后完整 22 项 | **22 通过 / 0 失败 / 0 阻塞** | `reports/quality/r5-scenario-after/results.json` |

初始版本覆盖原稿：26 个 UTF-16 单元的原稿被 78 单元模板替换；修复后长度 106，选区为 `[41,49]`，包含原稿 emoji 的双单元偏移。立即刷新仍恢复精确的 106 单元文本。追加 23,990 个字符后得到 24,070，计数显示 `24,070 / 24,000` 且按钮禁用。

R5-004 修前：已有会话 91 单元的正确存储在刷新后被删为 `null`；修后精确恢复 91。已有会话 24,001 个 emoji 草稿离开重开后，修前发送按钮错误启用，修后保持禁用。新稿超限刷新在修前也通过，不将其计作新修复。

截图位于 `reports/quality/r5-scenario-after/desktop-scenario-reload.png` 和 `phone-scenario-reload.png`；对应修前截图保存在 `r5-scenario-before/`。每份 JSON 记录实际测试临时快照及源码 SHA-256，可核对与后续独立 QA 快照。

开发专项结论：R5-003、R5-004 验收条件在上述环境内通过；最终独立 QA 和整轮 PM 验收仍由主流程汇总。未替代真实用户研究。

## 复跑

```sh
QA_LABEL=r5-scenario-recheck QA_PORT=8796 /Users/liupengbin/.nvm/versions/node/v22.17.1/bin/node tools/qa/quality-scenario-draft.mjs
```

可用 `QA_SOURCE_ROOT` 指向已记录的冻结源目录进行旧版对照。脚本生成独立服务，结束时关闭测试浏览器和临时服务，不改运行中的主站。
