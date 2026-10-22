// UX/QA audit harness: runs the real app in headless Chrome, measures usability signals.
import { openApp, login, closeTab } from './cdp.mjs'

const OUT = process.env.AUDIT_OUT || '/tmp/dsh-audit.json'
const findings = { console: [], pageErrors: [], network: [], measurements: {}, flows: {} }

function attachDiagnostics(cdp) {
  cdp.on('Runtime.consoleAPICalled', (params) => {
    if (!['error', 'warning'].includes(params.type)) return
    findings.console.push({
      type: params.type,
      text: params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 500),
    })
  })
  cdp.on('Runtime.exceptionThrown', (params) => {
    findings.pageErrors.push(
      (params.exceptionDetails?.exception?.description || params.exceptionDetails?.text || '').slice(0, 500),
    )
  })
  cdp.on('Network.loadingFailed', (params) => {
    if (params.canceled) return
    findings.network.push({ error: params.errorText, type: params.type })
  })
}

const measureScript = `(() => {
  const out = {}
  const root = document.documentElement
  out.viewport = { w: innerWidth, h: innerHeight, dpr: devicePixelRatio }
  out.doc = { scrollW: root.scrollWidth, clientW: root.clientWidth, scrollH: root.scrollHeight }
  out.horizontalOverflow = root.scrollWidth > root.clientWidth + 1
  const overflowing = []
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) continue
    if (r.right > innerWidth + 1 || r.left < -1) {
      const style = getComputedStyle(el)
      if (style.position === 'fixed') continue
      overflowing.push({ tag: el.tagName, cls: String(el.className).slice(0, 80), left: Math.round(r.left), right: Math.round(r.right) })
    }
  }
  out.overflowing = overflowing.slice(0, 20)
  const small = []
  for (const el of document.querySelectorAll('button, a[href], input, textarea, select, [role="button"], [role="radio"]')) {
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) continue
    const style = getComputedStyle(el)
    if (style.visibility === 'hidden' || style.display === 'none') continue
    if (r.width < 44 || r.height < 44) {
      small.push({
        tag: el.tagName,
        id: el.id,
        cls: String(el.className).slice(0, 60),
        label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40),
        w: Math.round(r.width), h: Math.round(r.height),
      })
    }
  }
  out.smallTargets = small.slice(0, 60)
  out.smallTargetCount = small.length
  const unlabeled = []
  for (const el of document.querySelectorAll('button, [role="button"], a[href]')) {
    const text = (el.getAttribute('aria-label') || el.textContent || el.title || '').trim()
    if (!text) unlabeled.push({ tag: el.tagName, id: el.id, cls: String(el.className).slice(0, 50) })
  }
  out.unlabeled = unlabeled.slice(0, 20)
  out.imagesNoAlt = [...document.images].filter((img) => !img.hasAttribute('alt')).length
  out.headings = [...document.querySelectorAll('h1,h2,h3,h4')].map((h) => h.tagName + ':' + h.textContent.trim().slice(0, 40))
  const sizes = {}
  for (const el of document.querySelectorAll('p, .md, .bubble, .conv-title, .conv-meta, button')) {
    const s = getComputedStyle(el).fontSize
    sizes[s] = (sizes[s] || 0) + 1
  }
  out.fontSizes = sizes
  const c = document.createElement('canvas').getContext('2d')
  c.font = '16px -apple-system'
  out.time = Date.now()
  out.title = document.title
  out.bodyText = document.body.innerText.slice(0, 500)
  return out
})()`

