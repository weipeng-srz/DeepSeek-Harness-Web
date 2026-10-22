// Read-only UI inventory used by the v5 review panel. Does not create or
// modify conversations; it only opens the app and records what a user sees.
import fs from 'node:fs'
import path from 'node:path'
import { openApp, login, closeTab, APP } from './cdp.mjs'

const outDir = process.env.OUT_DIR || 'reports/v5/baseline'
const accessCode = process.env.ACCESS_CODE || ''
fs.mkdirSync(outDir, { recursive: true })

const probe = async (cdp, label) => {
  const data = await cdp.eval(`(() => {
    const visible = (el) => {
      if (!el) return false
      const style = getComputedStyle(el)
      const rect = el.getBoundingClientRect()
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0
    }
    const labelOf = (el) => (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 80)
    const controls = [...document.querySelectorAll('button, a, input, textarea, select, [role="button"], [role="radio"], [tabindex]')]
      .filter(visible)
      .map((el) => {
        const r = el.getBoundingClientRect()
        return { tag: el.tagName.toLowerCase(), role: el.getAttribute('role'), label: labelOf(el), id: el.id || null, w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) }
      })
    const tiny = controls.filter((c) => c.w < 44 || c.h < 44)
    const textOf = (sel) => document.querySelector(sel)?.textContent?.replace(/\\s+/g, ' ').trim() || ''
    const scenarios = [...document.querySelectorAll('#scenarioGrid .scenario-card, #scenarioGrid [data-scenario]')].map((el) => labelOf(el))
    const sidebarLinks = [...document.querySelectorAll('.sidebar-links button, .sidebar-tool, .foot-actions button')].filter(visible).map(labelOf)
    const cs = (sel, props) => { const el = document.querySelector(sel); if (!el) return null; const s = getComputedStyle(el); const out = {}; for (const p of props) out[p] = s.getPropertyValue(p); return out }
    return {
      viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio, scrollW: document.documentElement.scrollWidth },
      title: document.title,
      topbar: textOf('#topbarName') + ' / ' + textOf('#topbarSub'),
      empty: { headline: textOf('#emptyState h1'), sub: textOf('#emptyState .empty-sub'), hint: textOf('#emptyHintText'), visible: visible(document.querySelector('#emptyState')) },
      composer: { placeholder: document.querySelector('#input')?.placeholder, hint: textOf('#composerHint') },
      scenarios,
      sidebarLinks,
      controls,
      counts: { controls: controls.length, tiny: tiny.length, buttons: controls.filter((c) => c.tag === 'button').length, inputs: controls.filter((c) => c.tag === 'input' || c.tag === 'textarea').length },
      tiny: tiny.slice(0, 30),
      layout: {
        topbar: cs('.topbar', ['height', 'padding-left', 'padding-right']),
        thread: cs('#thread', ['max-width', 'padding-left', 'padding-right', 'font-size']),
        composer: cs('.composer', ['max-width', 'width', 'margin-left', 'margin-right']),
        empty: cs('#emptyState', ['padding-top', 'padding-left', 'padding-right']),
        body: cs('body', ['font-family', 'font-size', 'background-color', 'color']),
      },
      landmarks: [...document.querySelectorAll('main, aside, header, nav, [role="dialog"], [role="status"], [aria-live]')].map((el) => ({ tag: el.tagName.toLowerCase(), id: el.id, role: el.getAttribute('role'), live: el.getAttribute('aria-live') })),
      media: { dark: matchMedia('(prefers-color-scheme: dark)').matches, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches },
    }
  })()`)
  fs.writeFileSync(path.join(outDir, `ui-${label}.json`), JSON.stringify(data, null, 2))
  console.log(`${label}: ${data.counts.controls} controls, ${data.counts.tiny} under 44px, overflow=${data.viewport.scrollW > data.viewport.w}`)
  return data
}

const { cdp, tab } = await openApp({ width: 1440, height: 900 })
try {
  await login(cdp).catch(() => {})
  await new Promise((r) => setTimeout(r, 1200))
  await probe(cdp, 'desktop-empty')
  await cdp.viewport(390, 844, { mobile: true })
  await new Promise((r) => setTimeout(r, 800))
  await probe(cdp, 'mobile-empty')
  await cdp.screenshot(path.join(outDir, 'mobile-empty.png'))
  await cdp.viewport(1440, 900, { mobile: false })
  await new Promise((r) => setTimeout(r, 500))
  const first = await cdp.eval(`fetch('/api/conversations?limit=1', {credentials:'same-origin'}).then(r=>r.json()).then(d=>d.conversations[0]?.id || '')`)
  if (first) {
    await cdp.navigate(`${APP}/c/${first}`)
    await new Promise((r) => setTimeout(r, 1600))
    await probe(cdp, 'desktop-thread')
    await cdp.screenshot(path.join(outDir, 'desktop-thread.png'))
  }
} finally {
  cdp.close()
  await closeTab(tab.id)
}
console.log(`written to ${path.resolve(outDir)}`)
