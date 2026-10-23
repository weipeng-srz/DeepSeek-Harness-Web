// Consolidate the 20 reviewers' JSON into deduplicated clusters.
// Usage: node tools/ux/consolidate.mjs --round 1 [--cohort panel|retest]
import fs from 'node:fs'
import path from 'node:path'
import { PERSONAS, ROUNDS } from './personas.mjs'

const args = process.argv.slice(2)
const get = (flag, fallback) => {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] : fallback
}
const roundNo = Number(get('--round', '1'))
const cohort = get('--cohort', 'panel')
const dir = path.resolve('reports/evolution', `round-${roundNo}`, cohort)
const prefix = cohort === 'panel' ? '' : 'retest-'
const round = ROUNDS.find((r) => r.n === roundNo)

const files = fs.readdirSync(dir).filter((f) => /^\d{2}-[a-z]+\.json$/.test(f))
const panels = []
const problems = []
for (const file of files) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))
    const persona = PERSONAS.find((p) => p.file === file.replace(/\.json$/, '')) || PERSONAS.find((p) => p.id === data.persona?.id)
    if (!persona) problems.push(`${file}: unknown persona`)
    if (!Array.isArray(data.findings)) problems.push(`${file}: findings is not an array`)
    else if (data.findings.length !== 50) problems.push(`${file}: ${data.findings.length} findings (expected 50)`)
    panels.push({ file, persona: persona || data.persona, method: data.method, coverage: data.coverage || [], findings: data.findings || [] })
  } catch (error) {
    problems.push(`${file}: ${error.message}`)
  }
}
panels.sort((a, b) => (a.persona?.id || '').localeCompare(b.persona?.id || ''))

const all = []
for (const panel of panels) {
  panel.findings.forEach((finding) => {
    all.push({ ...finding, personaId: panel.persona?.id || '', personaName: panel.persona?.name || '', personaRole: panel.persona?.role || '', file: panel.file })
  })
}

/* ── text similarity ─────────────────────────────────────────────────── */

const STOP = new Set('的 了 是 在 和 与 及 或 对 把 被 让 这 那 有 没有 不 很 更 太 一个 一种 我们 你 我 他 她 它 需要 可以 应该 会 能 要 就 也 都 而 但 如果 因为 所以 已经 还是 没有 这个 那个 现在 目前 一个 两个 一下 一些 非常 明显 问题 建议 用户 页面 界面 时候 地方 感觉 东西 这样 那样 the and for with that this from your you are is be to of in on it as at by or an'.split(/\s+/))
function grams(text) {
  const clean = String(text || '').toLowerCase().replace(/[^\p{Script=Han}a-z0-9]+/gu, ' ')
  const set = new Set()
  for (const word of clean.split(/\s+/)) {
    if (!word || STOP.has(word)) continue
    if (/^[a-z0-9]+$/.test(word)) { if (word.length > 2) set.add(word); continue }
    const chars = [...word]
    for (let i = 0; i < chars.length - 1; i += 1) {
      const g = chars[i] + chars[i + 1]
      if (!STOP.has(g)) set.add(g)
    }
    if (chars.length >= 3) for (let i = 0; i < chars.length - 2; i += 1) set.add(chars[i] + chars[i + 1] + chars[i + 2])
  }
  return set
}
function jaccard(a, b) {
  if (!a.size || !b.size) return 0
  let inter = 0
  const [small, large] = a.size <= b.size ? [a, b] : [b, a]
  for (const item of small) if (large.has(item)) inter += 1
  return inter / (a.size + b.size - inter)
}
for (const finding of all) {
  finding._titleGrams = grams(finding.title || '')
  finding._bodyGrams = grams(`${finding.title || ''} ${finding.observed || ''} ${finding.why || ''} ${finding.suggestion || ''}`)
}
const sameSurface = (a, b) => a.surface === b.surface || a.surface === 'system' || b.surface === 'system'

// Union-find over findings.
const parent = all.map((_, i) => i)
const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])))
const union = (a, b) => { const ra = find(a); const rb = find(b); if (ra !== rb) parent[rb] = ra }
for (let i = 0; i < all.length; i += 1) {
  for (let j = i + 1; j < all.length; j += 1) {
    if (all[i].personaId === all[j].personaId) continue
    if (!sameSurface(all[i], all[j])) continue
    const titleSim = jaccard(all[i]._titleGrams, all[j]._titleGrams)
    if (titleSim < 0.58 && jaccard(all[i]._bodyGrams, all[j]._bodyGrams) < 0.3) continue
    if (titleSim >= 0.45 || jaccard(all[i]._bodyGrams, all[j]._bodyGrams) >= 0.36) union(i, j)
  }
}

const groups = new Map()
all.forEach((finding, index) => {
  const root = find(index)
  if (!groups.has(root)) groups.set(root, [])
  groups.get(root).push(finding)
})

