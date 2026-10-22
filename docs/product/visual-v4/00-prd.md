# DSH Chat v4 · 视觉对齐与布局精修 PRD

> 角色：Apple 前端工程师视角的体验审计、产品经理、研发、QA、用户复验  
> 日期：2026-10-22 · 版本：4.0  
> 范围：只改展示层、布局、间距、层级、响应式与触控几何；不改会话协议与核心能力。  
> 关联代码：`public/css/visual.css`（最终覆盖层）、`public/css/codex.css`（Codex 控件）、`public/index.html`（把 helper text 移出输入胶囊）。

## 1. 参考基线

- [Apple Human Interface Guidelines · Layout](https://developer.apple.com/design/human-interface-guidelines/layout)：一致的边距与安全区、清晰层级、为内容留出可读宽度。
- [Apple Human Interface Guidelines · Typography](https://developer.apple.com/design/human-interface-guidelines/typography)：优先系统字体、清晰的字号层级、可读行宽。
- [Apple Human Interface Guidelines · Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons)：明确的主次按钮、足够的触控区域。
- [AI UX Playground · How to design AI chat composer](https://www.aiuxplayground.com/guides/how-to-design-ai-chat-composer)：输入区保持安静；附件/模式/成本控制在需要时出现；帮助文字不要挤占输入胶囊。

## 2. 诊断（Apple 前端工程师试用）

1. 390px 下顶部、空状态、消息、输入框分别是 10/14/14/8px 四套边距，视觉上“各走各的”。
2. 桌面端聊天正文宽 1065px，远超舒适阅读行宽；输入框 1102px，与 760px 场景区脱节。
3. 输入框 helper text 位于胶囊内部，导致控制行不居中、胶囊底部发虚。
4. 1024px 断点输入框比消息内容宽 12px。
5. 顶部标题是绝对定位 + `max-width: calc(100% - 180px)`，在 320px 三图标场景下宽度归零并与操作区重叠。
6. 设置页三个分段按钮宽度 78/54/54，未等分；备份操作竖排导致行高 99px。
7. 快捷切换器卡片 x=24/right=386，页面中心 195 但卡片中心 205，明显偏右。
8. 文件预览底部两个按钮在桌面一个 112px、一个 826px，且垂直错位 12px。
9. 移动端助手操作区因 5 个 44px 图标 + 用量 + 时间换行成 63.5px 的两行。
10. 新对话保留上一段对话的 scrollTop=90，首屏标题被顶栏裁掉。

## 3. 50 条需求

### Cycle 1 · 栅格与页面骨架（10）

| ID | 需求 | 验收 |
| --- | --- | --- |
| V1 | 建立 14px 移动端页面栅格 | 390/320 的 thread、composer、scenario 同 x |
| V2 | 桌面内容使用 20px 内边距 + 760px 阅读列 | 1440 thread 内容与 composer 同宽同边 |
| V3 | 1024px 断点保留同一栅格 | thread 与 composer 均 x=310 |
| V4 | 顶栏改为 44 / 1fr / auto 栅格 | 标题不与操作区重叠 |
| V5 | 移动端标题真正居中 | 390/320 标题 cx=195/160 |
| V6 | 平板标题居中 | 768 标题 cx=384 |
| V7 | 手机隐藏桌面专用 Codex 打开按钮 | ≤640 只有 2 个操作图标 |
| V8 | 侧栏 search/tools/foot 对齐 12px 轨道 | 四者同 x、同 right |
| V9 | 新对话重置滚动位置 | empty top=52，不被裁切 |
| V10 | helper text 移出输入胶囊 | 胶囊只包控件，footer 独立 |

### Cycle 2 · 输入区与浮动控件（10）

| ID | 需求 | 验收 |
| --- | --- | --- |
| V11 | 输入行控件光学居中 | 44px 控件中心均 y=782 |
| V12 | engine / files bar 与 composer 同宽 | 390 x=14 w=362；1440 w=760 |
| V13 | 权限菜单与胶囊留 8px 间隙 | menu bottom < composer top |
| V14 | 斜杠命令菜单与 composer 对齐 | 左右内缩一致，底部留 10px |
| V15 | Toast 位于 composer 上方并按聊天列居中 | 390 与 composer gap≈12；1440 cx=865 |
| V16 | 批量操作条按真实 composer 高度上移 | gap=10，不压输入框 |
| V17 | 查找条 44px 按钮 + 主列居中 | 390 x=14 w=362；1440 cx=865 |
| V18 | 回到底部按钮贴阅读列右轨 | 1440 right 距 composer 10px |
| V19 | 所有可见控件 ≥44×44 | 320/390 自动审计 0 个 |
| V20 | Codex 胶囊对齐并满足触控高度 | inline/foot 均在 44px |

### Cycle 3 · 空状态与消息阅读（10）

| ID | 需求 | 验收 |
| --- | --- | --- |
| V21 | 桌面 bento 改 3 列：1 featured + 1 小卡 / 3 小卡 | 5 卡全部首屏可见 |
| V22 | 桌面首屏容纳 5 卡 + hint | 卡底部 706.9 < scroll 741 |
| V23 | 压缩桌面 hero 字号与垂直节奏 | h1 44–58px，hero 高约 304px |
| V24 | 移动 hero 与卡片同 14px 轨道 | 320 x=14 w=292 |
| V25 | 场景装饰不越出圆角卡片 | 320/1024 卡 scrollWidth=clientWidth |
| V26 | 助手操作单行 | 390 操作行 h=44 |
| V27 | 320px 收敛次要消息操作 | 保留复制/收藏/重试/用量 |
| V28 | 操作元数据与时间同一基线 | 图标、usage、time 中心对齐 |
| V29 | 代码复制/思考/工具复制/重试 ≥44 手机热区 | 自动审计通过 |
| V30 | 日分隔线与正文同宽 | 760 阅读列内 |

### Cycle 4 · 弹层与列表（12）

| ID | 需求 | 验收 |
| --- | --- | --- |
| V31 | 设置分段控件等宽 | 390 三个 116px |
| V32 | 设置组与标题同 17px 轨道 | label/options x=17 |
| V33 | 备份/导入操作横排 | 行高 59.8，不竖排 |
| V34 | 快捷切换器居中 | 390 x=14 w=362 |
| V35 | 提示词表单和行同轨 | head/form/input x=17 |
| V36 | 文件行单行，主文件名优先 | 手机隐藏重复“打开”图标 |
| V37 | 文件预览桌面按钮右对齐 | 两个 112px 按钮同 y |
| V38 | 文件预览移动按钮等分 | 139/139，同 y |
| V39 | 收藏行同轨、删除 44px | row x=17，remove 44 |
| V40 | 归档行同轨、操作 44px | row x=17，按钮 44 |
| V41 | 统计弹窗数字列右对齐 | 1fr auto 网格，无溢出 |
| V42 | Prompt 行/按钮 44px | 插入/删除 44 |

### Cycle 5 · 响应式、可读性与验证（8）

| ID | 需求 | 验收 |
| --- | --- | --- |
| V43 | 320 长标题截断且不压操作区 | title right < actions left |
| V44 | 768 平板标题居中 | cx=384 |
| V45 | 1024 桌面断点无 2–12px 抖动 | thread/composer 同 x/w |
| V46 | 1440 首屏完整展示动作卡 | 5 卡 + hint 在 741px 内 |
| V47 | 登录页卡片与内边距稳定 | 320/390 居中、form 同宽 |
| V48 | 明暗两套 token 不因布局改动失真 | 对比度 ≥4.5:1 |
| V49 | Reduce Motion / Transparency 继续生效 | 动画近 0s，降透明可用 |
| V50 | 五档视觉回归与截图归档 | 320/390/768/1024/1440 无横向溢出 |

## 4. 非目标

- 不改流式协议、权限模型、会话存储。
- 不做全站换肤；保留现有暖白/深色材质与 orb 语言。
- 不引入新的前端框架或构建链。

## 5. 发布门槛

- 50/50 通过；控制台 0 error；五档无横向滚动。
- 320/390 可见交互目标 ≥44px。
- 1440 空状态 5 张场景卡 + hint 首屏可见。
- 设置分段等宽、快捷切换器/命令面板/查找条与内容列对齐。
- 真实 iOS Safari 仍需实机补测键盘与安全区。
