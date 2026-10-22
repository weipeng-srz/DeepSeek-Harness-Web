// Regression: stopping a headless run keeps the visible partial answer and
// the headless child receives the permission mode shown in the UI.
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, createSandbox, sleep } from './quality-harness.mjs'

const results = []
function record(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const sandbox = await createSandbox({
  port: Number(process.env.QA_PORT || 8813),
  label: 'v5-stop',
  appBinary: '/tmp/fake-dsh.sh',
})
console.log(`SANDBOX ${sandbox.base}`)
const api = sandbox.api
try {
  const conv = (await api('/api/conversations', { method: 'POST', body: JSON.stringify({ engine: 'dsr', permission: 'read-only' }) })).body.conversation
  const cookie = sandbox.cookie
  const chat = await fetch(`${sandbox.base}/api/conversations/${conv.id}/chat`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: '请开始一个长任务' }),
  })
  record('chat stream starts', chat.status === 200, String(chat.status))
  const reader = chat.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let sawPartial = false
  const deadline = Date.now() + 6000
  while (Date.now() < deadline && !sawPartial) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let index
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index).trim()
      buffer = buffer.slice(index + 1)
      if (!line) continue
      let event
      try {
        event = JSON.parse(line)
      } catch {
        continue
      }
      if (event.t === 'text' && event.text.includes('partial answer')) {
        sawPartial = true
        record('stream delivers partial text before stop', event.text.includes('MODE:read-only'), event.text)
        break
      }
    }
  }
  record('partial answer is visible', sawPartial)
  await api(`/api/conversations/${conv.id}/stop`, { method: 'POST' })
  await reader.cancel().catch(() => {})
  await sleep(1200)
  const saved = (await api(`/api/conversations/${conv.id}`)).body.conversation
  const assistant = saved.messages.find((msg) => msg.role === 'assistant')
  record('stopped run persists the partial answer', Boolean(assistant?.text?.includes('partial answer')), assistant?.text)
  record('stopped run is marked stopped', assistant?.status === 'stopped', assistant?.status)
  record('headless received read-only permission', assistant?.text?.includes('MODE:read-only'), assistant?.text)
} finally {
  await sandbox.stop().catch(() => {})
}

const failed = results.filter((item) => !item.ok)
fs.mkdirSync(path.join(ROOT, 'reports/v5/round-2'), { recursive: true })
fs.writeFileSync(path.join(ROOT, 'reports/v5/round-2/stop-qa.json'), JSON.stringify(results, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) process.exitCode = 1