const SEV_WEIGHT = { P0: 40, P1: 15, P2: 4, P3: 0 }
const SEV_ORDER = { P0: 0, P1: 1, P2: 2, P3: 3 }
const clusters = [...groups.values()].map((items, index) => {
  items.sort((a, b) => (SEV_ORDER[a.severity] ?? 3) - (SEV_ORDER[b.severity] ?? 3) || (a.personaId || '').localeCompare(b.personaId || ''))
  const personaIds = [...new Set(items.map((f) => f.personaId))]
  const severities = items.reduce((acc, f) => { acc[f.severity] = (acc[f.severity] || 0) + 1; return acc }, {})
  const surfaces = [...new Set(items.map((f) => f.surface))]
  const dimensions = [...new Set(items.map((f) => f.dimension))]
  const rep = items[0]
  const focusHit = round?.focus?.some((word) => items.some((f) => `${f.title} ${f.dimension} ${f.why}`.includes(word))) ? 1 : 0
  const score = personaIds.length * 12 + (severities.P0 || 0) * 40 + (severities.P1 || 0) * 15 + (severities.P2 || 0) * 4 + focusHit * 6 - (rep.effort === 'L' ? 3 : rep.effort === 'M' ? 1 : 0)
  return {
    id: `C${String(index + 1).padStart(3, '0')}`,
    score,
    personas: personaIds,
    personaCount: personaIds.length,
    severity: { P0: severities.P0 || 0, P1: severities.P1 || 0, P2: severities.P2 || 0, P3: severities.P3 || 0 },
    surfaces,
    dimensions,
    title: rep.title,
    representative: items.slice(0, Math.min(4, items.length)).map((f) => ({ personaId: f.personaId, personaName: f.personaName, title: f.title, observed: f.observed, why: f.why, suggestion: f.suggestion, severity: f.severity, effort: f.effort, evidence: f.evidence })),
    all: items.map((f) => ({ personaId: f.personaId, personaName: f.personaName, title: f.title, severity: f.severity, suggestion: f.suggestion, evidence: f.evidence })),
    count: items.length,
  }
}).sort((a, b) => b.score - a.score)

const surfaces = {}
const dimensions = {}
for (const f of all) {
  surfaces[f.surface || 'unknown'] = (surfaces[f.surface || 'unknown'] || 0) + 1
  dimensions[f.dimension || 'unknown'] = (dimensions[f.dimension || 'unknown'] || 0) + 1
}

const severityTotals = all.reduce((acc, f) => { acc[f.severity] = (acc[f.severity] || 0) + 1; return acc }, {})
const top = clusters.slice(0, 80)
const md = [
  `# round-${roundNo} · ${cohort === 'panel' ? '20 位体验官' : '20 位复测用户'}意见收敛`,
  '',
  `- 主题：${round?.title || ''}`,
  `- 体验官：${panels.length}/20`,
  `- 原始意见：${all.length}/${panels.length * 50 || 1000}`,
  `- 严重度：P0 ${severityTotals.P0 || 0} · P1 ${severityTotals.P1 || 0} · P2 ${severityTotals.P2 || 0} · P3 ${severityTotals.P3 || 0}`,
  `- 去重后主题：${clusters.length}`,
  `- 校验问题：${problems.length ? problems.join('；') : '无'}`,
  '',
  '## 维度分布',
  '',
  '| 维度 | 条数 |',
  '| --- | ---: |',
  ...Object.entries(dimensions).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} |`),
  '',
  '## 表面分布',
  '',
  '| Surface | 条数 |',
  '| --- | ---: |',
  ...Object.entries(surfaces).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} |`),
  '',
  '## 高频主题（按 提及人数 + 严重度 + 本轮相关性 排序）',
  '',
  `| # | 主题 | 分 | 人数 | P0/P1/P2/P3 | 表面 |`,
  '| ---: | --- | ---: | ---: | --- | --- |',
  ...top.map((c, i) => `| ${i + 1} | ${c.title.replace(/\|/g, '\\|')} | ${c.score} | ${c.personaCount} | ${c.severity.P0}/${c.severity.P1}/${c.severity.P2}/${c.severity.P3} | ${c.surfaces.join(',')} |`),
  '',
  '## 主题详情',
  '',
  ...top.flatMap((c) => [
    `### ${c.id} · ${c.title}`,
    '',
    `- 提及：${c.personaCount} 人（${c.personas.join(', ')}）· ${c.count} 条 · 严重度 P0 ${c.severity.P0} / P1 ${c.severity.P1} / P2 ${c.severity.P2} / P3 ${c.severity.P3} · 表面 ${c.surfaces.join(', ')} · 维度 ${c.dimensions.join(', ')}`,
    '',
    ...c.representative.slice(0, 3).map((r) => `- **${r.personaName || r.personaId}｜${r.title}**（${r.severity} / ${r.effort || '?'}）  \\n  观察：${r.observed}  \\n  影响：${r.why}  \\n  建议：${r.suggestion}  \\n  证据：${Array.isArray(r.evidence) ? r.evidence.join('；') : r.evidence || '—'}`),
    '',
  ]),
].join('\n')

fs.writeFileSync(path.join(dir, `${prefix}all-findings.json`), JSON.stringify(all.map(({ _titleGrams, _bodyGrams, ...rest }) => rest), null, 2))
fs.writeFileSync(path.join(dir, `${prefix}clusters.json`), JSON.stringify({ round: roundNo, cohort, generatedAt: new Date().toISOString(), panels: panels.length, findings: all.length, severity: severityTotals, dimensions, surfaces, clusters }, null, 2))
fs.writeFileSync(path.join(dir, `${prefix}consolidation.md`), md)
console.log(`panels=${panels.length} findings=${all.length} clusters=${clusters.length} problems=${problems.length}`)
if (problems.length) console.log(problems.join('\n'))
