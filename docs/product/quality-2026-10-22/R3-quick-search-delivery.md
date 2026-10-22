# R3-001 快速切换全文搜索交付

## 最新版基线

R2已验收快照 `round2/sandbox.json` 对应代码复制到新临时服务，导入75个合成会话。真实浏览器在Cmd+P查找早期正文和第75会话，两项均返回“没有匹配的对话”。原始结果：`reports/quality/r3-quick-before/results.json`；截图`body-search.png`。没有读取或改写用户会话。

## 实现

仅修改 `public/js/app.js` 的 quick switcher 函数/监听区，以及 `public/index.html` 对应 quickInput/状态区域。

- 每次打开或输入改词使用既有`/api/conversations?q=...&limit=12`全文API。
- 输入200ms去抖；每次输入先作废之前版本，AbortController取消旧请求；关闭同样作废，响应只提交当前版本。
- 加载、无结果、请求失败分开显示；失败有“重试搜索”且焦点回输入，不混淆为无匹配。
- 结果展示服务端正文snippet；选择结果最多12条，超过时显示缩小范围指引。
- combobox与listbox关联，aria-expanded随打开关闭更新，aria-activedescendant指向稳定会话ID；方向键只更新选择，不重建DOM；IME合成期间不抢Enter。
- 没有添加关闭按钮（遵循R5统一整理的分工），没有修改其他模块。

## 测试与验收建议

`tools/qa/quality-quick-search.mjs` 真实Chrome + 隔离真实HTTP数据，14项全部通过：历史正文、75th会话、combobox、Enter打开、重新聚焦保留会话、加载态、迟响应竞态、关闭作废、503失败/重试、空结果清除aria、方向键/12条上限、快速打字只发一次查询、无未捕获异常。

延迟响应与503是明确注入的运输层故障，搜索结果来自真实服务端；未调用AI模型。实际观测：4次相隔40ms的输入只产生最后一个`Record`查询。第75会话从失败变为“Cmd+P → 输入 → Enter”3步可达。

执行命令：`/Users/liupengbin/.nvm/versions/node/v22.17.1/bin/node tools/qa/quality-quick-search.mjs`。结果：`reports/quality/r3-quick-after/results.json`；截图：`body-search.png`、`error-retry.png`。Node22语法检查通过。

首次测试的重试断言错误地要求snippet仍含Markdown下划线，服务端实际将其清理成可读空格；改为断言真实命中标题和正文上下文后重跑14项全通过，没有为该测试改产品代码。

独立QA负责最终验收；VoiceOver真人读出体验仍未验证。
