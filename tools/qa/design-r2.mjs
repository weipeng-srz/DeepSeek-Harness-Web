// Design-review round 2 regression shots and measurements.
// Usage: OUT=reports/design-r2/after node tools/qa/design-r2.mjs
import fs from 'node:fs'
import path from 'node:path'
import { openApp, login, closeTab } from './cdp.mjs'

const ROOT = process.cwd()
const OUT = path.resolve(ROOT, process.env.OUT || 'reports/design-r2/after')
const APP = process.env.APP_URL || 'http://127.0.0.1:8787'
const LONG_CONV = '1acaf672-c230-4741-972f-20f412ea976b'
fs.mkdirSync(OUT, { recursive: true })

function localAccessCode() {
  if (process.env.ACCESS_CODE) return process.env.ACCESS_CODE
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8')).accessCode
  } catch {
    throw new Error('Set ACCESS_CODE or create config.json with an accessCode')
  }
}

const ACCESS_CODE = localAccessCode()

const results = {}

async function session(width, height, mobile = false, url = '/') {
  const { cdp, tab } = await openApp({ width, height, mobile })
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
  await cdp.navigate(`${APP}${url}`)
  await login(cdp, ACCESS_CODE)
  await new Promise((r) => setTimeout(r, 1400))
  return { cdp, tab }
}

async function shot(cdp, name) {
  await new Promise((r) => setTimeout(r, 350))
  const file = path.join(OUT, `${name}.png`)
  await cdp.screenshot(file)
  return file
}

const rect = (sel) => `(() => {
  const el = document.querySelector(${JSON.stringify(sel)})
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1), left: +r.left.toFixed(1), right: +r.right.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), hidden: el.hidden }
})()`

