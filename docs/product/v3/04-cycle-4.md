# 第 4 轮 · 恢复与移动端

**范围**：C11, D1–D8, E2（10 条）
**目标**：任何离开/断线/错误都能回来；移动端键盘与弹层可靠。

## PRD 摘要

- 附件随消息持久化；刷新后气泡仍显示。
- 会话加载骨架屏；搜索空状态不误导。
- Toast 支持动作；断网发送保留「待发送」，恢复后自动/手动重试。
- 标题/角标：后台生成显示 `●`，完成用 favicon 与 App Badge 提醒；可选系统通知。
- 连接条：最后同步秒数 +「重试」。
- 单条消息渲染失败只坏一条，给「重新加载」。
- 焦点陷阱覆盖所有弹层；背景 inert；关闭归还焦点。

## QA 结果

| ID | 用例 | 结果 | 证据 |
| --- | --- | --- | --- |
| C11 | 附件刷新后保留 | PASS | 用户气泡含 `note-test.txt / 16 B`；API messages 含 attachments |
| D1 | 骨架屏 | PASS | 切换瞬间 `.thread-skeleton` 出现，1s 后消失 |
| D2 | 搜索空状态 | PASS | “没有匹配的对话” + 清除搜索 |
| D3 | Toast 动作 | PASS | 撤销删除、导出结果、错误提示 |
| D4 | 断网待发送 | PASS | 离线发送出现「待发送」；恢复后重试成功 |
| D5 | 未读标题/favicon | PASS | `● 标题` + `favicon-active.svg` + App Badge |
| D6 | 完成通知 | PASS | 命令面板「完成通知」请求权限；后台完成弹通知 |
| D7 | 连接条重试 | PASS | 显示「2s 前同步」+ 重试按钮；在线后隐藏 |
| D8 | 错误边界 | PASS | `renderMessages` 单条 try/catch；错误卡可重载 |
| E2 | 焦点陷阱 | PASS | 末项 Tab 回到首项；Esc 关闭；焦点归还 |

## 验收

PM：PASS。iOS 键盘用 `visualViewport` 高度 + focus 后 `scrollIntoView`；真机待补测。
