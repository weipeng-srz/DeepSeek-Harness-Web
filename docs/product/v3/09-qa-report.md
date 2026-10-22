# QA 报告 · DSH Chat v3.0

日期：2026-10-22 01:25（Asia/Shanghai）  
环境：macOS 26、Chrome 155 headless 390×844@2x / 1440×900、Node 24、DSH 原生桥接 + Codex 预热门  
方法：CDP 自动化走查 + 真实模型流式 + 断网模拟 + DOM/对比度/目标尺寸审计 + curl 头部检查

## 结论

**P0/P1 通过，可以发布。** 50/50 需求状态 PASS；控制台 0 error；无横向溢出；390px 可见目标 0 个 <44px。发现并修复 1 个 S1（并发写 store ENOENT）及 11 个 P1/P2 缺陷。

## 关键证据

- 命令面板：13 项；过滤 6 项；Esc 关闭；焦点回到触发点。
- 快捷键：15 行；打开焦点在关闭按钮。
- 搜索：20 个结果；清除恢复。
- 文件预览：`note-test.txt` 正文 `hello attachment`。
- 重命名：打开值正确；取消关闭。
- 导出：Toast「已导出 Markdown」。
- 主题：dark → auto → light。
- 草稿：跨会话隔离并恢复。
- 触控：390px `smallCount=0`；无溢出。
- 无障碍：0 个无名称按钮；0 个重复 ID；0 个无 alt 图片。
- Reduce Motion：aurora/card/msg 动画近 0s。
- 对比度：浅色 5.07–5.33:1；深色 8.16–12.47:1。
- 离线：出现「待发送」+「重试这条消息」；恢复后成功。
- 附件：上传 16B 文本，模型读取并回复；刷新气泡仍有 chip。

## 缺陷

| ID | 级别 | 问题 | 修复 |
| --- | --- | --- | --- |
| V3-01 | S1 | 并发 flush 共享 `conversations.json.tmp`，rename ENOENT | 唯一 tmp + 串行 promise 队列 |
| V3-02 | P1 | 快捷键面板空白/焦点未进入 | `renderShortcuts` + 精确 close 焦点 |
| V3-03 | P1 | 重命名弹窗未绑定提交 | form/cancel/backdrop 监听 |
| V3-04 | P1 | 草稿切换不恢复 | open/new 前后 save/restore |
| V3-05 | P1 | 两个 `fileInput` change 监听导致附件重复 | 移除旧监听 |
| V3-06 | P1 | 静态资源 immutable 缓存旧 JS | 版本号 31 |
| V3-07 | P2 | 搜索空状态重复构建 | 清理 renderConversations |
| V3-08 | P2 | 待发送标签重试后不消失 | retryRun 清理 |
| V3-09 | P2 | files pill/file chip <44px | 移动端 44px |
| V3-10 | P2 | manifest 返回 octet-stream | `.webmanifest` MIME |
| V3-11 | P2 | 缺少 PWA 图标/预览 | 180/192/512 图标 + 文件预览 |
| V3-12 | P2 | 重复 restoreDraft/usage 字段 | 去重 |

## 未覆盖

- 真实 iPhone Safari 键盘/安全区（仅 Chrome 模拟 + visualViewport 代码审查）。
- 多选/多问题提问、审批破坏性操作的长链路（沿用 v2 回归）。
- 低端 Android 帧率。
