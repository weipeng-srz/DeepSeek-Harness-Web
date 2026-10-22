# R4 前端并发与恢复交付

## 基线确认

使用R3已验收快照的新隔离服务，真实Chrome复测确认：预览B被迟到A追加；关闭预览后仍插入A；本地KaTeX首请求失败后下次仍只有1次请求、0个公式；Alpha分页迟到后Beta混入10条Alpha且计数70。证据在 `reports/quality/r4-frontend-before/advanced.json` 与 `recovery.json`。合成数据、显式注入延迟/资源失败，无用户数据或模型调用。

## 实现

- **R4-002**：预览每次打开/关闭增加版本并取消旧读取；捕获本次URL；文本响应、图片load/error、延后焦点都核对归属；旧finally不会清理新controller。关闭保留正常焦点恢复及锁行为。
- **R4-003**：公式CSS与脚本分支settle后确定成功；失败promise可重试，失败标签删除；成功CSS复用；已加载katex或auto不重复请求；只有全部资源就绪才渲染公式，否则保持可读原文。保持R3 sealed静态消息同步paint逻辑。
- **R4-004**：列表、搜索、分页独立版本；查询变化、清空、Escape、清除按钮、刷新均作废旧分页；请求对象防止旧finally释放新busy；搜索首屏期间不能使用旧结果offset加载下一页；同查询正常追加去重。

产品修改位于 `public/js/app.js` 的Math、预览、列表/搜索/分页区域；Math调用处增加资源就绪条件是实现失败恢复所必需的最小关联改动，已由主代理确认。

## 测试结果

- 更新后 `quality-advanced.mjs` **7/7通过**（包括预览、R3搜索/提示词回归和主代理radio实现）。
- 更新后 `quality-recovery.mjs` **2/2通过**：KaTeX脚本2次请求、1公式；迟到Alpha不污染Beta，计数1。
- `quality-r4-edges.mjs` **8/8通过**：CSS失败恢复（CSS2次、主JS1次、auto1次、仅1 link）；auto失败恢复（CSS1、主JS1、auto2）；两公式并发仅一套资源；A-B-A新首页60条；旧same-query响应/finally不改变新busy；当前分页结束70条且70个唯一ID。

A-B-A测试特意在浏览器故障注入中忽略Abort signal，使旧响应仍抵达，证明版本控制能够独立于网络取消生效。旧响应到达时仍60条且busy=true，最新请求完成后70条、不重复。产品代码中没有关闭取消能力。

首次额外CSS失败测试发现调用方仅检查JS全局而跳过资源就绪，已修复并重新运行8项及2项恢复测试全部通过。原文恢复、加载资源数、结果数均来自真实DOM/HTTP计数。Node22语法检查通过。

最终证据：`reports/quality/r4-frontend-after/advanced.json`、`recovery.json`、`edges.json`及截图。脚本：`tools/qa/quality-r4-edges.mjs`。最终独立产品验收由QA执行；长时间流式内存、实际网络与真机仍未验证。

## 最终验收补测：图片 load/error 归属

2026-10-22 在最终 R5 冻结源码（app.js SHA-256 `0f67db02f5b43d873c77a648a646a101e991935bafb49df161dda472bdc86af5`）新起隔离服务，通过真实 Chrome 补测 **4/4 通过**，没有产品代码改动。

- A 图片延迟正常加载，关闭后才返回：自然 `load` 事件发生于已脱离 DOM 的原图片，预览保持关闭且内容节点为 0。
- A 图片延迟正常加载，关闭并改开 B：A 的自然 `load` 发生时 B 仍保持自己的 loading，标题、图片和下载文件名/URL 都是 B；随后放行 B，正常加载且没有残留 loading/error。
- A 图片延迟返回 HTTP 500，关闭后自然 `error`：保持关闭、内容节点为 0，没有迟到错误内容。
- A 图片延迟返回 HTTP 500，关闭并改开 B：自然 `error` 不改变 B 的 loading；下载 URL 的 path 为 B 且 `download=1`，download 文件名为 B；放行后 B 正常显示。

测试使用两张实际上传的合成 1×1 PNG，通过延迟 HTTP 响应与显式 500 故障控制事件先后；不合成 DOM 事件、不替换产品回调。自然事件记录包括 `connected:false`，证明迟到事件实际发生。证据：`reports/quality/r5-image-preview/results.json` 与四张截图；脚本：`tools/qa/quality-image-preview-race.mjs`。此补测不代表已验证 PDF、拖放、图片格式全集或真机。
