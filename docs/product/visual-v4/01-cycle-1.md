# Cycle 1 · 栅格与页面骨架

**范围**：V1–V10  
**目标**：先把“所有东西到底应该对齐到哪”定下来，再修组件。

## PM 需求摘要

- 移动端统一 14px 页面边距；桌面 20px 内边距 + 760px 阅读列。
- 顶栏用 `44px / minmax(0,1fr) / auto`，标题不得与操作区重叠。
- 输入区 helper text 移出胶囊，避免“胶囊里套说明文字”。
- 新对话回到 `scrollTop=0`；侧栏 search/tools/footer 统一到 12px 轨道。

## 研发实现

- 新增 `public/css/visual.css`，作为最后加载的对齐覆盖层。
- 调整 `index.html`：`.composer-foot` 移出 `.composer-inner`。
- 1024 断点显式使用 20px 内边距，与 thread 内容列一致。
- 移动/平板/桌面三套标题定位；移动端隐藏 `#codexOpenBtn`。
- `showEmptyChat()` 重置 `scrollTop`。

## QA 结果

| 检查 | 结果 |
| --- | --- |
| 320/390/768/1024/1440 无横向溢出 | PASS |
| 390 标题 cx=195，操作区 x=286 | PASS |
| 320 标题 cx=160，长标题截断，无重叠 | PASS |
| 768 标题 cx=384 | PASS |
| 1024 thread/composer 均 x=310 w=694 | PASS |
| 1440 composer w=760，与 thread 内容同轨 | PASS |
| 新对话 empty y=52 | PASS |
| 侧栏 search/tools/foot x=11.6 w=265 | PASS |

## PM 验收

**PASS**。首轮解决的是“基准线”，后面所有组件修正都以此为准。320px 的标题宽度收窄为 100px，优先保证不遮挡操作；长标题由省略号表达。
