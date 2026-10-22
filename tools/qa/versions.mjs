// Round 3 — answer versions and forking from a message.
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, createSandbox, launchBrowser, loginPage, sleep } from './quality-harness.mjs'

const results = []
function record(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const now = Date.now()
const sandbox = await createSandbox({
  port: Number(process.env.QA_PORT || 8808),
  label: 'v5-versions',
  seedConversations: [
    {
      title: '版本测试',
      messages: [
        { role: 'user', text: '给我一个方案' },
        {
          role: 'assistant',
          text: '这是新版本：方案 B。',
          status: 'done',
          blocks: [{ type: 'text', text: '这是新版本：方案 B。' }],
          versions: [
            {
              id: 'v_old_a1',
              text: '这是旧版本：方案 A。',
              blocks: [{ type: 'text', text: '这是旧版本：方案 A。' }],
              status: 'done',
              createdAt: now - 120000,
              completedAt: now - 119000,
              model: 'DeepSeek-V4.1-Flash-1017',
              files: [],
            },
          ],
        },
      ],
    },
  ],
})
console.log(`SANDBOX ${sandbox.base}`)
const api = sandbox.api
const conv = (await api('/api/conversations?limit=5')).body.conversations[0]
const assistant = (await api(`/api/conversations/${conv.id}`)).body.conversation.messages[1]

let browser
try {
  let res = await api(`/api/conversations/${conv.id}/fork`, {
    method: 'POST',
    body: JSON.stringify({ messageId: assistant.id }),
  })
  record('fork creates a new conversation', res.status === 201 && res.body.conversation.id !== conv.id && /分支$/.test(res.body.conversation.title), res.body.conversation?.title)
  const forkedId = res.body.conversation.id
  const forked = (await api(`/api/conversations/${forkedId}`)).body.conversation
  record('fork keeps messages up to the selected answer', forked.messages.length === 2 && forked.forkedFrom?.conversationId === conv.id, JSON.stringify({ n: forked.messages.length, from: forked.forkedFrom }))
  record('fork gets an independent message id', forked.messages[1].id !== assistant.id)

  const badFork = await api(`/api/conversations/${conv.id}/fork`, { method: 'POST', body: JSON.stringify({ messageId: 'nope' }) })
  record('fork rejects missing message', badFork.status === 404, String(badFork.status))

  res = await api(`/api/conversations/${conv.id}/messages/${assistant.id}/versions/v_old_a1/activate`, { method: 'POST' })
  record('activate version succeeds', res.status === 200, JSON.stringify(res.body))
  const after = (await api(`/api/conversations/${conv.id}`)).body.conversation
  record('activated version becomes current text', after.messages[1].text.includes('方案 A'), after.messages[1].text)
  record('previous version is preserved in history', after.messages[1].versions.some((version) => version.text.includes('方案 B')), JSON.stringify(after.messages[1].versions?.map((version) => version.text)))

  const badVersion = await api(`/api/conversations/${conv.id}/messages/${assistant.id}/versions/nope/activate`, { method: 'POST' })
  record('activate rejects unknown version', badVersion.status === 404)

  browser = await launchBrowser()
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await loginPage(page, sandbox)
  await page.goto(`${sandbox.base}/c/${conv.id}`)
  await page.waitForTimeout(900)
  record('version bar is rendered', await page.locator('.msg-version-bar').count() === 1)
  await page.locator('.msg-version-btn').first().click()
  await page.waitForTimeout(300)
  record('versions sheet lists both versions', await page.locator('#versionsList .version-row').count() === 2, String(await page.locator('#versionsList .version-row').count()))
  await page.locator('#versionsList .version-actions button').first().click()
  await page.waitForTimeout(250)
  record('version preview expands', await page.locator('#versionsList .version-preview').first().isVisible())
  await page.locator('#versionsCompareBtn').click()
  await page.waitForTimeout(250)
  const compareText = await page.locator('#versionsCompare').innerText()
  record('versions compare shows both sides', await page.locator('#versionsCompare').isVisible() && /方案 A/.test(compareText) && /方案 B/.test(compareText), compareText.replace(/\s+/g, ' ').slice(0, 100))
  const adopt = page.locator('#versionsList .version-row:not(.active)').getByRole('button', { name: '采用' }).first()
  await adopt.click()
  await page.waitForTimeout(900)
  record('adopting a version closes the sheet', !(await page.locator('#versionsSheet').isVisible()))
  const textNow = await page.locator('.msg.assistant .md').last().innerText()
  record('adopted version is visible in thread', textNow.includes('方案 A') || textNow.includes('方案 B'), textNow.slice(0, 60))

  // Fork action from the message toolbar.
  const before = (await api('/api/conversations?limit=100')).body.total
  await page.locator('.msg.assistant .msg-actions button[aria-label="从这里分叉"]').last().click()
  await page.waitForTimeout(1200)
  const afterCount = (await api('/api/conversations?limit=100')).body.total
  record('fork action creates a conversation', afterCount === before + 1, `${before} -> ${afterCount}`)
  record('fork opens the new branch', /\/c\//.test(page.url()) && (await api(`/api/conversations?limit=100`)).body.conversations.some((item) => item.forkedFrom), page.url())
  await page.screenshot({ path: path.join(ROOT, 'reports/v5/round-3/versions.png') })
  record('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '))
} finally {
  await browser?.close().catch(() => {})
  await sandbox.stop().catch(() => {})
}

const failed = results.filter((item) => !item.ok)
fs.mkdirSync(path.join(ROOT, 'reports/v5/round-3'), { recursive: true })
fs.writeFileSync(path.join(ROOT, 'reports/v5/round-3/versions-qa.json'), JSON.stringify(results, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) process.exitCode = 1
