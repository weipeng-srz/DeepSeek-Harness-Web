# A-10 · PDF 预览被响应头阻止

优先级：P1。来源：独立 QA 扩展文件流程，非视觉推断。

## 问题与验收标准

文件抽屉打开有效 PDF 时，接口返回200/application/pdf，但浏览器框架成为 `chrome-error://chromewebdata/`，用户看到拒绝连接。根因为 `serveConversationFile` 调用全局 `securityHeaders` 留下 `X-Frame-Options: DENY`，并为所有文件设置 `default-src 'none'; sandbox`，阻止原生PDF阅读器嵌入。修前证据：`reports/quality/apple-before/file-flows.json` 和 `files-pdf-preview.png`。

验收要求：本站文件预览能显示真实PDF页面；跨来源页面不能嵌入该受保护文件；HTML/SVG等非PDF文件保持既有沙箱与下载隔离；显式下载保留内容；不更改全局主页面的禁止嵌入规则。

## 实现与范围

产品代码仅修改 `server/index.mjs` 的 `serveConversationFile` 响应头。仅当内容类型是 `application/pdf` 且 disposition 为 `inline` 时，设置 `X-Frame-Options: SAMEORIGIN` 和 `Content-Security-Policy: default-src 'none'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'`。

原生PDF阅读器使用浏览器的PDF处理路径，因此这个狭窄分支不再使用阻止阅读器的响应沙箱。下载参数、其它文件以及主页面没有此例外。HTML/SVG仍返回 application/octet-stream、attachment、nosniff、DENY和 `default-src 'none'; sandbox`。没有新增HTML/SVG预览能力、数据迁移或前端改动。回退可恢复此文件响应头分支；回退后会重新出现PDF预览不可用。

## 真实测试与结论

开发专项 `tools/qa/quality-file-preview-policy.mjs` 在隔离源码和合成文件中，用真实Chrome与真实HTTP执行 **6/6通过**：

1. 本源有效PDF返回200及上述限制头，出现Chrome内置PDF viewer frame；截图实际显示“QA PDF Policy”页面内容，没有chrome-error frame。
2. PDF显式下载保持attachment、DENY、sandbox，下载字节与上传PDF相同。
3. 带脚本的HTML维持下载回退，响应为octet-stream/attachment/DENY/sandbox/nosniff；下载字节相同，页面执行标记为false，执行探针请求为0。
4. 带脚本的SVG执行同样检查，全部通过。
5. 另起不同端口的来源（真实不同origin）嵌入同一已认证PDF：文件HTTP仍为200，但浏览器阻止，记录 `frame-ancestors 'self'` 拒绝信息与chrome-error frame，没有PDF viewer。
6. 主应用文档保持DENY及 `frame-ancestors 'none'`。

初版专项错误使用文件路由未支持的HEAD请求读取头，出现测试夹具失败；已改为真实GET后完整重跑，以上结论均来自最后一次执行。此过程没有额外产品改动。

专项证据：`reports/quality/apple-file-policy-after/results.json`、`same-origin-pdf.png`、`cross-origin-blocked.png` 及下载对照文件。该证据记录完整源码哈希；server/index.mjs为 `8b6299458fa019d2ea612c1301a72e9a1ef8016e6b2c190aa375b0d70b5b5b27`。

独立QA随后执行 `quality-file-flows.mjs`，**18/18通过**，包括真实PDF viewer、PNG、HTML回退、上传边界和其它文件/导航回归；结果为 `reports/quality/apple-final/file-flows.json`。实现和专项语法检查通过。

结论：A-10在本机Chrome隔离环境内验收通过。未将该检查视作PDF格式全集、恶意PDF解析器安全审计、Safari真机或下载后外部应用执行的保证。
