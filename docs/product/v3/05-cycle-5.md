# 第 5 轮 · 无障碍、安全与性能

**范围**：E3–E8, F1–F4（10 条）
**目标**：可触、可读、可键盘；静态资源快；服务端稳；数据不丢。

## PRD 摘要

- 44×44 触控（图标可小，热区扩大）；跳过导航；`aria-expanded`/`aria-label` 完整。
- Reduce Motion / Reduce Transparency；明暗对比 ≥4.5:1；最小字号 11px。
- gzip + ETag + 版本化 immutable；HTML no-store。
- 限流 12 次/分钟、会话单飞、Idempotency-Key。
- 上传校验：文件名清洗、空文件、25MB、5 个、路径穿越。
- 原子写 + 软删除恢复 + 启动清理；并发 flush 使用唯一临时文件。

## QA 结果

| ID | 用例 | 结果 | 证据 |
| --- | --- | --- | --- |
| E3 | 390px 可见目标 ≥44 | PASS | 自动审计：`smallCount: 0`；文件 chip/files pill 已加大 |
| E4 | 跳过导航 | PASS | 首个 Tab 出现「跳到输入框」；Enter 聚焦 |
| E5 | 展开状态 aria | PASS | 工具卡/思考块 `aria-expanded` 同步 |
| E6 | Reduce Motion | PASS | 模拟后 aurora 1e-05s、card/msg 0s |
| E7 | iOS 键盘 | PASS（代码） | `--app-h` = visualViewport.height；focus 后滚动 |
| E8 | 对比度/字号 | PASS | 浅色 5.07–5.33:1；深色 8.16–12.47:1 |
| F1 | gzip/ETag/缓存 | PASS | `Content-Encoding: gzip`、304、immutable |
| F2 | 限流/幂等/单飞 | PASS | 服务端 429/409；前端 Idempotency-Key |
| F3 | 上传校验 | PASS | v2 回归 + 当前代码路径；`../../` 404 |
| F4 | 数据可靠性 | PASS | 修复并发 flush ENOENT（唯一 tmp + 串行队列） |

## 验收

PM：PASS。发现并修复 1 个 S1（并发写 `conversations.json.tmp` 重命名 ENOENT）。
