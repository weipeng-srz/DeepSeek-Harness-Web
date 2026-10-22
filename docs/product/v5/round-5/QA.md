# Round 5 · QA 报告（最终）

日期：2026-10-22 · 版本：5.0.0 · 环境：macOS / Node 22 / Chrome 155

## 1. 结果

| 套件 | 结果 |
| --- | --- |
| projects | 26/26 |
| v5-cycle1 | 24/24 |
| share | 48/48 |
| versions | 17/17 |
| library | 10/10 |
| productivity | 16/16 |
| trust | 19/19 |
| stop | 6/6 |
| api | 23/23 |
| project-files | 12/12 |
| large-text | 4/4 |
| trash | 11/11 |
| memory-scope | 5/5 |
| rewrite | 14/14 |
| print | 4/4 |
| static | 5/5 |
| pagination | 10/10 |
| project-trash | 10/10 |
| quality-baseline | 36/36 |

**18 套件 264 项 + baseline 36 项 = 300 项通过。**

## 2. 关键证据

- 分页：120 条会话首屏 60 条；向上加载到 120；查找覆盖全量；最大 1.16MB 会话首屏降至约 212KB（工具结果 4KB 裁剪 + 按需加载）。
- 工具结果：>200KB 落库保留头 80KB + 尾 100KB；完整结果接口可回读 80KB 测试数据；超过落库上限的部分仍不可恢复（限制）。
- 项目回收站：删除→recently deleted 列表→恢复（对话重新挂回、记忆/文件保留）→再次删除→purge（文件/记忆清理）。
- 分享：默认 0 选；显式 messageIds；服务端口令 scrypt 异步；8 次失败锁定；打码持久化；更新不纳入新消息；标题/工具块参与扫描；公开页 updatedAt。
- 导入：同源项目幂等；失败回滚 purge；备份不触发 prune；收藏/记忆引用映射；死链不保留。
- 打印：⌘P 拦截并全量加载；120/120；仅正文排除工具/思考。
- 草稿：未发送文本在刷新后恢复。
- 触屏：`hover:none` 下消息操作常显。
- 静态：105 个脚本全部解析；app.js 409KB < 450KB；CSS 255KB < 320KB。

## 3. 未验证/不可验证

- 真实 4G/公网分享可达性与证书链（需要实际 DNS/TLS 部署）。
- iOS 真机 Web Push、锁屏通知（未实现服务端 push）。
- 600MB 工作区随备份（未实现）。
- 2000 段/GB 级库的保存延迟（未构造该规模）。
- 读屏软件真机（VoiceOver）走查；仅 Chromium + DOM/ARIA 检查。
