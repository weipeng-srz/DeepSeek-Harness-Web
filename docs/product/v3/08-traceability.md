# 50 条需求追踪矩阵

| ID | 需求 | 轮次 | 状态 | 证据 |
| --- | --- | --- | --- | --- |
| A1 | 重命名 | 1 | PASS | 菜单/弹窗保存，顶栏同步 |
| A2 | 置顶 | 1 | PASS | 置顶组与菜单切换 |
| A3 | 全文搜索 | 1 | PASS | 20 条结果含正文摘要 |
| A4 | 搜索可用性 | 1 | PASS | 计数/清除/空态 |
| A5 | 删除撤销 | 1 | PASS | 29→30 恢复 |
| A6 | 操作菜单 | 1 | PASS | 首项聚焦/Esc/外部关闭 |
| A7 | 列表信息密度 | 1 | PASS | 预览+条数+时间 |
| A8 | 自动滚入 | 1 | PASS | active scrollIntoView |
| A9 | 分页 | 1 | PASS | limit/offset/hasMore |
| B1 | 重新生成 | 2 | PASS | 替换原回答 |
| B2 | 编辑重发 | 2 | PASS | 111→222 截断重跑 |
| B3 | 复制提问 | 2 | PASS | Toast |
| B4 | 消息时间 | 2 | PASS | 时间+完整 title |
| B5 | 导出回答 | 2 | PASS | Markdown 下载 |
| B6 | 停止后继续 | 2 | PASS | 约 300 字续写 |
| B7 | 失败重试 | 2 | PASS | 离线恢复重试 |
| B8 | 用量详情 | 2 | PASS | 5 项数值 |
| B9 | 工具结果复制 | 2 | PASS | 复制按钮 |
| B10 | 工具卡 aria | 2 | PASS | expanded 同步 |
| C1 | 草稿 | 3 | PASS | 切会话恢复 |
| C2 | 字数 | 3 | PASS | 12k/24k |
| C3 | 拖拽 | 3 | PASS | 遮罩+drop |
| C4 | 粘贴 | 3 | PASS | 图片缩略图 |
| C5 | 上传进度/取消 | 3 | PASS | XHR 进度/中止 |
| C6 | 暂存区 | 3 | PASS | 可移除 |
| C7 | 键盘提示 | 3 | PASS | 桌面显示/移动隐藏 |
| C8 | 快捷键 | 3 | PASS | 15 行 |
| C9 | 斜杠命令 | 3 | PASS | /主题 |
| C10 | 输入高度 | 3 | PASS | 168px 上限 |
| C11 | 附件持久化 | 4 | PASS | 刷新仍显示 |
| D1 | 骨架屏 | 4 | PASS | 切换出现 |
| D2 | 搜索空态 | 4 | PASS | 清除按钮 |
| D3 | Toast 动作 | 4 | PASS | 撤销/重试 |
| D4 | 断网待发 | 4 | PASS | 待发送+重试 |
| D5 | 未读标题 | 4 | PASS | 圆点+favicon |
| D6 | 完成通知 | 4 | PASS | 可选授权+通知 |
| D7 | 连接条 | 4 | PASS | 重试+相对时间 |
| D8 | 错误边界 | 4 | PASS | 单条错误卡 |
| E1 | 主题三态 | 1 | PASS | auto/light/dark |
| E2 | 焦点陷阱 | 4 | PASS | Tab 循环 |
| E3 | 44px 触控 | 5 | PASS | 自动审计 0 个 |
| E4 | 跳过导航 | 5 | PASS | skip link |
| E5 | aria-expanded | 5 | PASS | 工具/思考块 |
| E6 | Reduce Motion | 5 | PASS | 动画 0s |
| E7 | iOS 键盘 | 5 | PASS | visualViewport |
| E8 | 对比度/字号 | 5 | PASS | 最低 5.07:1 |
| F1 | 缓存压缩 | 5 | PASS | gzip/ETag/304 |
| F2 | 限流幂等 | 5 | PASS | 409/429 |
| F3 | 上传校验 | 5 | PASS | 路径/大小/空文件 |
| F4 | 数据可靠 | 5 | PASS | 并发 flush 修复 |
