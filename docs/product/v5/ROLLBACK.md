# DSH Chat v5 回滚手册

## 1. 代码回滚

v5 五轮提交均为独立 commit：

```bash
cd ~/Code/DS/dsh-chat
git log --oneline -8
# 回到 v4（R1 之前）
git checkout cbcf37e -- server public tools docs README.md package.json
# 或整体切回某个提交（会丢失未提交改动，先 git stash）
git checkout ac11a00   # R1
git checkout 756d30c   # R2
git checkout 3a5cf94   # R3
git checkout b3f7045   # R4
```

回滚后重启：

```bash
launchctl kickstart -k gui/$(id -u)/com.dshchat.server
```

浏览器/PWA 需清缓存或等待 `sw.js` 更新（v5 为 `dsh-v24`）。

## 2. 数据回滚

v5 只新增文件，不删除旧文件：

| 文件 | 说明 |
| --- | --- |
| `data/conversations.json` | 兼容旧格式；新增字段可被旧代码忽略 |
| `data/projects.json` | v5 新增；旧代码不读 |
| `data/shares.json` | v5 新增；回滚后公开链接失效（旧代码无路由） |
| `data/library.json` | v5 新增；回滚后收藏/提示词回到浏览器 localStorage |
| `data/audit.json` | v5 新增；旧代码不读 |
| `data/auth-epoch` | v5 新增；回滚前删除，避免旧代码 Cookie 不匹配 |
| `data/backups/` | 每日整库快照（保留 5 份） |

恢复到某天：

```bash
cd ~/Code/DS/dsh-chat
cp data/backups/conversations-YYYY-MM-DD.json data/conversations.json
# 停服务后操作；启动后会话回到那天
```

## 3. 单点回滚

- **项目/分享/收藏/审计**：删除对应 JSON 即可关闭功能；会话中的 `projectId` 会被忽略。
- **单实例锁**：删除 `data/server.lock` 后重启（确认无第二个进程）。
- **认证异常**：删除 `data/auth-epoch`，所有设备需重新输入访问码。
- **TLS**：清空 `config.json` 的 `tlsCert`/`tlsKey`，重启回到 HTTP。

## 4. 回滚验证

```bash
curl -s http://127.0.0.1:8787/api/health
node tools/qa/run-all.mjs --quick
```

确认：登录、会话列表、发送消息、文件抽屉、设置可打开；分享页 `/s/...` 在回滚后 404 属预期。