async function desktop() {
  const { cdp, tab } = await session(1440, 900)
  await cdp.eval(`document.querySelector('#newChat')?.click()`)
  await new Promise((r) => setTimeout(r, 900))
  await shot(cdp, 'desktop-home-dark')

  results.desktopHome = await cdp.eval(`(() => {
    const cards = [...document.querySelectorAll('.scenario-card')].map((el) => {
      const r = el.getBoundingClientRect()
      return { title: el.querySelector('.scenario-title')?.textContent, top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1), h: +r.height.toFixed(1) }
    })
    const grid = document.querySelector('.scenario-grid').getBoundingClientRect()
    const composer = document.querySelector('.composer').getBoundingClientRect()
    const sb = document.querySelector('#scrollBottom')
    return { cards, grid: { top: +grid.top.toFixed(1), bottom: +grid.bottom.toFixed(1) }, composerTop: +composer.top.toFixed(1), scrollBottomHidden: sb.hidden, note: document.querySelector('.scenario-note')?.textContent }
  })()`)

  await cdp.eval(`document.querySelector('#chatInfoBtn')?.click()`)
  await new Promise((r) => setTimeout(r, 300))
  await shot(cdp, 'desktop-chat-info')
  results.chatInfo = await cdp.eval(`(() => ({
    open: !document.querySelector('#chatInfo').hidden,
    title: document.querySelector('#chatInfoFullTitle').textContent,
    engine: document.querySelector('#chatInfoEngine').textContent,
    model: document.querySelector('#chatInfoModel').textContent,
    rect: (() => { const r = document.querySelector('#chatInfo').getBoundingClientRect(); return { top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1), left: +r.left.toFixed(1), right: +r.right.toFixed(1) } })()
  }))()`)
  await cdp.eval(`document.querySelector('#chatInfoClose')?.click()`)

  await cdp.eval(`document.querySelector('#engineInfoBtn')?.click()`)
  await new Promise((r) => setTimeout(r, 250))
  await shot(cdp, 'desktop-engine-info')
  await cdp.eval(`document.querySelector('#engineInfoBtn')?.click()`)

  await cdp.eval(`document.querySelector('#settingsBtn')?.click()`)
  await new Promise((r) => setTimeout(r, 450))
  await shot(cdp, 'desktop-settings-dark')
  results.desktopSettings = await cdp.eval(`(() => {
    const panel = document.querySelector('#settingsSheet .sheet-panel')
    const body = panel.querySelector('.settings-body')
    const foot = panel.querySelector('.settings-footwrap')
    const close = document.querySelector('[data-settings-close]').getBoundingClientRect()
    const p = panel.getBoundingClientRect(); const f = foot.getBoundingClientRect()
    const preview = document.querySelector('.settings-preview-text')
    const style = getComputedStyle(preview)
    const selected = document.querySelector('.settings-options button[aria-checked="true"]')
    const sstyle = getComputedStyle(selected)
    return {
      panel: { top: +p.top.toFixed(1), bottom: +p.bottom.toFixed(1), h: +p.height.toFixed(1), radius: getComputedStyle(panel).borderRadius },
      footInside: f.bottom <= p.bottom + 0.5,
      foot: { top: +f.top.toFixed(1), bottom: +f.bottom.toFixed(1) },
      bodyScroll: { scrollH: body.scrollHeight, clientH: body.clientHeight },
      close: { top: +close.top.toFixed(1), bottom: +close.bottom.toFixed(1), visible: close.top >= p.top && close.bottom <= p.bottom },
      preview: { font: style.fontSize, line: style.lineHeight },
      selected: { color: sstyle.color, bg: sstyle.backgroundColor, border: sstyle.borderColor },
      switch: (() => { const s = document.querySelector('#notifyToggle'); return { role: s.getAttribute('role'), checked: s.getAttribute('aria-checked'), text: s.textContent.trim(), thumb: getComputedStyle(s.querySelector('.switch-thumb')).transform } })(),
      footerText: document.querySelector('.settings-foot').textContent,
      storageInDetails: !!document.querySelector('.settings-storage #storageInfo'),
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
    }
  })()`)

  await cdp.eval(`document.querySelector('[data-font="1.1"]')?.click(); document.querySelector('[data-density="compact"]')?.click()`)
  await new Promise((r) => setTimeout(r, 350))
  await shot(cdp, 'desktop-settings-preview-large')
  results.previewLarge = await cdp.eval(`(() => { const s = getComputedStyle(document.querySelector('.settings-preview-text')); return { font: s.fontSize, line: s.lineHeight } })()`)
  await cdp.eval(`document.querySelector('[data-font="1"]')?.click(); document.querySelector('[data-density="comfortable"]')?.click()`)

  await cdp.eval(`document.querySelector('[data-theme-option="light"]')?.click()`)
  await new Promise((r) => setTimeout(r, 300))
  await shot(cdp, 'desktop-settings-light')
  results.lightSelected = await cdp.eval(`(() => { const s = getComputedStyle(document.querySelector('.settings-options button[aria-checked="true"]')); return { color: s.color, bg: s.backgroundColor } })()`)
  await cdp.eval(`document.querySelector('[data-theme-option="dark"]')?.click(); document.querySelector('[data-settings-close]')?.click()`)

  await cdp.navigate(`${APP}/c/${LONG_CONV}`)
  await new Promise((r) => setTimeout(r, 2000))
  await shot(cdp, 'desktop-conversation')
  results.topbar = await cdp.eval(`(() => {
    const bar = document.querySelector('.topbar').getBoundingClientRect()
    const name = document.querySelector('.topbar-name').getBoundingClientRect()
    const sub = document.querySelector('.topbar-sub').getBoundingClientRect()
    const main = document.querySelector('.main').getBoundingClientRect()
    const prog = document.querySelector('#readProgress').getBoundingClientRect()
    return {
      bar: { top: bar.top, bottom: bar.bottom, h: bar.height },
      name: { top: name.top, bottom: name.bottom },
      sub: { top: sub.top, bottom: sub.bottom },
      subInside: sub.bottom <= bar.bottom - 0.5,
      progress: { top: prog.top, left: prog.left, mainLeft: main.left, hidden: document.querySelector('#readProgress').hidden },
      progressInMain: prog.left >= main.left - 0.5,
      title: document.querySelector('.topbar-name').textContent,
      titleOverflow: document.querySelector('.topbar-name').scrollWidth > document.querySelector('.topbar-name').clientWidth,
    }
  })()`)
  results.inlineCode = await cdp.eval(`(() => {
    const codes = [...document.querySelectorAll('.md :not(pre) > code')].slice(0, 6)
    return codes.map((c) => ({ text: c.textContent, cls: c.className, wbr: c.querySelectorAll('wbr').length, w: +c.getBoundingClientRect().width.toFixed(1) }))
  })()`)
  await cdp.eval(`document.querySelector('#scrollArea').scrollTop = 500`)
  await new Promise((r) => setTimeout(r, 500))
  await shot(cdp, 'desktop-conversation-scrolled')

  await cdp.eval(`(() => { const i = document.querySelector('#convSearch'); i.value='文件'; i.dispatchEvent(new Event('input',{bubbles:true})); })()`)
  await new Promise((r) => setTimeout(r, 1300))
  await shot(cdp, 'desktop-search')
  results.search = await cdp.eval(`(() => {
    const rows = [...document.querySelectorAll('.conv-item')].slice(0, 4).map((row) => ({
      title: row.querySelector('.conv-title')?.textContent,
      snippet: row.querySelector('.conv-snippet')?.textContent,
      hitKind: row.querySelector('.conv-hit')?.textContent,
      meta: row.querySelector('.conv-meta')?.textContent,
      titleMarks: row.querySelectorAll('.conv-title mark').length,
      snippetMarks: row.querySelectorAll('.conv-snippet mark').length,
    }))
    const count = document.querySelector('#convResultCount')
    const heading = document.querySelector('#convHeading')
    return {
      count: count.textContent,
      countVisible: !count.hidden,
      headingHidden: heading.hidden,
      groupLabels: [...document.querySelectorAll('.conv-group')].map((g) => g.textContent),
      rows,
      toolbarGap: (() => { const s = document.querySelector('.conv-search').getBoundingClientRect(); const l = document.querySelector('.conv-list').getBoundingClientRect(); return +(l.top - s.bottom).toFixed(1) })(),
    }
  })()`)
  await cdp.eval(`(() => { const i = document.querySelector('#convSearch'); i.value=''; i.dispatchEvent(new Event('input',{bubbles:true})); })()`)
  await new Promise((r) => setTimeout(r, 700))
  await cdp.eval(`document.querySelector('#statusBtn')?.click()`)
  await new Promise((r) => setTimeout(r, 300))
  await shot(cdp, 'desktop-sidebar-status')
  results.statusDetail = await cdp.eval(`(() => ({ open: !document.querySelector('#connectionDetail').hidden, text: document.querySelector('#connectionDetail').innerText, footActions: document.querySelector('.foot-label').textContent }))()`)
  await cdp.eval(`document.querySelector('#statusBtn')?.click()`)
  console.log('desktop done')
  cdp.close(); await closeTab(tab.id)
}

