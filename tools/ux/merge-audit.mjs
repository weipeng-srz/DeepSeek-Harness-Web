// Merge chunked audit runs into one evidence directory + SUMMARY.
import fs from 'node:fs'
import path from 'node:path'

const dirs = process.argv.slice(2)
if (dirs.length < 2) throw new Error('usage: node tools/ux/merge-audit.mjs <out> <in1> <in2> ...')
const out = path.resolve(dirs.shift())
fs.mkdirSync(path.join(out, 'states'), { recursive: true })
fs.mkdirSync(path.join(out, 'shots'), { recursive: true })
const byName = new Map()
for (const dir of dirs) {
  const abs = path.resolve(dir)
  const evidence = JSON.parse(fs.readFileSync(path.join(abs, 'evidence.json'), 'utf8'))
  for (const state of evidence.states) byName.set(state.state, { state, dir: abs })
}
const states = []
for (const [name, item] of byName) {
  states.push(item.state)
  const md = path.join(item.dir, 'states', `${name}.md`)
  if (fs.existsSync(md)) fs.copyFileSync(md, path.join(out, 'states', `${name}.md`))
  const shot = path.join(item.dir, 'shots', `${name}.png`)
  if (fs.existsSync(shot)) fs.copyFileSync(shot, path.join(out, 'shots', `${name}.png`))
}
states.sort((a, b) => a.state.localeCompare(b.state))
fs.writeFileSync(path.join(out, 'evidence.json'), JSON.stringify({ generatedAt: new Date().toISOString(), mergedFrom: dirs, states }, null, 2))
const totalIssues = states.reduce((n, s) => n + (s.issues?.length || 0), 0)
const p1 = states.reduce((n, s) => n + (s.issues || []).filter((i) => i.severity === 'P1').length, 0)
const p2 = states.reduce((n, s) => n + (s.issues || []).filter((i) => i.severity === 'P2').length, 0)
const lines = [
  '# Deep front-end audit · summary', '',
  `Generated: ${new Date().toISOString()}`,
  `States: ${states.length} · issue candidates: ${totalIssues} (P1 ${p1} / P2 ${p2})`,
  '',
  '| 状态 | 视口 | 主题 | 溢出 | P1 | P2 | DOM | 控件 | 文本 | 截图 |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ...states.map((s) => {
    const sev = (s.issues || []).reduce((acc, i) => { acc[i.severity] = (acc[i.severity] || 0) + 1; return acc }, {})
    return `| ${s.state} | ${s.viewport.w}×${s.viewport.h} | ${s.tokens.theme} | ${s.doc.overflowX ? 'YES' : 'no'} | ${sev.P1 || 0} | ${sev.P2 || 0} | ${s.perf.domNodes} | ${s.controls.length} | ${s.texts.length} | [png](shots/${s.state}.png) |`
  }),
  '',
  '## 每状态重点',
  '',
  ...states.flatMap((s) => [
    `### ${s.state}`,
    '',
    ...((s.issues || []).filter((i) => i.severity !== 'P3').slice(0, 8).map((i) => `- **${i.severity} ${i.code}** ${i.detail}`)),
    ...((s.issues || []).filter((i) => i.severity !== 'P3').length === 0 ? ['- 无 P1/P2 自动检出'] : []),
    '',
  ]),
]
fs.writeFileSync(path.join(out, 'SUMMARY.md'), lines.join('\n'))
console.log(`merged ${states.length} states → ${path.relative(process.cwd(), out)} (P1 ${p1} / P2 ${p2})`)
