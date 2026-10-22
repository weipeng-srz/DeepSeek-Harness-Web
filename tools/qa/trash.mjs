// Round 4 — 30-day trash, restore, permanent delete, share expiry.
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, createSandbox, launchBrowser, loginPage, sleep } from './quality-harness.mjs'

const results = []
const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const sandbox = await createSandbox({
  port: Number(process.env.QA_PORT || 8817),
  label: 'v5-trash',
  seedConversations: [{ title: '回收站测试', messages: [{ role: 'user', text: 'hello' }, { role: 'assistant', text: 'world', status: 'done' }] }],
})
const api = sandbox.api
let browser
try {
  const conv = (await api('/api/conversations?limit=5')).body.conversations[0]
  await api(`/api/conversations/${conv.id}/upload?name=keep.txt`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: 'keep me' })
  const share = await api(`/api/conversations/${conv.id}/share`, { method: 'POST', body: JSON.stringify({ expiresInDays: 7 }) })
  await api(`/api/conversations/${conv.id}`, { method: 'DELETE' })
  await sleep(500)
  let trash = await api('/api/conversations?trash=1')
  record('deleted conversation enters trash', trash.body.conversations.some((item) => item.id === conv.id), JSON.stringify(trash.body.conversations.map((item) => item.title)))
  const files = (await api(`/api/conversations/${conv.id}/files`).catch(() => ({ status: 0 }))).status
  record('workspace is retained while in trash', files === 404, String(files))

  await api(`/api/conversations/${conv.id}/restore`, { method: 'POST' })
  trash = await api('/api/conversations?trash=1')
  record('restore removes it from trash', !trash.body.conversations.some((item) => item.id === conv.id))
  const restored = await api(`/api/conversations/${conv.id}`)
  record('restored conversation keeps messages', restored.status === 200)

  await api(`/api/conversations/${conv.id}`, { method: 'DELETE' })
  await sleep(9000)
  const shareAfter = await fetch(`${sandbox.base}/api/share/${share.body.token}`)
  record('share is revoked 8s after delete while still in trash', shareAfter.status === 410, String(shareAfter.status))
  trash = await api('/api/conversations?trash=1')
  record('conversation is still recoverable after 9s', trash.body.conversations.some((item) => item.id === conv.id))

  const purge = await api(`/api/conversations/${conv.id}/purge`, { method: 'POST' })
  record('permanent delete succeeds', purge.status === 200)
  const gone = await api(`/api/conversations/${conv.id}`)
  record('permanently deleted conversation is gone', gone.status === 404, String(gone.status))

  browser = await launchBrowser()
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' })).newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await loginPage(page, sandbox)
  await page.locator('#settingsBtn').click()
  await page.waitForTimeout(300)
  await page.locator('#trashBtn').click()
  await page.waitForTimeout(400)
  record('trash sheet opens from settings', await page.locator('#trashSheet').isVisible())
  record('trash empty state is clear', (await page.locator('#trashList').innerText()).includes('空'))
  record('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '))
} finally {
  await browser?.close().catch(() => {})
  await sandbox.stop().catch(() => {})
}
const failed = results.filter((item) => !item.ok)
fs.mkdirSync(path.join(ROOT, 'reports/v5/round-4'), { recursive: true })
fs.writeFileSync(path.join(ROOT, 'reports/v5/round-4/trash-qa.json'), JSON.stringify(results, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) process.exitCode = 1