async function mobile() {
  const { cdp, tab } = await session(390, 844, true)
  await cdp.eval(`document.querySelector('#newChat')?.click()`)
  await new Promise((r) => setTimeout(r, 900))
  await shot(cdp, 'mobile-home-dark')
  results.mobileHome = await cdp.eval(`(() => {
    const cards = [...document.querySelectorAll('.scenario-card')].map((el) => {
      const r = el.getBoundingClientRect()
      return { title: el.querySelector('.scenario-title')?.textContent, top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1), h: +r.height.toFixed(1) }
    })
    const composer = document.querySelector('.composer').getBoundingClientRect()
    const bar = document.querySelector('.topbar').getBoundingClientRect()
    const sub = document.querySelector('.topbar-sub')
    return {
      cards,
      composerTop: +composer.top.toFixed(1),
      completeCardsAboveComposer: cards.filter((c) => c.bottom <= composer.top).length,
      scrollBottomHidden: document.querySelector('#scrollBottom').hidden,
      topbarH: bar.height,
      subHidden: getComputedStyle(sub).display === 'none',
      heroSub: document.querySelector('.empty-sub').innerText.trim(),
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      composerHint: document.querySelector('#composerHint').textContent,
    }
  })()`)

  await cdp.eval(`document.querySelector('#menuBtn')?.click()`)
  await new Promise((r) => setTimeout(r, 500))
  await shot(cdp, 'mobile-sidebar-dark')
  results.mobileSidebar = await cdp.eval(`(() => {
    const order = [...document.querySelectorAll('#sidebar > *')].map((el) => el.className || el.tagName)
    const links = [...document.querySelectorAll('.sidebar-link')].map((el) => el.textContent.trim())
    const tools = [...document.querySelectorAll('.conv-toolbar-actions .sidebar-tool')].map((el) => el.textContent.trim())
    return { order, links, tools, hasOldTools: !!document.querySelector('.sidebar-tools') }
  })()`)

  await cdp.eval(`document.querySelector('#settingsBtn')?.click()`)
  await new Promise((r) => setTimeout(r, 450))
  await shot(cdp, 'mobile-settings-dark')
  results.mobileSettings = await cdp.eval(`(() => {
    const panel = document.querySelector('#settingsSheet .sheet-panel')
    const p = panel.getBoundingClientRect(); const f = panel.querySelector('.settings-footwrap').getBoundingClientRect()
    const body = panel.querySelector('.settings-body')
    return { panel: { top: +p.top.toFixed(1), bottom: +p.bottom.toFixed(1), h: +p.height.toFixed(1) }, footInside: f.bottom <= p.bottom + 0.5, bodyScroll: { scrollH: body.scrollHeight, clientH: body.clientHeight }, closeVisible: (() => { const c = document.querySelector('[data-settings-close]').getBoundingClientRect(); return c.top >= p.top && c.bottom <= p.bottom })() }
  })()`)
  await cdp.eval(`document.querySelector('[data-settings-close]')?.click()`)

  await cdp.navigate(`${APP}/c/${LONG_CONV}`)
  await new Promise((r) => setTimeout(r, 2200))
  await shot(cdp, 'mobile-conversation')
  results.mobileTopbar = await cdp.eval(`(() => {
    const bar = document.querySelector('.topbar').getBoundingClientRect()
    const name = document.querySelector('.topbar-name').getBoundingClientRect()
    const sub = document.querySelector('.topbar-sub')
    const prog = document.querySelector('#readProgress').getBoundingClientRect()
    return {
      bar: { top: bar.top, bottom: bar.bottom, h: bar.height },
      name: { top: name.top, bottom: name.bottom, inside: name.bottom <= bar.bottom - 0.5 },
      subHidden: getComputedStyle(sub).display === 'none',
      progress: { top: prog.top, left: prog.left, hidden: document.querySelector('#readProgress').hidden },
      title: document.querySelector('.topbar-name').textContent,
      titleOverflow: document.querySelector('.topbar-name').scrollWidth > document.querySelector('.topbar-name').clientWidth,
      code: [...document.querySelectorAll('.md :not(pre) > code')].slice(0, 4).map((c) => ({ text: c.textContent, wbr: c.querySelectorAll('wbr').length, w: +c.getBoundingClientRect().width.toFixed(1) })),
    }
  })()`)
  await cdp.eval(`document.querySelector('#chatInfoBtn')?.click()`)
  await new Promise((r) => setTimeout(r, 300))
  await shot(cdp, 'mobile-chat-info')
  await cdp.eval(`document.querySelector('#chatInfoClose')?.click()`)
  console.log('mobile done')
  cdp.close(); await closeTab(tab.id)
}

async function narrowSettings() {
  const { cdp, tab } = await session(1280, 560)
  await cdp.eval(`document.querySelector('#settingsBtn')?.click()`)
  await new Promise((r) => setTimeout(r, 450))
  await shot(cdp, 'desktop-settings-short-window')
  results.shortSettings = await cdp.eval(`(() => {
    const panel = document.querySelector('#settingsSheet .sheet-panel')
    const p = panel.getBoundingClientRect(); const f = panel.querySelector('.settings-footwrap').getBoundingClientRect()
    const body = panel.querySelector('.settings-body')
    return { vh: innerHeight, panel: { top: +p.top.toFixed(1), bottom: +p.bottom.toFixed(1) }, footInside: f.bottom <= p.bottom + 0.5, bodyScroll: { scrollH: body.scrollHeight, clientH: body.clientHeight, scrollable: body.scrollHeight > body.clientHeight } }
  })()`)
  cdp.close(); await closeTab(tab.id)
}

await desktop()
await mobile()
await narrowSettings()
fs.writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify(results, null, 2))
console.log(JSON.stringify(results, null, 2))
