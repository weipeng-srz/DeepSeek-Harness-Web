// Round 3 — print must render the whole conversation, not the on-screen window.
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
  messages.push({ role: 'assistant', text: `回答 ${i + 1}`, status: 'done' })
}
const sandbox = await createSandbox({ port: Number(process.env.QA_PORT || 8821), label: 'v5-print', seedConversations: [{ title: '长对话打印', messages }] })
let browser
try {
  const conv = (await sandbox.api('/api/conversations?limit=5')).body.conversations[0]
  browser = await launchBrowser()
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' })).newPage()
  await loginPage(page, sandbox)
  await page.goto(`${sandbox.base}/c/${conv.id}`)
  await page.waitForTimeout(1000)
  const before = await page.locator('.msg').count()
  record('long conversation starts windowed', before <= 60, String(before))
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')))
  await page.waitForTimeout(800)
  const during = await page.locator('.msg').count()
  record('print renders all 120 messages', during === 120, String(during))
  record('print header has title and time', await page.locator('#printHeader').isVisible() || await page.locator('#printTitle').innerText() !== 'DSH Chat')
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
  await page.waitForTimeout(700)
  const after = await page.locator('.msg').count()
  record('afterprint restores the window', after <= 60, String(after))
} finally {
  await browser?.close().catch(() => {})
  await sandbox.stop().catch(() => {})
}
const failed = results.filter((item) => !item.ok)
fs.mkdirSync(path.join(ROOT, 'reports/v5/round-3'), { recursive: true })
fs.writeFileSync(path.join(ROOT, 'reports/v5/round-3/print-qa.json'), JSON.stringify(results, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) process.exitCode = 1
