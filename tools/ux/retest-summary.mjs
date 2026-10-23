// Aggregate the retest verification section and prepare round-2 panel files.
import fs from 'node:fs'
import path from 'node:path'

const round = Number(process.argv[2] || 1)
const src = path.resolve('reports/evolution', `round-${round}`, 'retest')
const next = path.resolve('reports/evolution', `round-${round + 1}`, 'panel')
fs.mkdirSync(next, { recursive: true })
const files = fs.readdirSync(src).filter((f) => /^\d{2}-[a-z]+\.json$/.test(f))
const statuses = {}
const items = []
let findings = 0
for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join(src, file), 'utf8'))
  for (const v of data.verification || []) {
    statuses[v.status] = (statuses[v.status] || 0) + 1
    items.push({ persona: data.persona?.name || file, ...v })
  }
  findings += (data.findings || []).length
  fs.copyFileSync(path.join(src, file), path.join(next, file))
}
const byStatus = (s) => items.filter((i) => i.status === s)
const md = [
  `# Round ${round} retest · verification summary`, '',
  `- 复测体验官：${files.length}/20`,
  `- 复测条目：${items.length}`,
  `- 状态：fixed ${statuses.fixed || 0} · partial ${statuses.partial || 0} · open ${statuses.open || 0} · regressed ${statuses.regressed || 0}`,
  `- 下一轮新意见：${findings}`,
  '',
  '## Regressed（本轮改动引入或暴露的新问题）', '',
  ...byStatus('regressed').map((i) => `- **${i.persona}** ${i.title} — ${i.evidence}`),
  '',
  '## Open（未解决）', '',
  ...byStatus('open').map((i) => `- **${i.persona}** ${i.title} — ${i.evidence}`),
  '',
  '## Partial（部分解决）', '',
  ...byStatus('partial').map((i) => `- **${i.persona}** ${i.title} — ${i.evidence}`),
  '',
  '## Fixed（已解决）', '',
  ...byStatus('fixed').map((i) => `- **${i.persona}** ${i.title}`),
  '',
].join('\n')
fs.writeFileSync(path.join(src, 'verification-summary.md'), md)
fs.writeFileSync(path.join(src, 'verification.json'), JSON.stringify({ round, statuses, items }, null, 2))
console.log(`retest files=${files.length} verification=${items.length} findings=${findings}`)
console.log(statuses)
