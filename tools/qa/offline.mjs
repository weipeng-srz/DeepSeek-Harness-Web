// Offline-send recovery: message must survive, show retry, and succeed after reconnect.
import { openApp, closeTab } from './cdp.mjs'

async function main() {
  const { cdp, tab } = await openApp({ width: 390, height: 844, mobile: true })
  await new Promise((r) => setTimeout(r, 900))
  const results = []
  const record = (name, ok, detail = '') => {
    results.push({ name, ok })
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  }

  const conv = await cdp.eval(`fetch('/api/conversations', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ engine: 'dsr' }),
  }).then(r => r.json()).then(d => d.conversation)`)
  await cdp.navigate('http://127.0.0.1:8787/')
  await new Promise((r) => setTimeout(r, 1200))
  await cdp.eval(`(() => {
    const item = document.querySelector('#convList .conv-item[data-id="${conv.id}"]')
    if (item) item.querySelector('.conv-main').click()
    return !!item
  })()`)
  await new Promise((r) => setTimeout(r, 900))
  await cdp.send('Network.emulateNetworkConditions', {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0,
    connectionType: 'none',
  })

  await cdp.eval(`(() => {
    const input = document.querySelector('#input')
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
    setter.call(input, '只回复数字 7，不要使用任何工具。')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    document.querySelector('#sendBtn').click()
    return true
  })()`)

  await cdp.waitFor(() => cdp.eval(`!!document.querySelector('#thread .msg-retry')`), 20_000, 200)
  const base = await cdp.eval(`document.querySelectorAll('#thread .msg.assistant').length`)
  const offline = await cdp.eval(`({
    error: document.querySelector('#thread .msg-error')?.innerText || '',
    retry: !!document.querySelector('#thread .msg-retry'),
    bubble: [...document.querySelectorAll('#thread .msg.user .bubble-text')].at(-1)?.textContent || '',
    banner: !document.querySelector('#reconnectBar').hidden,
    bannerHasRetry: !!document.querySelector('#reconnectBar .reconnect-retry'),
  })`)
  record('offline send keeps user bubble', offline.bubble.length > 0, JSON.stringify(offline))
  record('offline shows retry action', offline.retry && offline.error.length > 0, offline.error.slice(0, 40))
  record('connection banner offers retry', offline.banner && offline.bannerHasRetry)

  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
    connectionType: 'wifi',
  })
  await cdp.eval(`window.dispatchEvent(new Event('online'))`)
  await new Promise((r) => setTimeout(r, 400))
  cdp.on('Runtime.exceptionThrown', (params) => {
    console.log('EXC', params.exceptionDetails?.exception?.description || params.exceptionDetails?.text)
  })
  cdp.on('Runtime.consoleAPICalled', (params) => {
    if (params.type === 'error') console.log('CONSOLE', params.args.map((a) => a.value || a.description).join(' '))
  })
  const clicked = await cdp.eval(`(() => {
    const buttons = [...document.querySelectorAll('#thread .msg-retry')]
    const btn = buttons.at(-1)
    if (!btn) return { clicked: false, count: buttons.length }
    btn.click()
    return { clicked: true, count: buttons.length, text: btn.textContent }
  })()`)
  console.log('retry click', clicked)
  await cdp.waitFor(
    () => cdp.eval(`!document.querySelector('#sendBtn').classList.contains('stop') && (document.querySelector('#thread .msg.assistant .md')?.innerText || '').length > 0`),
    45_000,
    250,
  ).catch(async () => {
    console.log('POST-RETRY DUMP', await cdp.eval(`({
      stop: document.querySelector('#sendBtn').classList.contains('stop'),
      assistants: [...document.querySelectorAll('#thread .msg.assistant')].map(v => v.innerText.slice(0,120)),
      errors: [...document.querySelectorAll('.msg-error')].map(v => v.innerText),
      retries: document.querySelectorAll('#thread .msg-retry').length,
      toast: document.querySelector('#toast').innerText,
    })`))
  })
  const online = await cdp.eval(`({
    users: document.querySelectorAll('#thread .msg.user').length,
    assistants: document.querySelectorAll('#thread .msg.assistant').length,
    text: [...document.querySelectorAll('#thread .msg.assistant .md')].at(-1)?.innerText || '',
    lastUser: [...document.querySelectorAll('#thread .msg.user .bubble-text')].at(-1)?.textContent || '',
    banner: document.querySelector('#reconnectBar').hidden,
  })`)
  record(
    'retry after reconnect succeeds',
    online.text.length > 0 && /7/.test(online.text) && online.lastUser === '只回复数字 7，不要使用任何工具。',
    JSON.stringify({ base, ...online }),
  )
  record('banner hides after reconnect', online.banner)

  console.log(JSON.stringify({ results }, null, 2))
  cdp.close()
  await closeTab(tab.id)
  process.exit(results.every((r) => r.ok) ? 0 : 2)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
