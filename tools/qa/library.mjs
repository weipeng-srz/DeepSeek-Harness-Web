// Round 4 — cross-device bookmarks and prompt library.
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, createSandbox, launchBrowser, loginPage, sleep } from './quality-harness.mjs'

const results = []
function record(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const sandbox = await createSandbox({
  port: Number(process.env.QA_PORT || 8809),
  label: 'v5-library',
  seedConversations: [
    {
      title: '同步测试',
      messages: [
        { role: 'user', text: '收藏这一条' },
        { role: 'assistant', text: '值得收藏的结论：先做减法。', status: 'done' },
      ],
    },
  ],
})
console.log(`SANDBOX ${sandbox.base}`)
const api = sandbox.api
const conv = (await api('/api/conversations?limit=5')).body.conversations[0]
const detail = (await api(`/api/conversations/${conv.id}`)).body.conversation
const messageId = detail.messages[1].id

let browser
try {
  let res = await api('/api/library')
  record('library starts empty', res.status === 200 && res.body.bookmarks.length === 0 && res.body.prompts.length === 0)

  res = await api('/api/library', {
    method: 'PUT',
    body: JSON.stringify({
      bookmarks: [{ conversationId: conv.id, messageId, title: '同步测试', text: '先做减法', at: Date.now() }],
      prompts: [{ id: 'p_custom', name: '复盘', text: '请按结论/证据/下一步复盘。' }],
    }),
  })
  record('library PUT stores bookmarks and prompts', res.status === 200 && res.body.bookmarks.length === 1 && res.body.prompts.length === 1 && res.body.updatedAt > 0, JSON.stringify({ b: res.body.bookmarks.length, p: res.body.prompts.length }))

  const fetched = await api('/api/library')
  record('library GET returns saved entries', fetched.body.bookmarks[0].messageId === messageId && fetched.body.prompts[0].name === '复盘')

  const invalid = await api('/api/library', {
    method: 'PUT',
    body: JSON.stringify({ bookmarks: [{ title: 'no ids' }, null], prompts: [{ name: '', text: '' }] }),
  })
  record('invalid library entries are dropped', invalid.status === 200 && invalid.body.bookmarks.length === 0 && invalid.body.prompts.length === 0, JSON.stringify(invalid.body))

  // Restore one entry for the UI checks.
  await api('/api/library', {
    method: 'PUT',
    body: JSON.stringify({
      bookmarks: [{ conversationId: conv.id, messageId, title: '同步测试', text: '先做减法', at: Date.now() }],
      prompts: [{ id: 'p_custom', name: '复盘', text: '请按结论/证据/下一步复盘。' }],
    }),
  })

  const backup = await api('/api/backup')
  record('backup includes library', backup.status === 200 && backup.body.library?.bookmarks?.length === 1, JSON.stringify(backup.body.library))

  const imported = await api('/api/backup/import', {
    method: 'POST',
    body: JSON.stringify({
      conversations: [{ title: '同步导入', messages: [{ role: 'user', text: 'hi' }] }],
      library: {
        bookmarks: [{ conversationId: conv.id, messageId: 'm_other', title: '另一条', text: 'x', at: Date.now() }],
        prompts: [{ id: 'p_custom2', name: '导入的提示词', text: 'hello' }],
      },
    }),
  })
  record('backup import merges library', imported.status === 200 && imported.body.library?.imported >= 1, JSON.stringify(imported.body.library))
  const afterImport = await api('/api/library')
  record('import drops dead bookmark references', afterImport.body.bookmarks.length === 1 && afterImport.body.prompts.length === 2, JSON.stringify({ b: afterImport.body.bookmarks.length, p: afterImport.body.prompts.length }))

  // Clear bookmarks so the star starts from "not bookmarked"; keep a prompt
  // for the second-device prompt check.
  await api('/api/library', {
    method: 'PUT',
    body: JSON.stringify({ bookmarks: [], prompts: [{ id: 'p_custom', name: '复盘', text: '请按结论/证据/下一步复盘。' }] }),
  })

  browser = await launchBrowser()
  const contextA = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' })
  const pageA = await contextA.newPage()
  await loginPage(pageA, sandbox)
  await pageA.goto(`${sandbox.base}/c/${conv.id}`)
  await pageA.waitForTimeout(900)
  await pageA.locator('.msg.assistant .msg-actions button[aria-label="收藏这条回答"]').last().click()
  await pageA.waitForTimeout(900)
  record('UI bookmark is saved to server', (await api('/api/library')).body.bookmarks.some((item) => item.text.includes('先做减法')))

  const contextB = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' })
  const pageB = await contextB.newPage()
  await loginPage(pageB, sandbox)
  await pageB.waitForTimeout(900)
  await pageB.locator('#bookmarksBtn').click()
  await pageB.waitForTimeout(400)
  const bookmarksText = await pageB.locator('#bookmarksList').innerText()
  record('second device sees the bookmark', /先做减法/.test(bookmarksText), bookmarksText.replace(/\s+/g, ' ').slice(0, 100))

  await pageB.locator('#bookmarksSheet .sheet-head [data-bookmarks-close]').click().catch(() => {})
  await pageB.locator('#promptsBtn').click()
  await pageB.waitForTimeout(400)
  const promptsText = await pageB.locator('#promptList').innerText()
  record('second device sees server prompts', /复盘/.test(promptsText), promptsText.replace(/\s+/g, ' ').slice(0, 100))
  await pageB.screenshot({ path: path.join(ROOT, 'reports/v5/round-4/library.png') })
} finally {
  await browser?.close().catch(() => {})
  await sandbox.stop().catch(() => {})
}

const failed = results.filter((item) => !item.ok)
fs.mkdirSync(path.join(ROOT, 'reports/v5/round-4'), { recursive: true })
fs.writeFileSync(path.join(ROOT, 'reports/v5/round-4/library-qa.json'), JSON.stringify(results, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) process.exitCode = 1
