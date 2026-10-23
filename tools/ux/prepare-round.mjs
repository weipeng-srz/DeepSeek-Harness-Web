// Build the panel brief and folders for one evolution round.
// Usage: node tools/ux/prepare-round.mjs --round 1 --evidence reports/evolution/round-1/baseline
import fs from 'node:fs'
import path from 'node:path'
import { PERSONAS, ROUNDS } from './personas.mjs'

const args = process.argv.slice(2)
const get = (flag, fallback) => {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] : fallback
}
const roundNo = Number(get('--round', '1'))
const evidence = get('--evidence', `reports/evolution/round-${roundNo}/baseline`)
const round = ROUNDS.find((item) => item.n === roundNo)
if (!round) throw new Error(`unknown round ${roundNo}`)
const outDir = path.resolve('reports/evolution', `round-${roundNo}`)
fs.mkdirSync(path.join(outDir, 'panel'), { recursive: true })
fs.mkdirSync(path.join(outDir, 'retest'), { recursive: true })

const states = fs.readdirSync(path.join(evidence, 'states')).filter((file) => file.endsWith('.md')).map((file) => file.replace(/\.md$/, ''))
const SUMMARY = fs.readFileSync(path.join(evidence, 'SUMMARY.md'), 'utf8')
const summaryRows = states.map((name) => {
  const md = fs.readFileSync(path.join(evidence, 'states', `${name}.md`), 'utf8')
  const url = (md.match(/- URL：(.+)/) || [])[1] || ''
  const surface = (md.match(/- 审阅表面：(.+)/) || [])[1] || 'page'
  const vp = (md.match(/- 视口：(.+)/) || [])[1] || ''
  const issues = (md.match(/## 自动检出（(\d+)）/) || [])[1] || '0'
  return `| \`${name}\` | ${vp.split('·')[0].trim()} | ${surface} | ${issues} | ${url} |`
}).join('\n')

const personaTable = PERSONAS.map((p) => `| ${p.id} | ${p.name} | ${p.role} | ${p.lens} | ${p.device} / 耐心${p.patience} |`).join('\n')

const brief = `# DSH Chat 前端体验演进 · 第 ${round.n} 轮体验官手册

> 轮次主题：**${round.title}**
> 证据目录：\`${evidence}/\`
> 你的输出：\`reports/evolution/round-${roundNo}/panel/<你的编号>-<拼音>.json\`
> 评审对象：<http://127.0.0.1:8787>（只读体验，禁止创建/修改/删除任何真实会话）

## 1. 你在做什么

你是 DSH Chat「20 人体验评审团」中的一员。你既是一个有明确设备、目标、耐心和视觉能力的真实用户，
也是一位带着专业透镜的设计评审。你要**独立**体验这个聊天产品的所有前端页面，
并写下 **恰好 50 条**具体、可执行、有证据的意见与建议。

这一轮不是功能许愿池，而是**前端体验改造**：
${round.thesis}

本轮请特别关注：${round.focus.join(' · ')}。

${round.avoid}

**重要性顺序**：会让这类用户放弃/误操作的 > 让任务变慢的 > 让界面显得不专业的 > 锦上添花。
每条都必须能落到一个具体页面、元素、状态或测量值；拒绝“希望更智能”“再美观一点”这类空话。

## 2. 产品是什么

DSH Chat 是一个**本地优先、单用户、内网可用**的 AI 聊天工作台：

- 前端：原生 HTML/CSS/JS（无框架、无构建），入口 \`public/index.html\`、\`public/js/app.js\`；
  CSS 由 9 个文件按顺序拼成 \`/css/bundle.css\`（style → glass → apple → apple-pro → ux → refine → visual → memory → projects）。
- 后端：Node.js 原生 HTTP，会话 JSON 持久化；本轮不要求也不允许修改后端功能。
- 引擎：DSH 原生桥接（与 macOS 桌面版共享会话）或 headless 兜底；另支持 Codex。
- 已有页面/状态：登录、空状态首页、会话、侧栏、项目、收藏、提示词、记忆、设置、归档箱/回收站、
  文件抽屉、分享/导出、命令面板、快速切换、会话内查找、批量管理、场景抽屉、分享只读页。
- 手机/平板/桌面都要成立；浅色、深色、320/390/768/1440 都要成立。

## 3. 你怎么体验（只读）

1. 先读本手册，再读 \`${evidence}/SUMMARY.md\`（42 个状态的自动测量摘要）。
2. 按需打开 \`${evidence}/states/<state>.md\`：里面有区域几何、容器子元素坐标、可见控件表、
   文本字号/颜色/对比度、浮层几何、Tab 焦点轨迹。**所有坐标都是真实浏览器测出来的。**
3. 需要更细的原始数据时，用 \`python3\` 读 \`${evidence}/evidence.json\`（约 7MB，按 state 过滤，不要整份打印）。
4. 想核对源码时，重点看 \`public/index.html\`、\`public/css/*.css\`、\`public/js/app.js\`（很大，先 grep 再读片段）。
5. 截图在 \`${evidence}/shots/<state>.png\`，可作为“用户看到的画面”引用；你不需要逐张打开也能从 DOM 测量判断。
6. 不要启动服务、不要登录后改数据、不要运行会写文件的脚本。你只写自己的 JSON。

### 状态清单

| 状态 | 视口 | 审阅表面 | 自动检出 | URL |
| --- | --- | --- | --- | --- |
${summaryRows}

### 自动检出的局限

自动检出只覆盖：横向溢出、文字截断、触控尺寸、对比度、浮层越界、控件重叠、无名称控件、重复 id 等
**可测量**问题。它看不到：层级是否清楚、留白是否有节奏、文案是否可信、状态是否完整、
视觉重心是否稳定、品牌是否有记忆点。**这些正是你不可替代的价值。**
不要只复述自动检出；把它当底板，再补充设计判断。

## 4. 你是谁（本轮 20 人）

| # | 姓名 | 身份 | 专业透镜 | 设备 / 耐心 |
| --- | --- | --- | --- | --- |
${personaTable}

## 5. 评审维度（每条标注一个）

视觉层级 / 排版与字体 / 色彩与对比 / 布局与栅格 / 间距与节奏 / 交互与反馈 / 状态完整性 /
文案与语气 / 导航与信息架构 / 移动端与触控 / 无障碍与键盘 / 性能与动效 / 一致性与设计系统 / 情感与品牌。

## 6. 输出格式（严格）

只写一个文件：\`reports/evolution/round-${roundNo}/panel/<你的编号>-<拼音>.json\`
（编号/拼音见上表，例如 \`01-linche.json\`）。UTF-8，合法 JSON，**恰好 50 条 findings**。

\`\`\`json
{
  "round": ${roundNo},
  "persona": { "id": "P01", "name": "林澈", "role": "创业者 / 增长负责人", "device": "MacBook + iPhone 15", "lens": "速度、首屏决策效率、跨设备连续" },
  "method": "你实际读了哪些状态/源码、做了哪些只读核对（3-5 句）",
  "coverage": ["desktop-home-dark", "mobile-conversation", "..."],
  "findings": [
    {
      "id": "R${roundNo}-P01-F01",
      "dimension": "视觉层级",
      "title": "不超过 24 个字的问题标题",
      "observed": "在哪个状态、哪个元素看到什么；引用 state 名 + 选择器 + 测量值/文案",
      "why": "对这位用户的具体影响（不要泛泛而谈）",
      "suggestion": "可执行的前端改法：CSS/结构/交互/文案；不要要求改后端",
      "severity": "P0|P1|P2|P3",
      "surface": "home|sidebar|topbar|composer|thread|markdown|tool|sheet|settings|mobile|share|a11y|system",
      "evidence": ["state:selector", "metric or quote"],
      "effort": "S|M|L",
      "confidence": "high|medium|low"
    }
  ]
}
\`\`\`

### 硬性要求

- **恰好 50 条**；id 连续 \`F01\`–\`F50\`；title 不重复。
- 至少覆盖 **8 个不同 surface**、**8 个不同 dimension**；至少 12 条涉及移动端/窄屏。
- 严重度分布合理：P0 仅用于“会误删/看不到/不能完成核心任务”，P1 用于“明显影响任务或信任”，
  P2 用于“明显不专业/不一致”，P3 用于“打磨”。不要为了显得重要而抬高严重度。
- 每条必须引用至少一个真实 state（见清单）或真实选择器；没有证据的条目请删掉。
- 建议必须**前端可实现**：CSS token、布局、结构、文案、焦点、动效、响应式、空/错/载入状态。
  不要求新增后端接口、数据库、权限模型或模型能力。
- 不要重复同一问题换 10 种说法；同一主题最多 3 条，从不同角度（视觉/交互/无障碍）展开。
- 不要修改任何产品文件；不要 output 到 issues/、docs/ 之外的位置。

## 7. 业界参照（用来校准，不是照搬）

- Apple HIG：清晰的层级、44pt 触控、尊重安全区、克制的材质与动效、系统字体与动态字号。
- Material 3：状态层（hover/focus/pressed/dragged）、可预测的容器与导航、语义色。
- WCAG 2.2 AA：4.5:1 正文对比、2.5.8 最小目标 24px、2.4.11 焦点不被遮挡、1.4.10 重排、
  2.3.3 动效可关闭、3.3.1 错误可识别。
- Linear / Vercel / Notion：高密度但不拥挤、键盘优先、空状态有下一步。
- ChatGPT / Claude：阅读列宽、消息层级、输入区稳定性、流式状态的可读性。
- 移动端：拇指热区、底部安全区、键盘弹起、避免横向滚动、减少一次性信息量。

## 8. 写完前自检

- [ ] 50 条，id 连续，JSON 可解析。
- [ ] 至少 8 个 surface、8 个 dimension。
- [ ] 每条都有 state/selector 证据与用户影响。
- [ ] 没有后端功能需求；没有“重做整个产品”。
- [ ] 读起来像一个具体的人，而不是一份审计脚本的输出。
`

fs.writeFileSync(path.join(outDir, 'BRIEF.md'), brief)
fs.writeFileSync(path.join(outDir, 'states.json'), JSON.stringify({ round: roundNo, evidence, states }, null, 2))
console.log(`Wrote ${path.relative(process.cwd(), path.join(outDir, 'BRIEF.md'))} (${states.length} states)`)
