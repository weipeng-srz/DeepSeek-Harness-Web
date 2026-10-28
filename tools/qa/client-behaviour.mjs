// Client behaviour regressions. Each case is a bug that was confirmed in a
// real browser against this app; the assertions encode the behaviour we want,
// not the implementation that happens to produce it.
//
// Scope: navigation races (send/upload/attach/create), focus safety, degraded
// storage, per-conversation state, and print-during-stream.
import { createSandbox, launchBrowser, loginPage, sleep } from './quality-harness.mjs'

const results = []
function record(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const PORT = Number(process.env.QA_PORT || 8817)
const seeded = [
  {
    id: 'conv-alpha',
    title: '对话甲',
    updatedAt: Date.now() - 1000,
    messages: [
      { role: 'user', text: '你好，甲' },
      { role: 'assistant', text: '我是甲的回答', status: 'done' },
    ],
  },
  {
    id: 'conv-beta',
    title: '对话乙',
    updatedAt: Date.now() - 2000,
    messages: [
      { role: 'user', text: '你好，乙' },
      { role: 'assistant', text: '我是乙的回答', status: 'done' },
    ],
  },
]

// A page-level fetch shim for /chat that we control frame by frame. Tests only
// need the client's behaviour, not a live agent.
const mockInit = () => {
  const realFetch = window.fetch.bind(window)
  window.__mock = { chat: null, bodies: [], hold: null, delay: 0 }
  window.fetch = async function (input, init) {
    const raw = typeof input === 'string' ? input : input?.url || ''
    let url = null
    try { url = new URL(raw, location.href) } catch {}
    if (!url) return realFetch(input, init)
    if (/\/chat$/.test(url.pathname)) {
      try { window.__mock.bodies.push(JSON.parse(init?.body || '{}')) } catch {}
      if (window.__mock.delay) await new Promise((r) => setTimeout(r, window.__mock.delay))
      if (window.__mock.chat === 'error') {
        return new Response(JSON.stringify({ error: '服务端模拟失败' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
      }
      const stream = new ReadableStream({
        start(controller) {
          window.__mock.hold = controller
          init?.signal?.addEventListener('abort', () => {
            try { controller.error(new DOMException('Aborted', 'AbortError')) } catch {}
          }, { once: true })
        },
      })
      return new Response(stream, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } })
    }
    if (/\/attach$/.test(url.pathname)) {
      const stream = new ReadableStream({
        start(controller) { window.__mock.attach = controller },
        cancel() {},
      })
      return new Response(stream, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } })
    }
    if (/\/upload$/.test(url.pathname)) {
      if (window.__mock.delay) await new Promise((r) => setTimeout(r, window.__mock.delay))
      return realFetch(input, init)
    }
    return realFetch(input, init)
  }
  window.__emit = (event) => {
    try { window.__mock.hold?.enqueue(new TextEncoder().encode(JSON.stringify(event) + '\n')) } catch {}
  }
  window.__emitAttach = (event) => {
    try { window.__mock.attach?.enqueue(new TextEncoder().encode(JSON.stringify(event) + '\n')) } catch {}
  }
}

async function withPage(sandbox, run, options = {}) {
  const browser = await launchBrowser()
  try {
    const context = await browser.newContext({ viewport: options.viewport || { width: 1280, height: 900 }, serviceWorkers: 'block' })
    if (options.blockStorage) {
      await context.addInitScript(() => {
        Object.defineProperty(window, 'localStorage', {
          configurable: true,
          get() { throw new DOMException('Access is denied for this document.', 'SecurityError') },
        })
      })
    }
    await context.addInitScript(mockInit)
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(String(error)))
    await run(page, context, errors)
  } finally {
    await browser.close().catch(() => {})
  }
}

