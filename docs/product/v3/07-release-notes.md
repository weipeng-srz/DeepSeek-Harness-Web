# DSH Chat v3.0 发布说明

## 新增

- 会话全文搜索、摘要高亮、结果计数、分页。
- 重命名、置顶、导出 Markdown、删除 8 秒撤销。
- 重新生成、编辑重发、继续生成、失败重试。
- 用户/助手/工具结果复制；token 用量浮层。
- 草稿按会话保存；拖拽/粘贴附件；暂存区；上传进度与重试。
- 三态主题；键盘快捷键面板；斜杠命令；⌘K 命令面板。
- 文件预览（文本/图片/PDF）；PWA manifest 与 Apple touch icon。
- 断网「待发送」与恢复重试；连接条重试；骨架屏；空状态。
- 完成通知与 App Badge；Reduce Motion/Transparency；焦点陷阱；44px 热区。

## 修复

- **S1**：`ConversationStore.flush` 并发时共享 `.tmp` 导致 `rename ENOENT`；改为唯一临时文件 + 串行队列。
- 重复的 `fileInput change` 监听导致附件重复入 tray。
- 快捷键面板空白、焦点未进入；重命名弹窗未绑定提交。
- 草稿恢复未在会话切换时触发；重复 `restoreDraft`。
- 搜索空状态重复构建；`convEmpty` 文本错乱。
- 静态资源版本未更新导致 immutable 缓存命中旧 JS。
- 待发送标记在重试成功后未清除。
- manifest 被 `application/octet-stream` 返回。

## 兼容性

- 无 npm 依赖，沿用 macOS 自带 / DSH 内置 Node。
- 服务端新增 `manifest.webmanifest` MIME；旧配置无需迁移。
- 数据格式向后兼容；新增字段均可缺省。
