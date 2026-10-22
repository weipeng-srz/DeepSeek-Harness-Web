# DSH Chat v5.0.0 发布说明

日期：2026-10-22 · 版本：5.0.0 · 对应提交：v5 五轮提交链（见 `git log`）

## 亮点

- **项目空间**：项目指令/资料/文件、默认引擎权限、归档、30 天回收站、记忆隔离、随备份导入导出。
- **安全交付**：只读分享（有效期、单条/选段、默认不选、工具/思考可选、可选口令、自动打码、
  更新快照、撤销、删除联动、全局管理、对外地址）；Markdown/HTML 导出安全默认；打印全量/仅正文。
- **回答控制**：30 个版本、采用/并排对比、按指令重写、就地编辑（保留工具/思考）、从任意回答分叉。
- **长期使用**：消息分页（首屏 60 条，工具结果按需加载）、回收站、幂等导入与引用映射、
  跨设备收藏/提示词、审计（设备指纹）、日备份。
- **信任与可达**：完全权限二次确认、headless 权限透传、单实例锁、可选 HTTPS/Secure/HSTS、
  登出吊销旧 Cookie、分享令牌加密、5 档字号、读屏/触屏修复。

## 升级步骤

1. 备份：设置 → 导出（JSON），并另行复制 `data/workspaces/` 与 `data/projects/`。
2. 拉取代码 / 覆盖 `server/`、`public/`、`tools/`、`docs/`、`package.json`。
3. 重启服务：
   ```bash
   launchctl kickstart -k gui/$(id -u)/com.dshchat.server
   ```
4. 强制刷新浏览器；PWA 重新打开（`sw.js` 已 bump 到 `dsh-v25`，app.js `v=64`，bundle `v=59`）。
5. 检查 `/api/health` 返回 `{ok:true}`；登录后侧栏出现「项目」。

## 数据兼容

- 新增 `data/projects.json`、`shares.json`、`library.json`、`audit.json`、`backups/`、`auth-epoch`。
- 会话新增可选字段：`projectId`、`noMemory`、`forkedFrom`、`versions`、`editedAt`、`context`；
  旧数据缺省即未归类/未编辑，可直接启动。
- 备份版本仍为 1，新增 `projects`/`library` 字段；旧备份可导入（无项目/收藏）。

## 已知限制（发布必须告知）

- 备份 JSON **不包含**工作区附件、Agent 产出文件、项目文件本体；换机需单独复制 `data/workspaces`、`data/projects`。
- 单访问码 = 全权限；无只读成员、无“人”的审计身份（只有设备指纹）。
- 搜索同步全库扫描；conversations.json 全量写；app.js 单文件约 1.1 万行；无 lint/typecheck/CI。
- 无 i18n；iOS Web Push 未接；HTTP 内网下 PWA/通知/语音不可用。
- 分享口令 6–64 位，8 次失败锁 10 分钟；链接仍是 bearer token，转发不可追踪。
- 项目删除进入回收站 30 天；永久删除需再次操作。

## 回滚

见 [`ROLLBACK.md`](ROLLBACK.md)。
