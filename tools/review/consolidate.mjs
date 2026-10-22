// Consolidate the 20-person v5 review panel into PM-readable themes.
// Usage: node tools/review/consolidate.mjs <round> [--strict]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const round = process.argv[2] || 'round-1'
const strict = process.argv.includes('--strict')
const dir = path.join(ROOT, 'reports/v5', round)
const panelDir = path.join(dir, 'panel')
const outDir = dir

const EXPECTED = [
  ['01', 'linche'], ['02', 'zhouye'], ['03', 'suhe'], ['04', 'chenmo'],
  ['05', 'hejing'], ['06', 'zhaolan'], ['07', 'wutong'], ['08', 'guyan'],
  ['09', 'shenli'], ['10', 'hansong'], ['11', 'luochuan'], ['12', 'tangke'],
  ['13', 'yeqing'], ['14', 'wangayi'], ['15', 'alex'], ['16', 'qinan'],
  ['17', 'fangzhuo'], ['18', 'liyang'], ['19', 'jiangchuan'], ['20', 'haosu'],
]

const THEMES = [
  { id: 'share', name: '只读分享与对外交付', re: /分享|share|公开链接|只读链接|发给|同事|客户|家长|达人|链接打开|登录墙/i },
  { id: 'fork', name: '分叉、对比与回答控制', re: /分叉|分支|fork|对比|比较|regenerate|重新生成|重写|换一种|并排|版本树/i },
  { id: 'projects', name: '项目/空间与上下文', re: /项目|空间|folder|project|归类|上下文|指令|资料库|知识库/i },
  { id: 'files', name: '文件、附件与富内容', re: /附件|文件|上传|预览|Excel|CSV|XLSX|PDF|Word|图片|表格|artifact|diff|下载/i },
  { id: 'permission', name: '权限、审批与执行边界', re: /权限|授权|审批|只读|完全权限|沙箱|approval|permission|危险/i },
  { id: 'privacy', name: '安全、隐私与审计', re: /隐私|安全|审计|日志|明文|HTTP|加密|脱敏|留存|保留期|本地运行|云端|泄露|凭据|cookie/i },
  { id: 'sync', name: '数据同步、备份与迁移', re: /同步|备份|导入|导出|迁移|跨设备|Mac 打开|iPhone 上|localStorage|数据带走/i },
  { id: 'memory', name: '长期记忆', re: /记忆|memory|偏好|记住|遗忘|作用域/i },
  { id: 'find', name: '查找、归档与信息架构', re: /搜索|查找|检索|归档|侧栏|列表|筛选|找不到|分类|标签|排序/i },
  { id: 'perf', name: '性能与长内容', re: /性能|卡顿|流式|长对话|长文|O\(n|渲染|首屏|加载|内存|500|几千|慢/i },
  { id: 'a11y', name: '无障碍与键盘', re: /无障碍|读屏|VoiceOver|键盘|Tab|焦点|对比度|字号|动效|快捷键/i },
  { id: 'mobile', name: '移动端与语音', re: /手机|移动|iPhone|iPad|触屏|触控|单手|语音|PWA|通知栏|横屏/i },
  { id: 'copy', name: '复制、导出与格式', re: /复制|粘贴|纯文本|Markdown|格式|星号|TSV|DOCX|长图|打印/i },
  { id: 'onboarding', name: '新手引导与文案', re: /新手|引导|教程|空状态|文案|看不懂|不知道|首次|示例|帮助/i },
  { id: 'reliability', name: '可靠性与失败恢复', re: /断网|重试|失败|中断|恢复|重连|超时|崩溃|重复|幂等|卡住/i },
  { id: 'notify', name: '通知与异步任务', re: /通知|提醒|推送|后台|完成时|iMessage|定时|队列/i },
  { id: 'prompts', name: '提示词与复用', re: /提示词|模板|快捷指令|复用|常用|snippet|变量/i },
  { id: 'retention', name: '删除、回收站与保留', re: /删除|回收站|撤销|8 秒|恢复|清空|误删|销毁/i },
  { id: 'visual', name: '视觉、布局与主题', re: /视觉|布局|间距|主题|深色|浅色|字号|圆角|阴影|对齐|挤|溢出/i },
  { id: 'quality', name: '回答质量与模型行为', re: /回答质量|幻觉|准确|引用|来源|语气|长度|格式|结构化|模型|引擎|Codex/i },
  { id: 'other', name: '其他', re: /./ },
]

const files = []
for (const [num, slug] of EXPECTED) {
  const file = path.join(panelDir, `${num}-${slug}.json`)
  if (!fs.existsSync(file)) continue
  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  files.push({ file, data, persona: data.persona || { id: `P${num}`, name: slug } })
}

const problems = []
const all = []
for (const { file, data, persona } of files) {
  const findings = Array.isArray(data.findings) ? data.findings : []
  if (findings.length !== 50) problems.push(`${path.basename(file)}: ${findings.length} 条（应为 50）`)
  const ids = new Set()
  const titles = new Set()
  for (const finding of findings) {
    if (!finding.id || ids.has(finding.id)) problems.push(`${path.basename(file)}: 重复/缺失 id ${finding.id}`)
    ids.add(finding.id)
    if (titles.has(finding.title)) problems.push(`${path.basename(file)}: 重复标题 ${finding.title}`)
    titles.add(finding.title)
    for (const key of ['dimension', 'title', 'detail', 'suggestion', 'severity', 'area']) {
      if (!finding[key]) problems.push(`${path.basename(file)}: ${finding.id} 缺 ${key}`)
    }
    all.push({ ...finding, personaId: persona.id, personaName: persona.name, file: path.basename(file) })
  }
}
for (const [num, slug] of EXPECTED) {
  if (!fs.existsSync(path.join(panelDir, `${num}-${slug}.json`))) problems.push(`缺少 ${num}-${slug}.json`)
}

// Each finding gets exactly one primary theme: the first matching rule.
// Later themes are only used for search; counts are not double-counted.
const assigned = new Map()
for (const item of all) {
  const key = `${item.personaId}:${item.id}`
  let match = 'other'
  for (const theme of THEMES) {
    if (theme.id === 'other') continue
    if (theme.re.test(`${item.title}\n${item.detail}\n${item.suggestion}`)) {
      match = theme.id
      break
    }
  }
  assigned.set(key, match)
}

const themes = THEMES.map((theme) => {
  const items = all.filter((item) => assigned.get(`${item.personaId}:${item.id}`) === theme.id)
  const severity = { P0: 0, P1: 0, P2: 0, P3: 0 }
  for (const item of items) severity[item.severity] = (severity[item.severity] || 0) + 1
  const personas = new Set(items.map((item) => item.personaId))
  const score = severity.P0 * 8 + severity.P1 * 4 + severity.P2 * 1
  return { id: theme.id, name: theme.name, score, count: items.length, severity, personas: personas.size, items }
}).sort((a, b) => b.score - a.score)

const consolidated = {
  round,
  generatedAt: new Date().toISOString(),
  panel: {
    expected: EXPECTED.length,
    files: files.length,
    findings: all.length,
    expectedFindings: EXPECTED.length * 50,
  },
  problems,
  severity: all.reduce((acc, item) => {
    acc[item.severity] = (acc[item.severity] || 0) + 1
    return acc
  }, {}),
  themes: themes.map((theme) => ({
    id: theme.id,
    name: theme.name,
    score: theme.score,
    count: theme.count,
    severity: theme.severity,
    personas: theme.personas,
    primary: theme.count,
    samples: theme.items
      .slice()
      .sort((a, b) => (a.severity || 'P9').localeCompare(b.severity || 'P9'))
      .slice(0, 12)
      .map(({ id, personaId, personaName, severity, title, detail, suggestion, area, dimension }) => ({
        id, personaId, personaName, severity, title, detail, suggestion, area, dimension,
      })),
  })),
}

fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, 'consolidated.json'), JSON.stringify(consolidated, null, 2))
fs.writeFileSync(path.join(outDir, 'all-findings.json'), JSON.stringify(all, null, 2))

