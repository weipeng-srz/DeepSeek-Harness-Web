// Round 5 — message-level pagination.
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, createSandbox, launchBrowser, loginPage } from './quality-harness.mjs'

const results = []
const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}
const messages = []
for (let i = 0; i < 60; i += 1) {
  messages.push({ role: 'user', text: `问题 ${i + 1}` })
  messages.push({ role: 'assistant', text: `回答 ${i + 1}`, status: 'done', ...(i === 59 ? { blocks: [{ type: 'text', text: `回答 ${i + 1}` }, { type: 'tool', id: 'tool_big', tool: 'bash', input: { command: 'big' }, status: 'completed', result: 'X'.repeat(80_000) }] } : {}) })
}
const sandbox = await createSandbox({ port: Number(process.env.QA_PORT || 8822), label: 'v5-pagination', seedConversations: [{ title: '分页测试', messages }] })
const api = sandbox.api
let browser
try {
  const conv = (await api('/api/conversations?limit=5')).body.conversations[0]
  let res = await api(`/api/conversations/${conv.id}?tail=40`)
  record('tail page returns the requested size', res.body.conversation.messages.length === 40 && res.body.totalMessages === 120 && res.body.hasEarlier === true, JSON.stringify({ n: res.body.conversation.messages.length, total: res.body.totalMessages }))
  const first = res.body.conversation.messages[0]
  const older = await api(`/api/conversations/${conv.id}?before=${encodeURIComponent(first.id)}&limit=40`)
  record('before cursor returns the previous page', older.body.conversation.messages.length === 40 && older.body.hasEarlier === true, JSON.stringify({ n: older.body.conversation.messages.length, hasEarlier: older.body.hasEarlier }))
  const full = await api(`/api/conversations/${conv.id}`)
  record('legacy full fetch still works', full.body.conversation.messages.length === 120)
  const bigMessage = res.body.conversation.messages.find((msg) => (msg.blocks || []).some((block) => block.id === 'tool_big'))
  const bigBlock = bigMessage?.blocks.find((block) => block.id === 'tool_big')
  record('paginated payload truncates huge tool results', bigBlock?.resultTruncated === true && bigBlock.result.length < 5000, String(bigBlock?.result?.length))
  const fullTool = await api(`/api/conversations/${conv.id}/messages/${bigMessage.id}/tool?callId=tool_big`)
  record('full tool result is available on demand', fullTool.status === 200 && fullTool.body.result.length > 70_000, String(fullTool.body.result?.length))

  browser = await launchBrowser()
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' })).newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await loginPage(page, sandbox)
  await page.goto(`${sandbox.base}/c/${conv.id}`)
  await page.waitForTimeout(900)
  const initial = await page.locator('.msg').count()
  record('UI opens only the tail page', initial === 60, String(initial))
  const earlier = page.locator('.load-earlier').first()
  record('UI shows a load-earlier control', await earlier.isVisible())
  await earlier.click()
  await page.waitForTimeout(700)
  const after = await page.locator('.msg').count()
  record('loading earlier grows the thread', after === 120, String(after))
  await page.locator('#findBar').waitFor({ state: 'visible' }).catch(() => {})
  await page.keyboard.press('Meta+f')
  await page.locator('#findInput').fill('问题 1')
  await page.waitForTimeout(800)
  const findCount = await page.locator('#findCount').innerText()
  record('find searches the full history', /\d+\/\d+/.test(findCount) && !findCount.startsWith('0/'), findCount)
  record('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '))
} finally {
  await browser?.close().catch(() => {})
  await sandbox.stop().catch(() => {})
}
const failed = results.filter((item) => !item.ok)
fs.mkdirSync(path.join(ROOT, 'reports/v5/round-5'), { recursive: true })
fs.writeFileSync(path.join(ROOT, 'reports/v5/round-5/pagination-qa.json'), JSON.stringify(results, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) process.exitCode = 1