const sandbox = await createSandbox({ port: PORT, label: 'client-behaviour', seedConversations: seeded })
try {
  // 1. Blocked storage must not kill the app before login.
  await withPage(sandbox, async (page, context, errors) => {
    await page.goto(sandbox.base + '/')
    await sleep(700)
    const loginVisible = await page.locator('#loginView').isVisible()
    let loggedIn = false
    try {
      await page.locator('#accessCode').fill(sandbox.code)
      await page.locator('#loginBtn').click()
      await page.locator('#shell').waitFor({ state: 'visible', timeout: 5000 })
      loggedIn = true
    } catch {}
    record('blocked localStorage still renders login and can sign in', loginVisible && loggedIn, `login=${loginVisible}`)
    record('blocked localStorage raises no page errors', errors.length === 0, errors.slice(0, 2).join(' | '))
  }, { blockStorage: true })

  // 2. Crossing the breakpoint must not leave the main pane inert.
  await withPage(sandbox, async (page) => {
    await loginPage(page, sandbox)
    await page.setViewportSize({ width: 800, height: 900 })
    await sleep(300)
    await page.locator('#menuBtn').click()
    await sleep(300)
    const opened = await page.evaluate(() => ({ inert: document.querySelector('.main').inert }))
    await page.setViewportSize({ width: 1280, height: 900 })
    await sleep(400)
    const after = await page.evaluate(() => ({
      mainInert: document.querySelector('.main').inert,
      sidebarInert: document.querySelector('#sidebar').inert,
      sidebarHidden: document.querySelector('#sidebar').getAttribute('aria-hidden'),
    }))
    let typed = ''
    try {
      await page.locator('#input').click({ timeout: 2000 })
      await page.locator('#input').fill('侧栏后遗症')
      typed = await page.locator('#input').inputValue()
    } catch {}
    record('breakpoint change releases the mobile drawer lock', opened.inert === true && after.mainInert === false, JSON.stringify({ opened, after }))
    record('composer is usable after the breakpoint change', typed === '侧栏后遗症')

    await page.setViewportSize({ width: 800, height: 900 })
    await sleep(400)
    const closed = await page.evaluate(() => ({
      inert: document.querySelector('#sidebar').inert,
      hidden: document.querySelector('#sidebar').getAttribute('aria-hidden'),
    }))
    record('closed mobile drawer is hidden from assistive tech', closed.inert === true && closed.hidden === 'true', JSON.stringify(closed))
  })

  // 3. An approval must not steal focus from the composer.
  await withPage(sandbox, async (page) => {
    await loginPage(page, sandbox)
    await page.locator('#input').fill('继续打字中')
    await page.locator('#sendBtn').click()
    await sleep(400)
    await page.evaluate(() => window.__emit({ t: 'ready', messageId: 'mock-assistant', title: '对话甲' }))
    await page.evaluate(() => window.__emit({ t: 'approval', requestId: 'req-1', toolName: 'bash', callId: 'c1', reason: '需要运行命令' }))
    await sleep(500)
    const focus = await page.evaluate(() => ({ id: document.activeElement?.id, allow: Boolean(document.activeElement?.classList?.contains('allow')) }))
    record('incoming approval keeps focus in the composer', focus.id === 'input' && !focus.allow, JSON.stringify(focus))
  })

  // 4. Switching conversations while an upload is in flight cancels the send.
  await withPage(sandbox, async (page) => {
    await loginPage(page, sandbox)
    await page.locator('.conv-item', { hasText: '对话乙' }).first().locator('.conv-main').click()
    await sleep(400)
    await page.locator('#newChat').click()
    await sleep(300)
    await page.setInputFiles('#fileInput', { name: 'race.txt', mimeType: 'text/plain', buffer: Buffer.from('race') })
    await sleep(400)
    const staged = await page.locator('#attachmentTray .attachment-chip').count()
    record('file staging works before the upload race', staged === 1, String(staged))
    await page.route('**/api/conversations/*/upload*', async (route) => {
      await sleep(1400)
      await route.continue()
    })
    await page.locator('#input').fill('附件消息应留在空对话')
    await page.locator('#sendBtn').click()
    await sleep(250)
    await page.locator('.conv-item', { hasText: '对话甲' }).first().locator('.conv-main').click()
    await sleep(1800)
    const state = await page.evaluate(() => ({
      path: location.pathname,
      bubbles: [...document.querySelectorAll('.msg.user .msg-text, .bubble')].map((n) => n.textContent.trim()).filter(Boolean),
      input: document.querySelector('#input').value,
      bodies: window.__mock.bodies.map((body) => body.text),
    }))
    const leaked = state.bubbles.some((text) => text.includes('附件消息应留在空对话'))
    record('upload race does not post or render into the other conversation', !leaked && !state.bodies.includes('附件消息应留在空对话'), JSON.stringify(state))
    record('upload race keeps the unsent text in the composer', state.input.includes('附件消息应留在空对话'), state.input)
  })

  // 5. Creating a conversation must not hijack navigation.
  await withPage(sandbox, async (page) => {
    await loginPage(page, sandbox)
    await page.route('**/api/conversations', async (route) => {
      if (route.request().method() === 'POST') await sleep(900)
      await route.continue()
    })
    await page.locator('#newChat').click()
    await sleep(200)
    await page.locator('#input').fill('这条消息应该留在新对话里')
    await page.locator('#sendBtn').click()
    await sleep(250)
    await page.locator('.conv-item', { hasText: '对话乙' }).first().locator('.conv-main').click()
    await sleep(1500)
    const state = await page.evaluate(() => ({ path: location.pathname, input: document.querySelector('#input').value, thread: document.querySelector('#thread').textContent }))
    record('slow create does not switch away from the opened conversation', state.path === '/c/conv-beta', state.path)
    record('slow create leaves the other thread untouched', !state.thread.includes('这条消息应该留在新对话里'), state.thread.slice(0, 60))
  })

  // 6. An attach replay must not paint into a conversation the user switched to.
  await withPage(sandbox, async (page) => {
    await loginPage(page, sandbox)
    await page.evaluate(() => { window.__mock.delay = 0 })
    await page.locator('.conv-item', { hasText: '对话甲' }).first().locator('.conv-main').click()
    await sleep(400)
    // Start a mocked run, then leave the conversation before its first frame.
    await page.locator('#input').fill('运行中的对话')
    await page.locator('#sendBtn').click()
    await sleep(300)
    await page.locator('.conv-item', { hasText: '对话乙' }).first().locator('.conv-main').click()
    await sleep(400)
    await page.evaluate(() => {
      window.__emitAttach({ t: 'reset', messageId: 'msg-run' })
      window.__emitAttach({ t: 'text', text: '这是旧对话恢复出来的回答' })
    })
    await sleep(500)
    const state = await page.evaluate(() => ({
      thread: document.querySelector('#thread').textContent,
      stop: document.querySelector('#sendBtn').classList.contains('stop'),
    }))
    record('attach replay does not leak into another conversation', !state.thread.includes('这是旧对话恢复出来的回答'), state.thread.slice(0, 80))
    record('attach replay does not arm the stop button', state.stop === false)
  })

  // 7. A slow conversation load must not overwrite live typing.
  await withPage(sandbox, async (page) => {
    await loginPage(page, sandbox)
    await page.locator('.conv-item', { hasText: '对话甲' }).first().locator('.conv-main').click()
    await sleep(300)
    await page.route('**/api/conversations/conv-beta?tail=60', async (route) => {
      await sleep(1400)
      await route.continue()
    })
    await page.locator('.conv-item', { hasText: '对话乙' }).first().locator('.conv-main').click()
    await sleep(300)
    await page.locator('#input').fill('用户正在输入的一段话')
    await sleep(1600)
    const input = await page.locator('#input').inputValue()
    record('slow load does not wipe text typed meanwhile', input === '用户正在输入的一段话', input)
  })

  // 8. Regenerate-with-instruction must send the instruction.
  await withPage(sandbox, async (page) => {
    await loginPage(page, sandbox)
    await page.locator('.conv-item', { hasText: '对话甲' }).first().locator('.conv-main').click()
    await sleep(400)
    await page.locator('.msg.assistant button[aria-label="重新生成回答"]').first().click()
    await sleep(400)
    await page.locator('#regenerateInstruction').fill('请用一句话回答，并加上标题')
    await page.locator('#regenerateRun').click()
    await sleep(700)
    const bodies = await page.evaluate(() => window.__mock.bodies)
    const withInstruction = bodies.find((body) => body.instruction)
    record('regenerate sends the instruction to the server', Boolean(withInstruction), JSON.stringify(bodies))

    // 9. The conversation popover is keyboard operable and does not stop the run.
    await page.evaluate(() => window.__emit({ t: 'status', phase: 'step_start' }))
    await sleep(200)
    await page.locator('.conv-item.active .conv-more').first().click()
    await sleep(250)
    const before = await page.evaluate(() => ({ open: Boolean(document.querySelector('.conv-popover')), active: document.activeElement?.textContent?.trim() }))
    await page.keyboard.press('ArrowDown')
    const afterArrow = await page.evaluate(() => document.activeElement?.textContent?.trim())
    await page.keyboard.press('Escape')
    await sleep(200)
    const afterEsc = await page.evaluate(() => ({ open: Boolean(document.querySelector('.conv-popover')), stop: document.querySelector('#sendBtn').classList.contains('stop') }))
    record('popover opens on the first item', before.open === true, JSON.stringify(before))
    record('arrow keys move inside the popover', afterArrow && afterArrow !== before.active, `${before.active} → ${afterArrow}`)
    record('Escape closes the popover without stopping the run', afterEsc.open === false && afterEsc.stop === true, JSON.stringify(afterEsc))
  })

  // 10. A rejected send must not leave a phantom bubble.
  await withPage(sandbox, async (page) => {
    await loginPage(page, sandbox)
    await page.locator('.conv-item', { hasText: '对话甲' }).first().locator('.conv-main').click()
    await sleep(300)
    await page.evaluate(() => { window.__mock.chat = 'error' })
    await page.locator('#input').fill('这条会失败')
    await page.locator('#sendBtn').click()
    await sleep(1200)
    const state = await page.evaluate(() => ({ text: document.querySelector('#thread').textContent, input: document.querySelector('#input').value }))
    record('rejected send rolls back the optimistic bubble', !state.text.includes('这条会失败'), state.text.slice(0, 60))
    record('rejected send returns the text to the composer', state.input === '这条会失败', state.input)
  })

  // 11. The DSH model picker belongs to a compact strip immediately above the
  // composer. It used to float over the input's top edge; the panel then
  // anchored to the pill and covered the textarea as well.
  await withPage(sandbox, async (page) => {
    await loginPage(page, sandbox)
    await page.locator('.conv-item', { hasText: '对话甲' }).first().locator('.conv-main').click()
    await sleep(900)
    const layout = await page.evaluate(() => {
      const pill = document.querySelector('#dshModelFootBtn')
      const bar = document.querySelector('#modelBar')
      const composer = document.querySelector('#composer')
      if (!pill || !bar || !composer) return null
      const p = pill.getBoundingClientRect()
      const c = composer.getBoundingClientRect()
      return {
        inModelBar: pill.parentElement === bar,
        barBeforeComposer: bar.nextElementSibling === composer,
        barHidden: bar.hidden,
        position: getComputedStyle(pill).position,
        pillBottom: p.bottom,
        pillHeight: p.height,
        composerTop: c.top,
      }
    })
    record(
      'DSH model picker sits in the strip above the composer',
      Boolean(layout && layout.inModelBar && layout.barBeforeComposer && !layout.barHidden && layout.position !== 'absolute' && layout.position !== 'fixed' && layout.pillHeight > 0),
      JSON.stringify(layout),
    )
    record(
      'DSH model picker stays above the input row',
      Boolean(layout && layout.pillBottom <= layout.composerTop),
      JSON.stringify(layout),
    )
  })

  // 12. Conversation pages show no title and the transcript starts at the page
  // top; the floating topbar must not shrink the scroll viewport.
  await withPage(sandbox, async (page) => {
    await loginPage(page, sandbox)
    await page.locator('.conv-item', { hasText: '对话甲' }).first().locator('.conv-main').click()
    await sleep(900)
    const before = await page.evaluate(() => {
      const sa = document.querySelector('#scrollArea').getBoundingClientRect()
      const bar = document.querySelector('.topbar')
      const thread = document.querySelector('#thread')
      return {
        title: getComputedStyle(document.querySelector('#chatInfoBtn')).display,
        scrollTop: Math.round(sa.top),
        topbarPosition: getComputedStyle(bar).position,
        barTop: Math.round(bar.getBoundingClientRect().top),
        barBottom: Math.round(bar.getBoundingClientRect().bottom),
        threadTop: Math.round(thread.getBoundingClientRect().top),
        threadPaddingTop: parseFloat(getComputedStyle(thread).paddingTop),
      }
    })
    record('conversation page does not display the conversation title', before.title === 'none', JSON.stringify(before))
    record(
      'topbar is in flow and does not cover the transcript',
      before.scrollTop === 0 && before.barTop === 0 && before.topbarPosition !== 'absolute' && before.topbarPosition !== 'fixed' && before.threadTop >= before.barBottom,
      JSON.stringify(before),
    )
    const after = await page.evaluate(async () => {
      const sa = document.querySelector('#scrollArea')
      // Short seeded conversations do not overflow at 900px; give the test a
      // deterministic scroll range without touching product data.
      const spacer = document.createElement('div')
      spacer.style.height = '1200px'
      document.querySelector('#thread').appendChild(spacer)
      sa.scrollTop = 220
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const bar = document.querySelector('.topbar')
      return {
        scrollTop: Math.round(sa.scrollTop),
        scrolledClass: bar.classList.contains('is-scrolled'),
        barTop: Math.round(bar.getBoundingClientRect().top),
        barBottom: Math.round(bar.getBoundingClientRect().bottom),
        threadTop: Math.round(document.querySelector('#thread').getBoundingClientRect().top),
      }
    })
    record(
      'scrolling keeps the topbar pinned while the transcript runs underneath',
      after.scrollTop > 0 && after.scrolledClass && after.barTop === 0 && after.barBottom > 0 && after.threadTop < 0,
      JSON.stringify(after),
    )
  })
} finally {
  await sandbox.stop().catch(() => {})
}

const failed = results.filter((item) => !item.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) process.exitCode = 1