const lines = []
lines.push(`# ${round} · 20 位体验官意见收敛`)
lines.push('')
lines.push(`- 体验官：${files.length}/${EXPECTED.length}`)
lines.push(`- 原始意见：${all.length}/${EXPECTED.length * 50}`)
lines.push(`- 严重度：${Object.entries(consolidated.severity).map(([key, value]) => `${key} ${value}`).join(' · ')}`)
lines.push(`- 校验问题：${problems.length ? problems.length + ' 项' : '无'}`)
lines.push('')
lines.push('## 主题热度（按 P0×8 + P1×4 + P2 加权）')
lines.push('')
lines.push('| 排名 | 主题 | 加权分 | 提及 | P0 | P1 | P2 | 体验官 |')
lines.push('| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |')
themes.forEach((theme, index) => {
  lines.push(`| ${index + 1} | ${theme.name} | ${theme.score} | ${theme.count} | ${theme.severity.P0 || 0} | ${theme.severity.P1 || 0} | ${theme.severity.P2 || 0} | ${theme.personas} |`)
})
lines.push('')
for (const theme of themes.slice(0, 12)) {
  lines.push(`## ${theme.name}（${theme.count} 条 / ${theme.personas} 位体验官）`)
  lines.push('')
  for (const item of theme.items
    .slice()
    .sort((a, b) => (a.severity || 'P9').localeCompare(b.severity || 'P9'))
    .slice(0, 8)) {
    lines.push(`- **${item.severity}** ${item.title} — ${item.personaName}（${item.personaId}）`)
    lines.push(`  - ${item.detail}`)
    lines.push(`  - 建议：${item.suggestion}`)
  }
  lines.push('')
}
if (problems.length) {
  lines.push('## 校验问题')
  lines.push('')
  for (const problem of problems) lines.push(`- ${problem}`)
  lines.push('')
}
fs.writeFileSync(path.join(outDir, 'consolidation.md'), lines.join('\n'))

console.log(`panel ${files.length}/${EXPECTED.length}, findings ${all.length}/${EXPECTED.length * 50}, problems ${problems.length}`)
console.log('top themes:')
for (const theme of themes.slice(0, 8)) console.log(`  ${theme.name}: ${theme.count} (P0 ${theme.severity.P0 || 0}, P1 ${theme.severity.P1 || 0})`)
if (problems.length) console.log(problems.slice(0, 10).join('\n'))
if (strict && (problems.length || files.length !== EXPECTED.length)) process.exitCode = 1
