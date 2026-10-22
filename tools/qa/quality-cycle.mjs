import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const label = process.env.QA_LABEL || process.argv[2] || 'local'
const env = { ...process.env, QA_LABEL: label, QA_PORT: process.env.QA_PORT || '8798' }
const run = file => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [path.join(root, 'tools/qa', file)], { cwd: root, env, stdio: 'inherit' })
  child.on('error', reject)
  child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${file}: exit ${code}`)))
})
await run('quality-baseline.mjs')
const snapshot = JSON.parse(fs.readFileSync(path.join(root, 'reports/quality', label, 'sandbox.json'), 'utf8'))
env.QA_SOURCE_ROOT = snapshot.path
await run('quality-exploration.mjs')
await run('quality-batch.mjs')
await run('quality-score.mjs')