async function main() {
  const mobile = process.env.MOBILE !== '0'
  const width = mobile ? 390 : 1280
  const height = mobile ? 844 : 900
  const { cdp, tab } = await openApp({ width, height, mobile })
  attachDiagnostics(cdp)
  await cdp.waitFor(() => cdp.eval('document.readyState === "complete"'), 15_000)
  const loggedIn = await login(cdp)
  await new Promise((resolve) => setTimeout(resolve, 900))

  findings.flows.login = loggedIn
  findings.flows.viewport = mobile ? 'mobile' : 'desktop'

  const base = await cdp.eval(measureScript)
  findings.measurements.empty = base
  findings.flows.shellVisible = await cdp.eval('!document.querySelector("#shell").hidden')
  findings.flows.scenarioCards = await cdp.eval('document.querySelectorAll("#scenarioGrid [data-scenario]").length')
  findings.flows.conversationCount = await cdp.eval('document.querySelectorAll("#convList .conv-item").length')
  findings.flows.emptyVisible = await cdp.eval('!document.querySelector("#emptyState").hidden')

  // scenario sheet
  findings.flows.scenarios = await cdp.eval(`(async () => {
    document.querySelector('#scenarioBtn').click()
    await new Promise(r => setTimeout(r, 250))
    const sheet = document.querySelector('#scenarioSheet')
    const open = !sheet.hidden
    const focusInside = sheet.contains(document.activeElement)
    const cards = sheet.querySelectorAll('[data-scenario]').length
    const sheetRect = sheet.querySelector('.sheet-panel').getBoundingClientRect()
    document.querySelector('[data-scenario-close]').click()
    await new Promise(r => setTimeout(r, 250))
    return { open, focusInside, cards, panelH: Math.round(sheetRect.height), closed: sheet.hidden, focusRestored: document.activeElement?.id }
  })()`)

  // permission menu
  findings.flows.permission = await cdp.eval(`(async () => {
    document.querySelector('#permissionBtn').click()
    await new Promise(r => setTimeout(r, 200))
    const menu = document.querySelector('#permissionMenu')
    const open = !menu.hidden
    const options = menu.querySelectorAll('.permission-option').length
    const focusInside = menu.contains(document.activeElement)
    const rect = menu.getBoundingClientRect()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await new Promise(r => setTimeout(r, 150))
    return { open, options, focusInside, closed: menu.hidden, rect: { top: Math.round(rect.top), h: Math.round(rect.height) } }
  })()`)

  // sidebar
  findings.flows.sidebar = await cdp.eval(`(async () => {
    const wasOpen = document.body.classList.contains('sidebar-open')
    document.querySelector('#menuBtn').click()
    await new Promise(r => setTimeout(r, 350))
    const open = document.body.classList.contains('sidebar-open')
    const sb = document.querySelector('#sidebar')
    const rect = sb.getBoundingClientRect()
    const inert = sb.inert
    const searchVisible = document.querySelector('#convSearch').getBoundingClientRect().width > 0
    const focusInside = sb.contains(document.activeElement)
    if (open) document.querySelector('#scrim').click()
    await new Promise(r => setTimeout(r, 350))
    return { wasOpen, open, width: Math.round(rect.width), inertWhenOpen: inert, searchVisible, focusInside, closed: !document.body.classList.contains('sidebar-open') }
  })()`)

  // open most recent conversation
  findings.flows.conversation = await cdp.eval(`(async () => {
    const item = document.querySelector('#convList .conv-main')
    if (!item) return { skipped: true }
    item.click()
    await new Promise(r => setTimeout(r, 900))
    const msgs = document.querySelectorAll('#thread .msg').length
    const scroll = document.querySelector('#scrollArea')
    return {
      msgs, title: document.querySelector('#topbarName').textContent,
      filesBar: !document.querySelector('#filesBar').hidden,
      scrollH: scroll.scrollHeight, clientH: scroll.clientHeight,
      composerBottom: Math.round(document.querySelector('#composer').getBoundingClientRect().bottom),
      viewportH: innerHeight,
      actions: document.querySelectorAll('#thread .msg-actions').length,
    }
  })()`)

  const after = await cdp.eval(measureScript)
  findings.measurements.conversation = after

  // theme
  findings.flows.theme = await cdp.eval(`(async () => {
    const before = document.documentElement.dataset.theme || 'auto'
    document.querySelector('#themeBtn').click()
    await new Promise(r => setTimeout(r, 120))
    const after = document.documentElement.dataset.theme || 'auto'
    document.querySelector('#themeBtn').click()
    await new Promise(r => setTimeout(r, 120))
    return { before, after, restored: document.documentElement.dataset.theme || 'auto' }
  })()`)

  // responsive screenshot for the deliverable
  await cdp.screenshot(`/tmp/dsh-audit-${mobile ? 'mobile' : 'desktop'}.png`)

  const cacheInfo = await cdp.eval(`(() => {
    const raw = localStorage.getItem('dsh.cache.v1') || ''
    return { cacheBytes: raw.length, keys: Object.keys(localStorage) }
  })()`)
  findings.measurements.localStorage = cacheInfo

  console.log(JSON.stringify(findings, null, 2))
  const fs = await import('node:fs')
  fs.writeFileSync(OUT, JSON.stringify(findings, null, 2))
  cdp.close()
  await closeTab(tab.id)
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
