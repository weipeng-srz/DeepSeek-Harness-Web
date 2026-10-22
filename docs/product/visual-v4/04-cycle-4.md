# Cycle 4 · 弹层与列表

**范围**：V31–V42  
**目标**：所有 sheet、菜单、列表行共享同一内边距和触控几何。

## PM 需求摘要

- 设置分段控件等宽，组内容与标题同轨。
- 备份/导入横排，不再把一行撑成 99px。
- 快捷切换器、命令面板、查找条与 14px 手机轨道对齐。
- 文件预览两个按钮同高同 y；手机等分，桌面右对齐。
- 收藏、归档、提示词行统一 x=17，操作 ≥44px。

## 研发实现

- `.settings-options button { flex:1 1 0 }`；`.settings-group { padding:10px 0 }`。
- `.settings-actions` 横排；手机按钮 44px。
- `.quick-modal { padding:12vh 14px 24px }`，`.quick-card { width:min(560px,100%) }`。
- 文件预览 footer 桌面 `flex-end` + 112px；手机 `grid 1fr 1fr`。
- Prompt/Bookmark/Archive 行去掉 2px 内缩；手机操作 44px。

## QA 结果

| 检查 | 结果 |
| --- | --- |
| 390 设置三段宽 | 116/116/116，PASS |
| 390 设置 label/options x | 17/17，PASS |
| 390 备份行高 | 59.8px，PASS |
| 390 快捷切换器 | x=14 w=362，PASS |
| 390 命令面板 | x=14 w=362，PASS |
| 390 Prompt header/form | 均 x=17 w=356，PASS |
| 桌面文件预览按钮 | 112+112，同 y，PASS |
| 手机文件预览按钮 | 139+139，同 y，PASS |
| 收藏/归档行 | x=17，操作 44px，PASS |

## PM 验收

**PASS**。这一轮的价值是“看起来像同一套系统”，而不是 10 个独立组件各有一套像素。
