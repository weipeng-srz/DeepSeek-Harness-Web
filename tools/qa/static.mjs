// Static checks: every server/client script parses, assets stay within budget.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { ROOT } from './quality-harness.mjs'

const results = []
const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const files = []
for (const dir of ['server', 'public/js', 'tools']) {
  const walk = (current) => {
    for (const entry of fs.readdirSync(path.join(ROOT, current), { withFileTypes: true })) {
      const rel = path.join(current, entry.name)
      if (entry.isDirectory()) walk(rel)
      else if (/\.(mjs|js)$/.test(entry.name)) files.push(rel)
    }
  }
  walk(dir)
}
let bad = 0
for (const file of files) {
  try {
    execFileSync(process.execPath, ['--check', path.join(ROOT, file)], { stdio: 'pipe' })
  } catch (error) {
    bad += 1
    console.log(`SYNTAX ${file}: ${String(error.stderr || '').slice(0, 200)}`)
  }
}
record('all scripts parse', bad === 0, `${files.length} files`)

const app = fs.statSync(path.join(ROOT, 'public/js/app.js'))
record('app.js stays under 450KB', app.size < 450 * 1024, `${Math.round(app.size / 1024)}KB`)
const bundle = ['style.css', 'glass.css', 'apple.css', 'apple-pro.css', 'ux.css', 'refine.css', 'visual.css', 'memory.css', 'projects.css']
  .reduce((sum, name) => sum + fs.statSync(path.join(ROOT, 'public/css', name)).size, 0)
record('CSS bundle stays under 320KB', bundle < 320 * 1024, `${Math.round(bundle / 1024)}KB`)
const sharePage = fs.readFileSync(path.join(ROOT, 'public/share.html'), 'utf8')
record('share page has no inline script', !/<script(?![^>]*src=)/i.test(sharePage))
record('share page is noindex', /name="robots" content="noindex/.test(sharePage))

const failed = results.filter((item) => !item.ok)
fs.mkdirSync(path.join(ROOT, 'reports/v5/round-4'), { recursive: true })
fs.writeFileSync(path.join(ROOT, 'reports/v5/round-4/static-qa.json'), JSON.stringify(results, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) process.exitCode = 1
