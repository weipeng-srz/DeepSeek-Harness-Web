# QA 报告 · DSH Chat v4.0 视觉对齐

日期：2026-10-22 · 环境：Chrome 155 headless，320/390/768/1024/1440，DSH 原生桥接  
方法：CDP 真实交互 + DOM 几何审计 + 双主题 + 触控目标扫描 + 截图归档

## 结论

**PASS，可发布。** 五档宽度无横向溢出；移动端 0 个可见控件小于 44px；桌面端 5 张场景卡与提示在 1440×900 首屏内；控制台 0 error。

## 关键指标

| 指标 | 结果 |
| --- | --- |
| 320/390/768/1024/1440 横向溢出 | 0 |
| 320/390 可见 <44px | 0 |
| 顶栏标题与操作区重叠 | 0 |
| 1440 场景卡底部 / scroll 底部 | 706.9 / 741 |
| 1440 hint 底部 | 739.4 |
| 1024 thread/composer 左边 | 310 / 310 |
| 设置分段等宽 | 116/116/116 |
| 快捷切换器中心 | 195 / 卡片 cx=195 |
| 命令面板中心 | 195 / 卡片 cx=195 |
| 文件预览桌面按钮 | 112 + 112，同 y |
| 控制台 error | 0 |

## 本轮修复

| ID | 问题 | 修复 |
| --- | --- | --- |
| V4-01 | 新对话保留 scrollTop=90，标题被裁 | showEmptyChat 重置 0 |
| V4-02 | 顶栏绝对定位 + max-width 导致 320 宽度归零 | grid/absolute 分断点 + 100% |
| V4-03 | 输入 helper 在胶囊内，控件不居中 | 移出胶囊，独立 footer |
| V4-04 | 1440 正文 1065px 过宽 | 760px 阅读列 |
| V4-05 | 1024 composer 比 thread 宽 12px | 桌面 20px 内边距 |
| V4-06 | 设置分段 78/54/54 | flex:1 等分 |
| V4-07 | 快捷切换器右偏 10px | modal padding 14 + width 100% |
| V4-08 | 文件预览按钮 112/826 + 12px 错位 | 桌面宽度 auto/112，移动 grid |
| V4-09 | 助手操作换行 63.5px | 有 usage 时隐藏 duration + 320 收敛 |
| V4-10 | 批量条压住 composer | ResizeObserver 写 --composer-h |
| V4-11 | Toast 压住 composer | bottom 使用 --composer-h |
| V4-12 | 权限菜单压住胶囊 | +8px gap |
| V4-13 | 文件行 4 图标挤压文件名 | 手机隐藏重复打开/320 隐藏插入路径 |
| V4-14 | 场景卡 art 溢出圆角 | right:4px |
| V4-15 | Prompt/Bookmark/Archive 2px 内缩 | padding 归零 |

## 未覆盖

- 真实 iPhone Safari 键盘、刘海/底部安全区（Chrome 模拟 + visualViewport 代码审查）。
- 超长单行 URL、极长文件名在 320px 的极端组合。
- 低端 Android 的滚动帧率。
