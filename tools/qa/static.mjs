// Static checks: every server/client script parses, assets stay within budget,
// and every stylesheet is actually delivered by one of the real load paths.
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

// The bundle list lives in server/index.mjs. Read it instead of keeping a
// second copy here: a stylesheet added to the bundle used to be invisible to
// this budget (evolution.css and sidebar.css were both missing, 44KB of the
// delivered CSS was unaccounted for).
const serverSource = fs.readFileSync(path.join(ROOT, 'server/index.mjs'), 'utf8')
const bundleBlock = serverSource.match(/const CSS_BUNDLE_FILES = \[([\s\S]*?)\n\]/)
if (!bundleBlock) {
  record('CSS_BUNDLE_FILES is readable', false, 'pattern not found in server/index.mjs')
} else {
  const bundleFiles = [...bundleBlock[1].matchAll(/'([^']+)'/g)].map((match) => match[1])
  record('CSS_BUNDLE_FILES is readable', bundleFiles.length > 0, `${bundleFiles.length} sheets`)
  const missing = bundleFiles.filter((rel) => !fs.existsSync(path.join(ROOT, 'public', rel)))
  record('every bundled stylesheet exists', missing.length === 0, missing.join(', ') || 'all present')
  const bundle = bundleFiles.reduce((sum, rel) => sum + fs.statSync(path.join(ROOT, 'public', rel)).size, 0)
  record('CSS bundle stays under 320KB', bundle < 320 * 1024, `${Math.round(bundle / 1024)}KB`)

  // A stylesheet that is neither bundled nor loaded at runtime simply never
  // reaches the browser. Catch that class of silent dead asset.
  const referenced = new Set(
    ['public/index.html', 'public/share.html', 'public/js/app.js', 'public/js/codex.js', 'public/js/dsh-models.js', 'public/js/share.js']
      .map((rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8'))
      .join('\n')
      .match(/\/css\/[a-z0-9-]+\.css/gi)
      ?.map((ref) => `css/${ref.split('/').pop()}`) || [],
  )
  const orphans = fs.readdirSync(path.join(ROOT, 'public/css'))
    .filter((name) => name.endsWith('.css'))
    .map((name) => `css/${name}`)
    .filter((rel) => !bundleFiles.includes(rel) && !referenced.has(rel))
  record('no orphaned stylesheet', orphans.length === 0, orphans.join(', ') || 'all delivered')
}

const app = fs.statSync(path.join(ROOT, 'public/js/app.js'))
record('app.js stays under 450KB', app.size < 450 * 1024, `${Math.round(app.size / 1024)}KB`)
const sharePage = fs.readFileSync(path.join(ROOT, 'public/share.html'), 'utf8')
record('share page has no inline script', !/<script(?![^>]*src=)/i.test(sharePage))
record('share page is noindex', /name="robots" content="noindex/.test(sharePage))

const failed = results.filter((item) => !item.ok)
try {
  fs.mkdirSync(path.join(ROOT, 'reports/v5/round-4'), { recursive: true })
  fs.writeFileSync(path.join(ROOT, 'reports/v5/round-4/static-qa.json'), JSON.stringify(results, null, 2))
} catch {
  // A read-only checkout should not turn a passing check into a failure.
}
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) process.exitCode = 1
