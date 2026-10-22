// Opt-in acceptance against the user's configured local engines. This creates
// two explicitly named QA conversations and archives only those at the end.
// Credentials stay in memory; no model/tool calls are made without QA_LIVE=1.
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, launchBrowser, sleep } from './quality-harness.mjs'
if (process.env.QA_LIVE !== '1') throw new Error('Set QA_LIVE=1 to run real local engine acceptance')
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'))
const base = `http://127.0.0.1:${config.port || 8787}`
const out = path.join(ROOT, 'reports/quality', process.env.QA_LABEL || 'round5')
fs.mkdirSync(out, { recursive: true })
const expectedApp = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8').match(/\/js\/app\.js\?v=\d+/)?.[0]
const results = [], created = []
const browser = await launchBrowser()
const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, serviceWorkers: 'block' })
const page = await context.newPage()
page.setDefaultTimeout(15_000)
const api = async (url, { method = 'GET', data } = {}) => {
  const response = await context.request.fetch(base + url, { method, data })
  if (!response.ok()) throw new Error(`${method} ${url}: ${response.status()}`)
  return response.json()
}
const record = (name, passed, evidence) => {
  results.push({ name, status: passed ? 'passed' : 'failed', evidence })
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`)
}
async function waitConversation(id, predicate, timeout = 60_000) {
  const until = Date.now() + timeout
  while (Date.now() < until) {
    const { conversation } = await api(`/api/conversations/${id}`)
    if (predicate(conversation)) return conversation
    await sleep(300)
  }
  throw new Error(`Timed out waiting for QA conversation ${id}`)
}
const lastAssistant = conv => conv.messages.filter(message => message.role === 'assistant').at(-1)
async function sendAndFinish(id, text, timeout) {
  const before = (await api(`/api/conversations/${id}`)).conversation.messages.length
  await page.locator('#input').fill(text)
  const at = performance.now()
  await page.locator('#sendBtn').click()
  const conv = await waitConversation(id, c => c.messages.length > before && !c.running && ['done', 'error', 'stopped'].includes(lastAssistant(c)?.status), timeout)
  await page.locator('#sendBtn[aria-label="发送"]').waitFor()
  return { conv, message: lastAssistant(conv), durationMs: Math.round(performance.now() - at) }
}
async function create(engine) {
  const { conversation } = await api('/api/conversations', { method: 'POST', data: { engine, permission: 'read-only' } })
  created.push(conversation.id)
  await api(`/api/conversations/${conversation.id}`, { method: 'PATCH', data: { title: `QA 最终验收 · ${engine.toUpperCase()}` } })
  await page.goto(`${base}/c/${conversation.id}`)
  await page.locator('#input').waitFor({ state: 'visible' })
  return conversation.id
}
try {
  await page.goto(base)
  await page.locator('#accessCode').fill(config.accessCode)
  await page.locator('#loginBtn').click()
  await page.locator('#shell').waitFor({ state: 'visible' })
  const me = await api('/api/me')
  record('latest local app and configured engines are available', me.native && me.codex && await page.locator(`script[src="${expectedApp}"]`).count() === 1, { native: me.native, codex: me.codex, codexReady: me.codexReady })
  const active = (await api('/api/conversations?limit=300')).conversations.filter(conv => conv.running)
  if (active.length) throw new Error('Another conversation is running; live acceptance deferred')

  const dsr = await create('dsr')
  const first = await sendAndFinish(dsr, '这是本地网页验收。请记住握手数字7429，只回复“握手7429”。不要调用工具。')
  record('real DSR reply completes and is visible', first.message.status === 'done' && first.message.text.includes('7429') && (await page.locator('#thread').innerText()).includes('7429'), { conversationId: dsr, sessionId: first.conv.dshSessionId, status: first.message.status, text: first.message.text, durationMs: first.durationMs })
  if (first.message.status !== 'done') throw new Error('DSR did not finish first turn')
  await page.locator('#input').fill('请从1连续数到1000，每行一个数字，不要使用任何工具。我会在生成过程中点击停止。')
  await page.locator('#sendBtn').click()
  await page.locator('#sendBtn[aria-label="停止生成"]').waitFor()
  // Native deltas are rendered immediately but persisted as text at block
  // completion. Observe the live DOM, not the eventual stored message text.
  await page.waitForFunction(() => document.querySelector('#sendBtn.stop') &&
    [...document.querySelectorAll('#thread .msg.assistant')].at(-1)?.querySelector('.md')?.textContent.length > 0, null, { timeout: 60_000 })
  const streamedCharacters = await page.locator('#thread .msg.assistant').last().locator('.md').first().innerText().then(text => text.length)
  const generating = (await api(`/api/conversations/${dsr}`)).conversation
  const stopAt = performance.now()
  await page.locator('#sendBtn').click()
  const stopped = await waitConversation(dsr, c => !c.running && lastAssistant(c)?.status !== 'running', 15_000)
  const stoppedMessage = lastAssistant(stopped)
  record('real DSR stop terminates an active streamed reply', generating.running && stoppedMessage.status === 'stopped' && await page.locator('#sendBtn').getAttribute('aria-label') === '发送', { status: stoppedMessage.status, streamedCharacters, stopMs: Math.round(performance.now() - stopAt) })
  const resumed = await sendAndFinish(dsr, '停止计数。请只回复第一条消息中的四位握手数字，不要调用工具。')
  record('real DSR resumes same session and remembers prior context', resumed.message.status === 'done' && resumed.message.text.includes('7429') && resumed.conv.dshSessionId === first.conv.dshSessionId, { status: resumed.message.status, text: resumed.message.text, sameSession: resumed.conv.dshSessionId === first.conv.dshSessionId, durationMs: resumed.durationMs })
  await page.reload(); await page.locator('#thread .msg.assistant').last().waitFor()
  record('real DSR history persists after browser reload', (await page.locator('#thread').innerText()).includes(resumed.message.text), { assistantMessages: await page.locator('#thread .msg.assistant').count() })
  await page.waitForFunction(() => [...document.querySelectorAll('#thread .msg')].every(node => Number(getComputedStyle(node).opacity) >= .99))
  await page.screenshot({ path: path.join(out, 'native-dsr.png'), fullPage: true })

  const codex = await create('codex')
  const codexReply = await sendAndFinish(codex, '这是本地网页连接验收。只回复“Codex 网页验收通过”。不要调用工具，不要读取或修改文件。', 90_000)
  record('real Codex basic reply completes and is visible', codexReply.message.status === 'done' && codexReply.message.text.includes('Codex') && (await page.locator('#thread').innerText()).includes('Codex'), { conversationId: codex, threadId: codexReply.conv.codexThreadId, status: codexReply.message.status, text: codexReply.message.text, durationMs: codexReply.durationMs })
  await page.waitForFunction(() => [...document.querySelectorAll('#thread .msg')].every(node => Number(getComputedStyle(node).opacity) >= .99))
  await page.screenshot({ path: path.join(out, 'native-codex.png'), fullPage: true })
} catch (error) {
  results.push({ name: 'live acceptance execution', status: 'blocked', evidence: { error: error.message } })
  console.error(error.message)
} finally {
  for (const id of created) {
    try { await api(`/api/conversations/${id}/stop`, { method: 'POST' }); await waitConversation(id, c => !c.running, 15_000); await api(`/api/conversations/${id}`, { method: 'PATCH', data: { archived: true } }) }
    catch (error) { results.push({ name: 'QA conversation cleanup', status: 'blocked', evidence: { id, error: error.message } }) }
  }
  fs.writeFileSync(path.join(out, 'native.json'), JSON.stringify({ generatedAt: new Date().toISOString(), scope: 'Real local server and installed DSR/Codex accounts; Playwright UI send/stop/reload, no mocked streams, read-only QA conversations only; real tool execution and approvals not covered.', results }, null, 2))
  await browser.close()
}
