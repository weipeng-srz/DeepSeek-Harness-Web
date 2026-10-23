# 审查报告 · 问题与优化机会

> 方法：4 个独立审查角色并行（后端/安全、前端正确性、真实用户体验+可达性、架构/性能/测试债）+
> 总指挥亲自复现。**只有 `CONFIRMED` 的条目允许进入需求池**；`SUSPECTED` 必须先验证。
> 每条都给出复现方式或度量值，不做主观评价。

## 状态图例

- `FIXED` 已改并复验 · `OPEN` 待处理 · `SUSPECTED` 待复现 · `WONTFIX` 决策不修（附理由）

---

## A. 已确认并修复（Round 1）

### A-01 `FIXED` 幂等键被全局共享，且在校验前占用 → 正常重试被误拒

- 位置：`server/index.mjs:1308-1318`（修复前）
- 复现：向会话 A 发送带非法附件的消息（返回 400），再用**同一个** `Idempotency-Key` 正常重发 → `409 这条消息已经发送过了`；
  同一 key 用于**另一个会话**同样被拒。
- 影响：用户上传失败后按"重试"可能连续 120 秒收不到回复；跨会话复用 key 直接发不出消息。P2。
- 根因：key 未按会话隔离；且在附件校验/容量校验**之前**就写入 Map，请求失败也不回滚。
- 修复：key 改为 `${conv.id}:${raw}`，只在通过校验后占用；Map 超过 500 条时清空。
- 证据：修复前 `invalid first → 400 / legit retry → 409`；修复后 `400 / 200`，跨会话 `200/200`。
  回归用例已加入 `tools/qa/api.mjs`（`rejected chat does not burn the idempotency key`、
  `idempotency key is scoped per conversation`、`live duplicate send rejected`）。

### A-02 `FIXED` 静态预算漏算 44KB CSS，新增样式表可以"沉默失效"

- 位置：`tools/qa/static.mjs`（硬编码 9 个样式表）+ `server/index.mjs` 的 `CSS_BUNDLE_FILES`（11 个）
- 事实：实际打包 **302KB / 320KB 预算（94%）**，静态检查只统计到 258KB；`evolution.css`(28KB)、
  `sidebar.css`(16KB) 完全没被计入。
- 影响：预算形同虚设；把新样式表放进 `public/css/` 但忘记加入 bundle 时，线上就是不生效，且没有任何检查会报错。P2。
- 修复：`static.mjs` 直接从 `server/index.mjs` 解析 `CSS_BUNDLE_FILES`，并新增两条检查：
  「每个 bundle 文件必须存在」与「`public/css/*.css` 不能既不在 bundle 也不被任何页面/脚本引用」。
- 证据：`8/8 passed`，输出 `CSS bundle stays under 320KB — 302KB`、`no orphaned stylesheet — all delivered`。

### A-03 `FIXED` 崩溃残留的原子写临时文件永不清理

- 事实：真实 `data/` 下存在 2 个 0 字节 `conversations.json.<pid>.<rand>.tmp`。
- 影响：`data/` 看起来像损坏；长期运行会累积。P3（不影响正确性）。
- 修复：`ConversationStore.load()` 末尾清理 **超过 1 小时** 的同名前缀 `.tmp`；1 小时内的保留（可能是在写）。
- 验证：临时目录里放一个 2 小时前和一个刚创建的 `.tmp`，启动后只删掉旧的（脚本见 `.tmp-audit-lead/`）。

### A-04 `FIXED` 限流 Map 只增不减（客户端可控 key）

- 位置：`server/index.mjs` 的 `authFailures` / `shareFailures` / `shareViewRate` / `chatRate` / `idempotency`
- 事实：只有"同一个 key 再次出现"时才会被处理，唯一 IP 或唯一分享令牌可以让 Map 无限增长。
- 影响：长期运行内存缓慢增长；公网/Tailscale 暴露时是低成本 DoS 面。P3。
- 修复：新增 `sweepRateLimits()`，每 60 秒清理过期条目（定时器 `unref()`，不阻止进程退出）。

### A-05 `FIXED` `npm run qa` 基线失败：测试与已上线改版漂移

- 事实：v6 把侧栏的项目 chips 改成 `<select id="projectSelect">`，`tools/qa/projects.mjs` 仍在断言 `.project-chip`，
  套件 baseline **16/17**，报 `FAIL project chips rendered — 0` 后点击超时崩溃。
- 影响：基线红 → 后续任何回归都淹没在噪声里；且"测试红"会让人误判产品坏了。P1（工程可信度）。
- 修复：改成断言新契约（下拉存在、选项含全部项目/未归类/emoji/计数、选择后列表被过滤且值保持），
  并补一条**触摸上下文**（`hasTouch: true`）的命中区测量（行高 44px、`<select>` 覆盖行高减去 1px 边框）。
- 证据：`28/29 → 29/29 passed`（修复后项目套件全绿）。

---

## B. 开放中（待本轮修复）

| ID | 严重度 | 问题 | 证据 | 计划 |
| --- | --- | --- | --- | --- |
| B-01 | P2 | 项目 chips 改版后 `.project-bar/.project-chips/.project-chip/.project-add-chip` 约 90 行 CSS 成为死代码（`projects.css` 7-72、538-546、577；`evolution.css` 508、689-757） | `grep` 全仓无任何 JS/HTML 产出这些类名 | Round 2 删除，CSS 预算回收 |
| B-02 | P2 | CSS 已达 302/320KB（94%），11 层覆盖式样式表（`style→glass→apple→apple-pro→ux→refine→visual→memory→projects→evolution→sidebar`），同一组件被 4-6 处重复定义 | 见 `tools/qa/static.mjs` 输出 | Round 3 合并死规则 |
| B-03 | P3 | `PATCH /api/conversations/:id` 先应用部分字段再校验后面的字段，返回 400 时前面的字段已落库 | 代码路径 `index.mjs:2760+`（`title` 校验在 `engine`/模型写入之后） | Round 1 校验前置 |
| B-04 | P2 | 会话 PATCH 的 `title` 校验与 `archived`/`projectId` 校验互相独立，失败时无回滚 | 同上 | 同上 |

---

## C. 审查角色报告

> 四个角色的完整报告在各自小节中给出（含 file:line、复现步骤、度量值）。

（待填：后端/安全、前端正确性、UX/可达性、架构/性能/测试债）
