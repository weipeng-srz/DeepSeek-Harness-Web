// Round 5 — audit trail and transport hardening signals.
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, createSandbox, launchBrowser, loginPage, sleep } from './quality-harness.mjs'

const results = []
function record(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const sandbox = await createSandbox({
  port: Number(process.env.QA_PORT || 8812),
  label: 'v5-trust',
  seedConversations: [
    { title: '审计测试', messages: [{ role: 'user', text: 'hello' }, { role: 'assistant', text: 'world', status: 'done' }] },
  ],
})
console.log(`SANDBOX ${sandbox.base}`)
const api = sandbox.api
const conv = (await api('/api/conversations?limit=5')).body.conversations[0]

let browser
try {
  await api(`/api/conversations/${conv.id}`, { method: 'PATCH', body: JSON.stringify({ permission: 'read-only' }) })
  const share = await api(`/api/conversations/${conv.id}/share`, { method: 'POST', body: JSON.stringify({ expiresInDays: 7 }) })
  await api(`/api/shares/${share.body.share.id}`, { method: 'DELETE' })
  await api(`/api/conversations/${conv.id}`, { method: 'DELETE' })
  await api(`/api/conversations/${conv.id}/restore`, { method: 'POST' })
  const project = await api('/api/projects', { method: 'POST', body: JSON.stringify({ name: '审计项目' }) })
  await api(`/api/projects/${project.body.project.id}`, { method: 'DELETE' })

  let res = await api('/api/audit?limit=100')
  const types = new Set((res.body.entries || []).map((entry) => entry.type))
  record('audit records permission changes', types.has('permission.change'))
  record('audit records share lifecycle', types.has('share.create') && types.has('share.revoke'))
  record('audit records delete/restore', types.has('conversation.delete') && types.has('conversation.restore'))
  record('audit records project delete', types.has('project.delete'))
  record('audit entries are ordered newest first', res.body.entries[0].at >= res.body.entries.at(-1).at)
  record('audit has no message bodies', !JSON.stringify(res.body.entries).includes('world'))

  await sleep(600)
  const stat = fs.statSync(path.join(sandbox.dir, 'data/audit.json'))
  record('audit file is private', (stat.mode & 0o777) === 0o600, (stat.mode & 0o777).toString(8))

  // Transport signals: a proxy-terminated HTTPS request must get a Secure
  // cookie and HSTS even though the local hop is HTTP.
  const login = await fetch(`${sandbox.base}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-Proto': 'https' },
    body: JSON.stringify({ code: sandbox.code }),
  })
  const cookie = login.headers.get('set-cookie') || ''
  record('HTTPS login sets Secure cookie', /;\s*Secure/i.test(cookie), cookie.replace(/dsh_access=[^;]+/, 'dsh_access=***'))
  const home = await fetch(`${sandbox.base}/`, { headers: { 'X-Forwarded-Proto': 'https' } })
  record('HTTPS response sets HSTS', Boolean(home.headers.get('strict-transport-security')), String(home.headers.get('strict-transport-security')))

  browser = await launchBrowser()
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await loginPage(page, sandbox)
  await page.locator('#settingsBtn').click()
  await page.waitForTimeout(300)
  await page.locator('#auditWrap summary').click()
  await page.waitForTimeout(500)
  const auditText = await page.locator('#auditList').innerText()
  record('settings shows the audit trail', /权限变更/.test(auditText) && /删除对话/.test(auditText), auditText.replace(/\s+/g, ' ').slice(0, 100))
  record('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '))

  // Share base URL is configurable without editing config.json.
  const baseBefore = await api('/api/settings')
  record('settings expose the effective share base', baseBefore.status === 200 && typeof baseBefore.body.effectiveBaseUrl === 'string', JSON.stringify(baseBefore.body))
  const invalidBase = await api('/api/settings', { method: 'PATCH', body: JSON.stringify({ publicBaseUrl: 'ftp://x' }) })
  record('invalid share base is rejected', invalidBase.status === 400, String(invalidBase.status))
  const setBase = await api('/api/settings', { method: 'PATCH', body: JSON.stringify({ publicBaseUrl: 'https://chat.example.com/' }) })
  record('share base saves and normalizes', setBase.status === 200 && setBase.body.effectiveBaseUrl === 'https://chat.example.com', JSON.stringify(setBase.body))
  const withBase = await api(`/api/conversations/${conv.id}/share`, { method: 'POST', body: JSON.stringify({ expiresInDays: 7 }) })
  record('new share uses the configured base', withBase.body.url?.startsWith('https://chat.example.com/s/'), withBase.body.url)
  await api('/api/settings', { method: 'PATCH', body: JSON.stringify({ publicBaseUrl: '' }) })

  // Importing the same backup twice must not duplicate conversations.
  const dupPayload = JSON.stringify({ conversations: [{ title: '幂等导入', messages: [{ role: 'user', text: '同一条' }] }] })
  const firstImport = await api('/api/backup/import', { method: 'POST', body: dupPayload })
  const secondImport = await api('/api/backup/import', { method: 'POST', body: dupPayload })
  record('import is idempotent', firstImport.body.imported === 1 && secondImport.body.imported === 0 && secondImport.body.skipped === 1, JSON.stringify({ first: firstImport.body, second: secondImport.body }))

  // Logout must invalidate cookies already issued to other devices.
  const loginA = await fetch(`${sandbox.base}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: sandbox.code }),
  })
  const oldCookie = (loginA.headers.get('set-cookie') || '').split(';')[0]
  const beforeLogout = await fetch(`${sandbox.base}/api/conversations`, { headers: { Cookie: oldCookie } })
  record('old cookie works before logout', beforeLogout.status === 200, String(beforeLogout.status))
  await fetch(`${sandbox.base}/api/logout`, { method: 'POST', headers: { Cookie: oldCookie } })
  const afterLogout = await fetch(`${sandbox.base}/api/conversations`, { headers: { Cookie: oldCookie } })
  record('logout revokes cookies issued to other devices', afterLogout.status === 401, String(afterLogout.status))
} finally {
  await browser?.close().catch(() => {})
  await sandbox.stop().catch(() => {})
}

const failed = results.filter((item) => !item.ok)
fs.mkdirSync(path.join(ROOT, 'reports/v5/round-5'), { recursive: true })
fs.writeFileSync(path.join(ROOT, 'reports/v5/round-5/trust-qa.json'), JSON.stringify(results, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) process.exitCode = 1
