# Cycle 2 · 输入区与浮动控件

**范围**：V11–V20  
**目标**：让输入区成为稳定的“光学中心”，所有浮层从同一个锚点长出来。

## PM 需求摘要

- 44px 发送/上传/权限控件在 54px 行内垂直居中。
- 权限菜单、斜杠菜单、Toast、批量条、查找条都不压输入胶囊。
- 桌面浮动条按聊天列居中，不再按窗口居中。
- 手机所有可见控件 ≥44×44；Codex 胶囊也遵守。

## 研发实现

- `.composer-inner` 只保留控件行；`.composer-foot` 独立下移。
- `.permission-menu` 改为 `bottom: calc(100% + 8px)`。
- Toast 使用 `--composer-h`，批量条使用同一变量。
- 查找条 `left: calc(50% + 145px)`（桌面），侧栏折叠回到 50%。
- Codex 胶囊在 `codex.css` 末尾覆盖为 44px。

## QA 结果

| 检查 | 结果 |
| --- | --- |
| 权限菜单与 composer gap | 7.8px，PASS |
| 斜杠菜单与 composer 内缩 | 10px，PASS |
| Toast 与 composer gap | 10–12px，PASS |
| 批量条与 composer gap | 10px，PASS |
| 查找条 44px 按钮 | PASS |
| 320/390 可见 <44px 控件 | 0，PASS |
| 1024 查找条 cx=主列 cx | PASS |
| 1440 回到底部贴右轨 | PASS |

## PM 验收

**PASS**。输入区的层级关系从“叠在一起”变成“胶囊 → 帮助文字 → 浮层”的清晰三层。
