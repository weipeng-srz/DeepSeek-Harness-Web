// Run every v5 QA suite sequentially and print one summary.
// Usage: node tools/qa/run-all.mjs [--quick]
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const quick = process.argv.includes('--quick')
const suites = [
  ['projects', 'projects.mjs'],
  ['cycle1', 'v5-cycle1.mjs'],
  ['share', 'share.mjs'],
  ['versions', 'versions.mjs'],
  ['library', 'library.mjs'],
  ['productivity', 'productivity.mjs'],
  ['trust', 'trust.mjs'],
  ['stop', 'stop.mjs'],
  ['api', 'api.mjs'],
  ['project-files', 'project-files.mjs'],
  ['large-text', 'large-text.mjs'],
  ['trash', 'trash.mjs'],
  ['memory-scope', 'memory-scope.mjs'],
  ['rewrite', 'rewrite.mjs'],
  ['print', 'print.mjs'],
  ['static', 'static.mjs'],
  ['baseline', 'quality-baseline.mjs'],
].filter(([name]) => !quick || !['share', 'trash', 'baseline'].includes(name))

const results = []
for (const [name, file] of suites) {
  process.stdout.write(`\n── ${name} ──\n`)
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'tools/qa', file)], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, QA_PORT: String(8820 + suites.findIndex(([n]) => n === name)) } })
    child.on('exit', (value) => resolve(value ?? 1))
    child.on('error', () => resolve(1))
  })
  results.push({ name, code })
}
const failed = results.filter((item) => item.code !== 0)
console.log('\n════════ QA SUMMARY ════════')
for (const item of results) console.log(`${item.code === 0 ? 'PASS' : 'FAIL'}  ${item.name}`)
console.log(`${results.length - failed.length}/${results.length} suites passed`)
process.exit(failed.length ? 1 : 0)
