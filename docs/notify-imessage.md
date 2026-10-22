# iMessage 推送

任务跑完、跑失败、等你授权或等你回答时，把一条消息推到 iPhone。不依赖浏览器通知，也不需要装 App：服务端直接驱动这台 Mac 上的「信息」。

## 能力边界

| 项 | 现状 |
|---|---|
| 方向 | 单向推送（只发不收），不做 iMessage 回复路由 |
| 依赖 | 运行服务的这台 Mac 必须开机、已登录 iMessage，且「信息」可用 |
| 接口 | 系统没有公开 API，走 AppleScript 控制 `Messages.app`，Apple 改行为时可能失效 |
| 回执 | 没有送达/已读回执，失败只写日志 |
| 频率 | 客户端侧合并 + 限流（默认 60 秒合并、5 秒间隔、20 条/小时） |

## 一次性配置

```bash
cd /Users/liupengbin/Code/DS/dsh-chat
./start.sh --check-runtime          # 拿到可用的 node 路径
NODE=$(./start.sh --check-runtime)

# 写入 config.json 并立刻发一条测试消息
$NODE server/notify.mjs --to "+8613800000000" --enable

# 只想看文案、不真正发送
$NODE server/notify.mjs --to "+8613800000000" --dry-run

# 关闭
$NODE server/notify.mjs --disable
```

`--enable` 只改 `config.json`，不会重启服务。重启后生效：

```bash
launchctl kickstart -k gui/$(id -u)/com.dshchat.server
```

> 重启会中断正在跑的对话，等服务空闲时再执行。

也可以直接手写 `config.json`：

```json
"notify": {
  "enabled": true,
  "channels": [
    {
      "type": "imessage",
      "to": "+8613800000000",
      "events": ["done", "error", "approval", "question"]
    }
  ],
  "quietHours": ["23:30", "08:00"],
  "mergeWindowSec": 60,
  "minIntervalSec": 5,
  "maxPerHour": 20,
  "baseUrl": "http://192.168.1.9:8787"
}
```

- `to`：手机号写 `+86…`；也可以用 Apple ID 邮箱。**不要填本机自己的号码**（同一 Apple ID 给自己发通常失败）。
- `quietHours`：本地时间，跨零点也支持；静默期内的消息会攒着，到点合并发送。
- `baseUrl`：消息里深链的前缀，留空则自动取第一个内网 IPv4 + 端口。
- `events`：`done`（完成）、`error`（失败）、`approval`（等授权）、`question`（等回答）。

## HTTP 接口

都需要登录态（`dsh_access` cookie）。

```bash
# 读取设置
curl -s -b "dsh_access=<token>" http://127.0.0.1:8787/api/notify

# 修改设置（字段同 config.json，可只传要改的）
curl -s -X PATCH -b "dsh_access=<token>" -H 'Content-Type: application/json' \
  -d '{"enabled":true,"channels":[{"type":"imessage","to":"+8613800000000"}]}' \
  http://127.0.0.1:8787/api/notify

# 发测试消息（to 可覆盖）
curl -s -X POST -b "dsh_access=<token>" -H 'Content-Type: application/json' \
  -d '{"to":"+8613800000000","text":"hello"}' \
  http://127.0.0.1:8787/api/notify/test
```

PATCH 会写回 `config.json`（权限 600），重启后仍然生效。

## 消息长什么样

```
✅ DSH Chat · 已完成
会话：重构通知模块
DeepSeek-V4.1-Flash-1017 · 耗时 2 分 13 秒

已经把 iMessage 通道接上了，顺手补了限流和静默时段。

http://192.168.1.9:8787/c/<conversationId>
```

失败是「⚠️ 运行失败」+ 错误首行；授权是「⏸ 需要授权」+ 工具名和原因；提问是「❓ 需要你确认」+ 首个问题标题。同一会话 60 秒内多次完成会合并成一条。

## 排错

| 现象 | 原因 / 处理 |
|---|---|
| 第一次发送卡住或报 `Not authorized to send Apple events` | 系统弹「允许控制“信息”」时点了不允许。到「系统设置 → 隐私与安全性 → 自动化」里给运行服务的进程（node / bash / 终端）勾上「信息」 |
| `Can't get service whose service type = iMessage` | 「信息」里没有登录 iMessage，或账号被禁用 |
| `Can't get buddy ...` | 号码不是 iMessage 可达地址。先在「信息」里手动给对方发一条成功，再试 |
| 发了但手机没收到 | 检查 Mac 是否睡眠、Messages 是否在线；同一 Apple ID 给自己发通常收不到 |
| 重启后没生效 | 确认重启的是 `com.dshchat.server`；`launchctl print gui/$(id -u)/com.dshchat.server` 看状态 |
| 想看日志 | `tail -f data/server.log`，推送相关行以 `[notify]` 开头 |

## 后续可加

- 只在没有可见页面时推送：前端 `visibilitychange` + `navigator.sendBeacon` 上报，服务端按会话记录可见性。
- 设置面板里的开关和号码输入（目前走 CLI / HTTP）。
- 多渠道：`bark` / `ntfy` 作为 iMessage 的兜底，`notify.mjs` 里按 `channel.type` 分发即可。
- 双向：读 `~/Library/Messages/chat.db`（需要「完全磁盘访问」）把回复路由回会话——复杂度和风险都高，暂不做。
