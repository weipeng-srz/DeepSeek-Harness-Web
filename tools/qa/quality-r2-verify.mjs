import fs from 'node:fs'
import assert from 'node:assert/strict'

const directory = process.env.QA_REPORT || 'reports/quality/r2-after'
const data = JSON.parse(fs.readFileSync(`${directory}/metrics.json`, 'utf8'))
const checks = []
const check = (name, condition, evidence) => {
  checks.push({ name, status: condition ? 'passed' : 'failed', evidence })
}
const rgb = value => value.match(/[\d.]+/g).slice(0, 3).map(Number)
const luminance = values => values.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0)
const contrast = (text, background) => {
  const values = [luminance(rgb(text)), luminance(rgb(background))].sort((a, b) => b - a)
  return (values[0] + .05) / (values[1] + .05)
}
for (const observation of data.results) {
  const prefix = `${observation.viewport.width}px ${observation.theme || ''}`.trim()
  if (observation.case === 'codex controls') {
    const metrics = observation.metrics
    const descriptions = metrics.filter(x => ['.codex-pop-sub', '.codex-model-desc', '.codex-effort-desc', '.codex-pop-source'].includes(x.selector))
    check(`${prefix}: readable descriptions`, descriptions.every(x => parseFloat(x.fontSize) >= 12), descriptions.map(x => ({ selector: x.selector, fontSize: x.fontSize })))
    check(`${prefix}: complete effort descriptions`, metrics.filter(x => x.selector === '.codex-effort-desc').every(x => x.scrollHeight <= x.clientHeight + 1), metrics.filter(x => x.selector === '.codex-effort-desc').map(x => ({ client: x.clientHeight, scroll: x.scrollHeight })))
    const targets = metrics.filter(x => ['#codexFootBtn', '.codex-model-choice', '.codex-effort-choice', '.codex-pop-open'].includes(x.selector))
    if (targets[0]?.pointer) check(`${prefix}: coarse pointer targets`, targets.every(x => x.width >= 44 && x.height >= 44), targets.map(x => ({ selector: x.selector, width: x.width, height: x.height })))
    const tag = metrics.find(x => x.selector === '.codex-model-tag')
    const ratio = contrast(tag.color, tag.background)
    check(`${prefix}: default label contrast`, ratio >= 4.5, { ratio: Number(ratio.toFixed(2)), foreground: tag.color, background: tag.background })
    const panel = metrics.find(x => x.selector === '.codex-pop')
    check(`${prefix}: panel stays within viewport`, panel.left >= -1 && panel.right <= observation.viewport.width + 1 && panel.top >= -1 && panel.bottom <= observation.viewport.height + 1, { left: panel.left, right: panel.right, top: panel.top, bottom: panel.bottom })
  } else if (observation.case === 'long content') {
    check(`${prefix}: page avoids horizontal overflow`, observation.documentWidth <= observation.viewport.width, observation)
  } else if (observation.case === 'table horizontal wheel') {
    check(`${prefix}: horizontal wheel reaches later table columns`, observation.scrollLeft > 0 && observation.scrollLeft + observation.clientWidth >= observation.scrollWidth - 1, observation)
  }
}
const report = { fixture: data.fixture, checks, totals: { passed: checks.filter(x => x.status === 'passed').length, failed: checks.filter(x => x.status === 'failed').length } }
fs.writeFileSync(`${directory}/verification.json`, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report.totals))
assert.equal(report.totals.failed, 0, 'R2 visual verification failed')
