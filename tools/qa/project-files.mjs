// Round 3 — project files: API, workspace copy, and UI.
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, createSandbox, launchBrowser, loginPage, sleep } from './quality-harness.mjs'

const results = []
const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const sandbox = await createSandbox({ port: Number(process.env.QA_PORT || 8815), label: 'v5-project-files', appBinary: '/tmp/fake-dsh-fast.sh' })
const api = sandbox.api
let browser
try {
  const project = (await api('/api/projects', { method: 'POST', body: JSON.stringify({ name: '资料项目', emoji: '📚' }) })).body.project
  let res = await api(`/api/projects/${project.id}/files`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: '项目背景：Q3 目标。' })
  record('project file uploads', res.status === 201 && res.body.file.name.includes('file'), JSON.stringify(res.body.file))
  const name = res.body.file.name
  res = await api(`/api/projects/${project.id}/files`)
  record('project file list returns metadata', res.body.files.length === 1 && res.body.files[0].size > 0)
  res = await fetch(`${sandbox.base}/api/projects/${project.id}/file?name=${encodeURIComponent(name)}`, { headers: { Cookie: sandbox.cookie } })
  record('project file can be opened with auth', res.status === 200 && (await res.text()).includes('Q3'), String(res.status))
  const unauth = await fetch(`${sandbox.base}/api/projects/${project.id}/file?name=${encodeURIComponent(name)}`)
  record('project file is not public', unauth.status === 401, String(unauth.status))

  const conv = (await api('/api/conversations', { method: 'POST', body: JSON.stringify({ engine: 'dsr', projectId: project.id }) })).body.conversation
  const chat = await fetch(`${sandbox.base}/api/conversations/${conv.id}/chat`, {
    method: 'POST',
    headers: { Cookie: sandbox.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: '读一下项目资料' }),
  })
  record('chat accepts project conversation', chat.status === 200, String(chat.status))
  await chat.text()
  await sleep(500)
  const workspace = path.join(sandbox.dir, 'data/workspaces', conv.id, 'project', name)
  record('project file is copied into the conversation workspace', fs.existsSync(workspace), workspace)
  const copied = fs.existsSync(workspace) ? fs.readFileSync(workspace, 'utf8') : ''
  record('copied project file keeps content', copied.includes('Q3 目标'), copied.slice(0, 30))

  browser = await launchBrowser()
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' })).newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await loginPage(page, sandbox)
  await page.locator('#projectsBtn').click()
  await page.waitForTimeout(300)
  await page.locator(`.project-row[data-project-id="${project.id}"] .project-row-edit`).click()
  await page.waitForTimeout(500)
  const rows = await page.locator('#projectFileList .project-file-row').count()
  record('project editor lists files', rows === 1, String(rows))
  await page.locator('#projectFileUploadBtn').click()
  await page.locator('#projectFileInput').setInputFiles({ name: 'spec.md', mimeType: 'text/markdown', buffer: Buffer.from('# 规格\n目标 2') })
  await page.waitForTimeout(900)
  const rowsAfter = await page.locator('#projectFileList .project-file-row').count()
  record('project editor uploads a file', rowsAfter === 2, String(rowsAfter))
  res = await api(`/api/projects/${project.id}/files`, { method: 'DELETE', body: JSON.stringify({ name }) })
  record('project file delete', res.status === 200 && res.body.files.length === 1)
  record('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '))
} finally {
  await browser?.close().catch(() => {})
  await sandbox.stop().catch(() => {})
}
const failed = results.filter((item) => !item.ok)
fs.mkdirSync(path.join(ROOT, 'reports/v5/round-3'), { recursive: true })
fs.writeFileSync(path.join(ROOT, 'reports/v5/round-3/project-files-qa.json'), JSON.stringify(results, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) process.exitCode = 1
