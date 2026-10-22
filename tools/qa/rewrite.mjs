// Round 3 — regenerate with instruction, in-place answer editing, versions.
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, createSandbox, launchBrowser, loginPage, sleep } from './quality-harness.mjs'

const results = []
const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const sandbox = await createSandbox({ port: Number(process.env.QA_PORT || 8816), label: 'v5-rewrite', appBinary: '/tmp/fake-dsh-echo.sh' })
const api = sandbox.api
let browser
try {
  const conv = (await api('/api/conversations', { method: 'POST', body: JSON.stringify({ engine: 'dsr' }) })).body.conversation
  let chat = await fetch(`${sandbox.base}/api/conversations/${conv.id}/chat`, {
    method: 'POST',
    headers: { Cookie: sandbox.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: '原始问题' }),
  })
  await chat.text()
  await sleep(400)
  let detail = (await api(`/api/conversations/${conv.id}`)).body.conversation
  const firstAnswer = detail.messages.find((msg) => msg.role === 'assistant')
  record('first answer is stored', firstAnswer?.text?.includes('原始问题'), firstAnswer?.text?.slice(0, 40))

  chat = await fetch(`${sandbox.base}/api/conversations/${conv.id}/chat`, {
    method: 'POST',
    headers: { Cookie: sandbox.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ retryOf: firstAnswer.id, instruction: '更简洁，保留数字' }),
  })
  await chat.text()
  await sleep(500)
  detail = (await api(`/api/conversations/${conv.id}`)).body.conversation
  const rewritten = detail.messages.find((msg) => msg.role === 'assistant')
  record('rewrite sends the instruction to the model', rewritten?.text?.includes('重写要求：更简洁，保留数字'), rewritten?.text?.slice(-60))
  record('rewrite keeps the old answer as a version', rewritten?.versions?.length === 1, String(rewritten?.versions?.length))
  const versionOld = rewritten?.versions?.[0]?.text || ''
  record('old version still has the original answer', versionOld.includes('原始问题'), versionOld.slice(0, 40))

  let res = await api(`/api/conversations/${conv.id}/messages/${rewritten.id}`, { method: 'PATCH', body: JSON.stringify({ text: '手工修正后的回答' }) })
  record('in-place answer edit succeeds', res.status === 200, String(res.status))
  detail = (await api(`/api/conversations/${conv.id}`)).body.conversation
  const edited = detail.messages.find((msg) => msg.role === 'assistant')
  record('edited answer is current text', edited.text === '手工修正后的回答', edited.text)
  record('edit adds another version', edited.versions?.length === 2, String(edited.versions?.length))

  browser = await launchBrowser()
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' })).newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await loginPage(page, sandbox)
  await page.goto(`${sandbox.base}/c/${conv.id}`)
  await page.waitForTimeout(800)
  await page.locator('.msg.assistant .msg-actions button[aria-label="重新生成回答"]').last().click()
  await page.waitForTimeout(250)
  record('regenerate modal opens', await page.locator('#regenerateModal').isVisible())
  await page.locator('[data-regen-preset]').first().click()
  const presetValue = await page.locator('#regenerateInstruction').inputValue()
  record('rewrite preset fills the instruction', presetValue.includes('更简洁'), presetValue)
  await page.locator('#regenerateCancel').click()
  await page.waitForTimeout(200)
  await page.locator('.msg.assistant .msg-actions button[aria-label="编辑回答文字"]').last().click()
  await page.waitForTimeout(250)
  record('edit answer modal opens', await page.locator('#editAnswerModal').isVisible())
  await page.locator('#editAnswerText').fill('界面里改过的回答')
  await page.locator('#editAnswerSave').click()
  await page.waitForTimeout(800)
  const textNow = await page.locator('.msg.assistant .md').last().innerText()
  record('UI edit updates the thread', textNow.includes('界面里改过的回答'), textNow.slice(0, 40))
  record('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '))
} finally {
  await browser?.close().catch(() => {})
  await sandbox.stop().catch(() => {})
}
const failed = results.filter((item) => !item.ok)
fs.mkdirSync(path.join(ROOT, 'reports/v5/round-3'), { recursive: true })
fs.writeFileSync(path.join(ROOT, 'reports/v5/round-3/rewrite-qa.json'), JSON.stringify(results, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) process.exitCode = 1
