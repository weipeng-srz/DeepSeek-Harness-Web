# DSH Chat 第 4 轮测试报告

> 版本：v3.3 · 时间：2026-10-22 01:55–02:05
> 重点：CSS bundle、KaTeX 懒加载、长对话窗口化、Service Worker、键盘导航、320px、高对比度

## 1. 结论

**通过。** 54 项自动化全绿；离线 shell 可打开；无公式时 0 个 KaTeX 请求；320px 无横向滚动、可点目标达标。

| 套件 | 结果 |
| --- | --- |
| `tools/qa/e2e.mjs` | 29/29 |
| `tools/qa/e2e2.mjs` | 17/17 |
| `tools/qa/e2e3.mjs` | 8/8 |
| `tools/qa/api.mjs` | 23/23 |
| `tools/qa/offline.mjs` | 5/5 |
| `tools/qa/a11y.mjs` | 0 对比度失败；焦点陷阱通过 |
| `tools/qa/perf.mjs` | DCL 31ms、FCP 88ms（SW 缓存） |
| `tools/qa/_sw.mjs` | 离线导航成功，shell + 会话列表可见 |
| `tools/qa/_math.mjs` | 初始 0 个 KaTeX 资源 → 公式消息后 1 个 `.katex` |
| `tools/qa/_narrow.mjs` | 320px：scrollWidth 320、仅装饰层溢出、可点目标 ≥44 |

## 2. 性能对比

| 指标 | 第 3 轮 | 第 4 轮 | 变化 |
| --- | --- | --- | --- |
| 首屏 CSS 请求 | 6 | **1** | -5 |
| 无公式时 KaTeX 传输 | ~78KB | **0** | -78KB |
| CSS gzip | ~27KB | **29KB**（合并后） | 基本持平 |
| app.js gzip | 49.2KB | **54.8KB** | +5.6KB |
| DCL | 61ms | **31ms** | -49% |
| FCP | 88ms | **88ms** | 持平 |
| 长对话首屏节点 | 全部 | **最近 60 条** | 可控 |

## 3. 验证记录

| 场景 | 期望 | 实际 |
| --- | --- | --- |
| 无公式会话 | 不加载 KaTeX | ✅ 0 个资源 |
| 公式会话 | 按需加载并渲染 | ✅ 1 个 `.katex`、字体 2 个 |
| 长对话 | 只渲染 60 条，可加载更早 | ✅ 按钮 + 保持滚动 |
| 断网刷新 | 离线 shell 可开 | ✅ shell + 8 条会话 |
| 更新提示 | 新 worker 就绪 Toast | ✅ 代码路径 |
| Alt+↓ | 聚焦并高亮消息 | ✅ ARTICLE.msg-flash |
| 320px | 无横向滚动、≥44px | ✅ 权限胶囊已修 |
| 高对比度 | 文字/边框增强 | ✅ CSS 媒体查询 |
| 打印 | 隐藏导航/操作 | ✅ 样式表 |

## 4. 修复的缺陷

| # | 级别 | 问题 | 修复 |
| --- | --- | --- | --- |
| 1 | S2 | SW 预缓存写死 `app.js?v=42`，版本升级后缓存永不命中 | 只预缓存 shell，静态资源运行时缓存 |
| 2 | S2 | 320px 权限胶囊隐藏文字后仅 34px 宽 | 固定 44px |
| 3 | S2 | KaTeX 懒加载后 `addText` 重绘可能递归 | `mathLoading` 标志防重入 |
| 4 | S3 | CSS bundle 的 immutable 缓存与内容不同步 | 每次改样式 bump `?v=` |
| 5 | S3 | 工具头 43px、思考按钮 28px | 触屏下 44px |

## 5. 已知问题

1. `app.js` 仍为单文件 230KB（gzip 55KB），未拆模块。
2. 长对话窗口化后，`⌘F` 只查找已渲染的 60 条；更早内容需先加载。
3. 打印样式未在 Safari 实机验证。
4. Service Worker 首次安装需要一次刷新才控制页面；更新提示依赖 controller。
5. 200% 缩放以 320px 等价验证，未跑真实浏览器缩放。
6. 屏幕阅读器全流程（VoiceOver）未脚本化。

## 6. 证据

`/tmp/dsh-e2e*.json`、`/tmp/dsh-a11y.json`、`/tmp/b.css`、`/tmp/a.js`、`public/sw.js`
