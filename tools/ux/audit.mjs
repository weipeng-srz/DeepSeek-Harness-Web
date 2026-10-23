// Deep front-end experience audit.
//
// Captures every surface/state at several viewports and records what a person
// can actually see: geometry, typography, colour contrast, hit targets,
// alignment containers, overlays, keyboard focus order, ARIA and performance.
// Output feeds the 20-person design panel; it is read-only and never mutates
// conversations.
//
// Usage: node tools/ux/audit.mjs [--out reports/evolution/round-1/baseline] [--quick]
import fs from 'node:fs'
import path from 'node:path'
import { openApp, login, closeTab, APP } from '../qa/cdp.mjs'

const ROOT = process.cwd()
const OUT = path.resolve(ROOT, process.env.OUT || 'reports/evolution/round-1/baseline')
const QUICK = process.argv.includes('--quick')
const ACCESS_CODE = process.env.ACCESS_CODE || JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8')).accessCode
const RICH = '463a289d-ce98-4998-948c-017c90246e42'
const LONG = '2ea3fedf-ca86-45c3-a265-3dc06ee559c9'
const SHARE_TOKEN = process.env.SHARE_TOKEN || 'qZZ-aGgR22XZyi9CA6bIK6mShyaVWjI_'

fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true })
fs.mkdirSync(path.join(OUT, 'states'), { recursive: true })

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const log = (...args) => console.log(...args)

/* ───────────────────────── in-page collector ───────────────────────── */

function pageCollect() {
  const parseColor = (value) => {
    const m = String(value || '').match(/rgba?\(([^)]+)\)/)
    if (!m) return null
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number)
    if (p.length < 3) return null
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }
  }
  const channel = (v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const lum = (c) => 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b)
  const contrast = (a, b) => {
    const l1 = lum(a)
    const l2 = lum(b)
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
  }
  const visible = (el) => {
    if (!el || el.closest('[hidden]')) return false
    const s = getComputedStyle(el)
    if (s.display === 'none' || s.visibility === 'hidden' || s.visibility === 'collapse') return false
    if (Number(s.opacity) === 0) return false
    const r = el.getBoundingClientRect()
    return r.width > 0.5 && r.height > 0.5
  }
  const textOf = (el) => String(el.getAttribute?.('aria-label') || el.textContent || el.getAttribute?.('title') || '')
    .replace(/\s+/g, ' ').trim()
  const labelOf = (el) => {
    const aria = el.getAttribute?.('aria-labelledby')
    if (aria) {
      const target = document.getElementById(aria.split(/\s+/)[0])
      if (target) return textOf(target).slice(0, 120)
    }
    const own = textOf(el)
    if (own) return own.slice(0, 120)
    const img = el.querySelector?.('img[alt]')
    return (img?.getAttribute('alt') || '').slice(0, 120)
  }
  const clsOf = (el) => String(el.className || '').trim().split(/\s+/).filter(Boolean).slice(0, 3).join('.')
  const selOf = (el) => {
    if (el.id) return '#' + el.id
    const parts = []
    let cur = el
    for (let i = 0; i < 3 && cur && cur !== document.body; i += 1) {
      const part = cur.tagName.toLowerCase() + (clsOf(cur) ? '.' + clsOf(cur).split('.').join('.') : '')
      parts.unshift(part)
      cur = cur.parentElement
    }
    return parts.join(' > ')
  }
  const rectOf = (el) => {
    const r = el.getBoundingClientRect()
    return {
      x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1),
      top: +r.top.toFixed(1), right: +r.right.toFixed(1), bottom: +r.bottom.toFixed(1), left: +r.left.toFixed(1),
    }
  }
  const intersectRect = (a, b) => {
    const left = Math.max(a.left, b.left)
    const top = Math.max(a.top, b.top)
    const right = Math.min(a.right, b.right)
    const bottom = Math.min(a.bottom, b.bottom)
    return { x: +left.toFixed(1), y: +top.toFixed(1), w: +Math.max(0, right - left).toFixed(1), h: +Math.max(0, bottom - top).toFixed(1), top: +top.toFixed(1), right: +right.toFixed(1), bottom: +bottom.toFixed(1), left: +left.toFixed(1) }
  }
  const visRectOf = (el) => {
    let r = el.getBoundingClientRect()
    let cur = el.parentElement
    while (cur) {
      const s = getComputedStyle(cur)
      if (/(hidden|auto|scroll|clip)/.test(s.overflow + ' ' + s.overflowX + ' ' + s.overflowY)) {
        r = (() => {
          const left = Math.max(r.left, cur.getBoundingClientRect().left)
          const top = Math.max(r.top, cur.getBoundingClientRect().top)
          const right = Math.min(r.right, cur.getBoundingClientRect().right)
          const bottom = Math.min(r.bottom, cur.getBoundingClientRect().bottom)
          return { left, top, right, bottom, x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }
        })()
        if (r.width <= 0 || r.height <= 0) break
      }
      cur = cur.parentElement
    }
    return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), top: +r.top.toFixed(1), right: +r.right.toFixed(1), bottom: +r.bottom.toFixed(1), left: +r.left.toFixed(1) }
  }
  const onScreen = (r) => r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth && r.w > 0.5 && r.h > 0.5
  const bgOf = (el) => {
    const layers = []
    let cur = el
    while (cur) {
      const c = parseColor(getComputedStyle(cur).backgroundColor)
      if (c && c.a > 0) layers.push(c)
      cur = cur.parentElement
    }
    let bg = { r: 255, g: 255, b: 255, a: 1 }
    for (let i = layers.length - 1; i >= 0; i -= 1) {
      const c = layers[i]
      bg = {
        r: c.r * c.a + bg.r * (1 - c.a),
        g: c.g * c.a + bg.g * (1 - c.a),
        b: c.b * c.a + bg.b * (1 - c.a),
        a: 1,
      }
    }
    return bg
  }
  const styleOf = (el) => {
    const s = getComputedStyle(el)
    return {
      display: s.display,
      position: s.position,
      fontFamily: s.fontFamily.split(',')[0].replace(/["']/g, '').trim(),
      fontSize: parseFloat(s.fontSize),
      fontWeight: s.fontWeight,
      lineHeight: s.lineHeight,
      letterSpacing: s.letterSpacing,
      color: s.color,
      bg: s.backgroundColor,
      radius: s.borderRadius,
      border: s.borderTopWidth + ' ' + s.borderTopStyle + ' ' + s.borderTopColor,
      shadow: s.boxShadow,
      padding: s.padding,
      gap: s.columnGap === 'normal' ? s.gap : s.columnGap,
      overflow: s.overflow,
      whiteSpace: s.whiteSpace,
      textOverflow: s.textOverflow,
      zIndex: s.zIndex,
      cursor: s.cursor,
      opacity: s.opacity,
      transform: s.transform,
      animation: s.animationName,
      transition: s.transitionDuration,
      justifyContent: s.justifyContent,
      alignItems: s.alignItems,
      bgImage: s.backgroundImage !== 'none',
    }
  }

  const out = {
    url: location.href,
    title: document.title,
    viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio },
    doc: {
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
      scrollH: document.documentElement.scrollHeight,
      clientH: document.documentElement.clientHeight,
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    },
    tokens: {},
    regions: [],
    containers: [],
    controls: [],
    texts: [],
    overlays: [],
    a11y: {},
    focusables: [],
    perf: {},
    media: {
      dark: matchMedia('(prefers-color-scheme: dark)').matches,
      reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
      coarse: matchMedia('(pointer: coarse)').matches,
    },
  }

  // When an overlay is open, audit only that surface. Anything behind it is
  // visually covered and would produce meaningless overlap findings.
  const surfaceCandidates = [
    ...document.querySelectorAll('.sheet:not([hidden]) .sheet-panel'),
    ...document.querySelectorAll('.modal:not([hidden]) .modal-card'),
    ...document.querySelectorAll('#palette:not([hidden]) .palette-card'),
    ...document.querySelectorAll('#quickSwitcher:not([hidden]) .quick-card'),
    ...document.querySelectorAll('#chatInfo:not([hidden])'),
  ].filter(visible)
  let activeSurface = surfaceCandidates[surfaceCandidates.length - 1] || null
  if (!activeSurface && innerWidth < 1024 && document.body.classList.contains('sidebar-open')) activeSurface = document.querySelector('#sidebar')
  const auditRoot = activeSurface || document.body
  out.surface = activeSurface ? (activeSurface.id || clsOf(activeSurface) || activeSurface.tagName.toLowerCase()) : 'page'

  const tokenNames = [
    '--bg', '--bg-elevated', '--sidebar-bg', '--surface', '--surface-2', '--hover', '--active-bg',
    '--text', '--text-2', '--text-3', '--border', '--border-strong', '--bubble', '--accent',
    '--danger', '--success', '--shadow', '--font', '--mono', '--sidebar-w', '--content-max',
    '--page-gutter', '--page-gutter-desktop', '--chat-measure', '--chat-shell', '--composer-h',
  ]
  const rootStyle = getComputedStyle(document.documentElement)
  for (const name of tokenNames) out.tokens[name] = rootStyle.getPropertyValue(name).trim()
  out.tokens.theme = document.documentElement.dataset.theme || 'auto'

  const regionSelectors = [
    '#loginView', '.login-card', '.shell', '#sidebar', '.sidebar-head', '.sidebar-links',
    '.conv-search', '.conv-toolbar', '.conv-scroll', '.sidebar-foot', '.main', '.topbar',
    '#scrollArea', '#emptyState', '.hero', '#scenarioGrid', '.scenario-note', '#thread',
    '.composer-wrap', '#engineBar', '#filesBar', '.composer', '.composer-row', '.composer-foot',
    '#reconnectBar', '#findBar', '#batchBar', '#readProgress', '.toast',
  ]
  for (const sel of regionSelectors) {
    const el = document.querySelector(sel)
    if (!el || !visible(el)) continue
    out.regions.push({ sel, rect: rectOf(el), style: styleOf(el), scroll: { h: el.scrollHeight, ch: el.clientHeight, w: el.scrollWidth, cw: el.clientWidth } })
  }

  if (activeSurface) {
    out.regions.unshift({ sel: 'overlay:' + (activeSurface.id || clsOf(activeSurface)), rect: rectOf(activeSurface), style: styleOf(activeSurface), scroll: { h: activeSurface.scrollHeight, ch: activeSurface.clientHeight, w: activeSurface.scrollWidth, cw: activeSurface.clientWidth } })
  }

  const containerSelectors = [
    '.topbar', '.topbar-actions', '.sidebar-head', '.brand', '.sidebar-links', '.conv-toolbar',
    '.conv-toolbar-actions', '.sidebar-foot', '.foot-actions', '.composer-row', '.composer-foot',
    '.hero', '.hero-actions', '#scenarioGrid', '.sheet-head', '.sheet-sub', '.modal-actions',
    '.batch-bar', '.engine-bar', '.files-bar', '.attachment-tray', '.settings-options',
    '.settings-row', '.settings-actions', '.project-chips', '.project-card-actions',
    '.project-head', '.project-sheet-foot', '.share-actions', '.share-preview', '.msg-actions',
    '.msg-meta', '.quick-card', '.palette-card', '.palette-results', '.settings-preview',
    '.login-card', '.login-foot', '.empty-hint', '.shortcuts-list', '.archive-toolbar',
  ]
  for (const sel of containerSelectors) {
    for (const el of auditRoot.querySelectorAll(sel)) {
      if (!visible(el)) continue
      const s = styleOf(el)
      const children = [...el.children].filter(visible).slice(0, 24).map((child) => ({
        tag: child.tagName.toLowerCase(), cls: clsOf(child), id: child.id || null,
        label: labelOf(child).slice(0, 60), rect: rectOf(child),
        fontSize: parseFloat(getComputedStyle(child).fontSize),
      }))
      out.containers.push({ sel, rect: rectOf(el), style: { display: s.display, gap: s.gap, padding: s.padding, justifyContent: s.justifyContent, alignItems: s.alignItems, overflow: s.overflow }, children })
      if (out.containers.length > 90) break
    }
    if (out.containers.length > 90) break
  }

  const controlSel = 'button, a[href], input, textarea, select, [role="button"], [role="radio"], [role="tab"], [role="switch"], [tabindex]:not([tabindex="-1"])'
  const seenControls = new Set()
  const controlEls = new Map()
  let controlUid = 0
  for (const el of auditRoot.querySelectorAll(controlSel)) {
    if (!visible(el) || seenControls.has(el)) continue
    seenControls.add(el)
    const r = rectOf(el)
    const vr = visRectOf(el)
    if (!onScreen(vr)) continue
    const s = styleOf(el)
    const type = el.getAttribute('type') || ''
    const disabled = el.disabled || el.getAttribute('aria-disabled') === 'true'
    const cs = out.media.coarse
    controlUid += 1
    controlEls.set(controlUid, el)
    out.controls.push({
      uid: controlUid, sel: selOf(el), tag: el.tagName.toLowerCase(), id: el.id || null, cls: clsOf(el),
      role: el.getAttribute('role') || null, type: type || null, label: labelOf(el),
      placeholder: el.getAttribute('placeholder') || null, disabled: !!disabled,
      checked: el.getAttribute('aria-checked') || (el.checked ? 'true' : null),
      expanded: el.getAttribute('aria-expanded') || null,
      tabIndex: el.tabIndex, rect: r, visRect: vr,
      inViewport: vr.top >= -1 && vr.left >= -1 && vr.bottom <= innerHeight + 1 && vr.right <= innerWidth + 1,
      target44: r.w >= 44 && r.h >= 44,
      target24: r.w >= 24 && r.h >= 24,
      below44: cs ? (r.w < 44 || r.h < 44) : false,
      clippedByScroll: r.h > 0 && vr.h < r.h - 2,
      fullyClipped: vr.h <= 0 || vr.w <= 0,
      style: {
        fontSize: s.fontSize, fontWeight: s.fontWeight, color: s.color, bg: s.bg, radius: s.radius,
        border: s.border, padding: s.padding, cursor: s.cursor, whiteSpace: s.whiteSpace,
        overflow: s.overflow, textOverflow: s.textOverflow,
      },
      clipped: (s.overflow === 'hidden' || s.textOverflow === 'ellipsis') && el.scrollWidth > el.clientWidth + 2 && !!textOf(el),
      textLength: textOf(el).length,
    })
  }
  out.controls = out.controls.slice(0, 260)

  // Text nodes with effective background + contrast.
  const walker = document.createTreeWalker(auditRoot, NodeFilter.SHOW_TEXT)
  const seenText = new Set()
  while (walker.nextNode()) {
    const node = walker.currentNode
    const text = String(node.nodeValue || '').replace(/\s+/g, ' ').trim()
    if (!text || text.length < 2) continue
    const el = node.parentElement
    if (!el || seenText.has(el) || !visible(el)) continue
    seenText.add(el)
    const s = getComputedStyle(el)
    const fg = parseColor(s.color)
    const bg = bgOf(el)
    if (!fg) continue
    const size = parseFloat(s.fontSize)
    const weight = Number(s.fontWeight) || 400
    const ratio = contrast(fg, bg)
    const large = size >= 24 || (size >= 18.66 && weight >= 700)
    let bgImage = false
    let cur = el
    while (cur) {
      if (getComputedStyle(cur).backgroundImage !== 'none') { bgImage = true; break }
      cur = cur.parentElement
    }
    const r = rectOf(el)
    const vr = visRectOf(el)
    if (!onScreen(vr)) continue
    out.texts.push({
      sel: selOf(el), tag: el.tagName.toLowerCase(), id: el.id || null, cls: clsOf(el),
      text: text.slice(0, 160), textLength: text.length,
      fontSize: size, fontWeight: weight, lineHeight: s.lineHeight,
      color: s.color, bg: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`,
      ratio: +ratio.toFixed(2), min: large ? 3 : 4.5, contrastPass: bgImage ? null : ratio >= (large ? 3 : 4.5),
      bgImage, rect: r, clipped: el.scrollWidth > el.clientWidth + 2 && (s.overflow === 'hidden' || s.textOverflow === 'ellipsis'),
      truncate: s.textOverflow,
    })
    if (out.texts.length > 500) break
  }

  // Overlays: sheet/modals/palette/quick switcher.
  const overlayRoots = [
    ...document.querySelectorAll('.sheet:not([hidden])'),
    ...document.querySelectorAll('.modal:not([hidden])'),
    ...document.querySelectorAll('#palette:not([hidden])'),
    ...document.querySelectorAll('#quickSwitcher:not([hidden])'),
    ...document.querySelectorAll('#chatInfo:not([hidden])'),
  ]
  for (const root of overlayRoots) {
    if (!visible(root) && !root.querySelector('.sheet-panel, .modal-card, .palette-card, .quick-card')) continue
    const panel = root.querySelector('.sheet-panel, .modal-card, .palette-card, .quick-card, .chat-info') || root
    const p = rectOf(panel)
    const body = panel.querySelector('.settings-body, .sheet-body, .archive-list, .file-list')
    const close = panel.querySelector('[aria-label*="关闭"], .sheet-head .icon-btn, [data-settings-close], .quick-close')
    const head = panel.querySelector('.sheet-head, .modal-card h2, .chat-info-head')
    const foot = panel.querySelector('.settings-footwrap, .sheet-foot, .modal-actions')
    out.overlays.push({
      root: selOf(root), panel: selOf(panel), rect: p,
      withinViewport: p.top >= -1 && p.left >= -1 && p.bottom <= innerHeight + 1 && p.right <= innerWidth + 1,
      radius: getComputedStyle(panel).borderRadius,
      bg: getComputedStyle(panel).backgroundColor,
      shadow: getComputedStyle(panel).boxShadow,
      bodyScroll: body ? { h: body.scrollHeight, ch: body.clientHeight, overflowY: getComputedStyle(body).overflowY } : null,
      head: head ? rectOf(head) : null,
      foot: foot ? rectOf(foot) : null,
      close: close ? { label: labelOf(close), rect: rectOf(close) } : null,
      focusInside: panel.contains(document.activeElement),
      active: document.activeElement ? { sel: selOf(document.activeElement), label: labelOf(document.activeElement) } : null,
      backdrop: (() => { const b = root.querySelector('.sheet-backdrop, .modal-backdrop, .scrim'); return b ? { bg: getComputedStyle(b).backgroundColor, opacity: getComputedStyle(b).opacity } : null })(),
    })
  }

  // A11y essentials.
  const unlabeled = []
  for (const el of auditRoot.querySelectorAll('button, a[href], [role="button"]')) {
    if (!visible(el)) continue
    if (!labelOf(el)) unlabeled.push({ sel: selOf(el), tag: el.tagName.toLowerCase() })
  }
  const inputsNoLabel = []
  for (const el of auditRoot.querySelectorAll('input:not([type="hidden"]), textarea, select')) {
    if (!visible(el)) continue
    const id = el.id
    const label = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('placeholder') || (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent) || el.closest('label')?.textContent
    if (!String(label || '').trim()) inputsNoLabel.push({ sel: selOf(el), type: el.type })
  }
  const dialogs = [...auditRoot.querySelectorAll('[role="dialog"]'), ...(auditRoot.getAttribute?.('role') === 'dialog' ? [auditRoot] : [])].filter(visible).map((el) => ({
    sel: selOf(el), label: labelOf(el), ariaModal: el.getAttribute('aria-modal'), labelledby: el.getAttribute('aria-labelledby'),
  }))
  const ids = new Map()
  for (const el of auditRoot.querySelectorAll('[id]')) ids.set(el.id, (ids.get(el.id) || 0) + 1)
  const duplicateIds = [...ids.entries()].filter(([, n]) => n > 1).map(([id, n]) => ({ id, n }))
  const ariaHiddenFocusable = [...document.querySelectorAll('[aria-hidden="true"]:not([inert])')]
    .filter((node) => !node.closest('[inert]'))
    .flatMap((node) => [...node.querySelectorAll('button, a[href], input, textarea, select, [tabindex]:not([tabindex="-1"])')])
    .filter((el) => !el.closest('[hidden]') && !el.closest('[inert]')).length
  const headings = [...auditRoot.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(visible).map((el) => ({ level: Number(el.tagName[1]), text: textOf(el).slice(0, 80) }))
  const landmarks = [...auditRoot.querySelectorAll('main, header, nav, aside, form, [role="main"], [role="navigation"], [role="dialog"], [role="status"], [aria-live]')]
    .filter(visible).map((el) => ({ tag: el.tagName.toLowerCase(), role: el.getAttribute('role'), id: el.id || null, label: labelOf(el).slice(0, 60), live: el.getAttribute('aria-live') }))
  out.a11y = {
    unlabeled: unlabeled.slice(0, 30),
    inputsNoLabel: inputsNoLabel.slice(0, 20),
    dialogs,
    duplicateIds,
    ariaHiddenFocusable,
    headings,
    landmarks: landmarks.slice(0, 40),
    imagesNoAlt: [...document.images].filter((img) => visible(img) && !img.hasAttribute('alt')).length,
    lang: document.documentElement.lang,
    skipLink: !!document.querySelector('.skip-link'),
    positiveTabindex: [...document.querySelectorAll('[tabindex]')].filter((el) => Number(el.getAttribute('tabindex')) > 0).length,
  }

  // Keyboard order inputs (the walk itself happens from Node).
  out.focusables = [...auditRoot.querySelectorAll(controlSel)]
    .filter((el) => visible(el) && !el.disabled && el.tabIndex >= 0)
    .map((el) => ({ sel: selOf(el), label: labelOf(el).slice(0, 60), tabIndex: el.tabIndex }))
    .slice(0, 60)

  // Overlap between interactive controls (ignore nesting).
  const interactive = out.controls.filter((c) => c.visRect.w > 2 && c.visRect.h > 2 && !c.disabled && !c.fullyClipped)
  const overlaps = []
  for (let i = 0; i < interactive.length; i += 1) {
    for (let j = i + 1; j < interactive.length; j += 1) {
      const a = interactive[i]
      const b = interactive[j]
      if (a.sel === b.sel || a.sel.startsWith(b.sel + ' ') || b.sel.startsWith(a.sel + ' ')) continue
      const elA = controlEls.get(a.uid)
      const elB = controlEls.get(b.uid)
      const groupSel = '.conv-item, .msg, .msg-actions, .tool-card, .settings-row, .settings-actions, .sheet-head, .modal-actions, .project-row, .share-pick-item, .palette-item, .quick-item, .scenario-card, .bookmark-row, .prompt-row, .memory-row, .share-check, .file-row'
      const groupA = elA?.closest(groupSel)
      const groupB = elB?.closest(groupSel)
      if (groupA && groupA === groupB) continue
      if (elA && elB && (elA.contains(elB) || elB.contains(elA))) continue
      const ix = Math.max(0, Math.min(a.visRect.right, b.visRect.right) - Math.max(a.visRect.left, b.visRect.left))
      const iy = Math.max(0, Math.min(a.visRect.bottom, b.visRect.bottom) - Math.max(a.visRect.top, b.visRect.top))
      if (ix * iy < 16) continue
      const area = Math.min(a.visRect.w * a.visRect.h, b.visRect.w * b.visRect.h)
      if (area <= 0 || (ix * iy) / area < 0.3) continue
      overlaps.push({ a: a.id || a.label || a.sel, b: b.id || b.label || b.sel, area: Math.round(ix * iy) })
    }
  }
  out.overlaps = overlaps.slice(0, 30)

  // Off-screen interactive controls and page horizontal overflow offenders.
  out.overflowing = [...auditRoot.querySelectorAll('*')]
    .filter((el) => visible(el))
    .filter((el) => {
      const r = el.getBoundingClientRect()
      return r.right > innerWidth + 1 || r.left < -1
    })
    .slice(0, 30)
    .map((el) => ({ sel: selOf(el), rect: rectOf(el), position: getComputedStyle(el).position }))

  // Performance + scale.
  const nav = performance.getEntriesByType('navigation')[0]
  const resources = performance.getEntriesByType('resource')
  out.perf = {
    domNodes: document.getElementsByTagName('*').length,
    stylesheets: document.styleSheets.length,
    resources: resources.length,
    transferKB: Math.round(resources.reduce((sum, r) => sum + (r.transferSize || 0), 0) / 1024),
    domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
    load: nav ? Math.round(nav.loadEventEnd) : null,
    scroll: (() => { const el = document.querySelector('#scrollArea'); return el ? { h: el.scrollHeight, ch: el.clientHeight, top: el.scrollTop } : null })(),
    threadMessages: document.querySelectorAll('#thread .msg').length,
  }

  // Unique visual values for design-system drift.
  const fonts = {}
  const colors = {}
  const radii = {}
  const shadows = {}
  for (const t of out.texts) {
    fonts[t.fontSize] = (fonts[t.fontSize] || 0) + 1
    colors[t.color] = (colors[t.color] || 0) + 1
  }
  for (const c of out.controls) {
    radii[c.style.radius] = (radii[c.style.radius] || 0) + 1
  }
  for (const el of auditRoot.querySelectorAll('*')) {
    if (!visible(el)) continue
    const s = getComputedStyle(el)
    if (s.boxShadow !== 'none') shadows[s.boxShadow] = (shadows[s.boxShadow] || 0) + 1
  }
  out.system = { fonts, colors, radii, shadows }

  // Objective issue candidates.
  const issues = []
  if (out.doc.overflowX) issues.push({ code: 'HSCROLL', severity: 'P1', detail: `页面横向溢出 ${out.doc.scrollW - out.doc.clientW}px`, refs: out.overflowing.slice(0, 6) })
  for (const c of out.controls) {
    if (c.below44) issues.push({ code: 'TARGET44', severity: 'P2', detail: `触控目标 ${c.rect.w}×${c.rect.h} < 44px：${c.label || c.sel}` })
    if (c.clipped) issues.push({ code: 'CLIPPED', severity: 'P2', detail: `文字被截断：${c.label || c.sel}` })
  }
  for (const t of out.texts) {
    if (t.contrastPass === false) issues.push({ code: 'CONTRAST', severity: t.fontSize >= 18 ? 'P2' : 'P1', detail: `${t.ratio}:1（要求 ${t.min}:1）${Math.round(t.fontSize)}px「${t.text.slice(0, 40)}」`, sel: t.sel })
    if (t.fontSize < 11) issues.push({ code: 'TINYTEXT', severity: 'P2', detail: `${t.fontSize}px「${t.text.slice(0, 40)}」`, sel: t.sel })
  }
  for (const c of out.controls) {
    if (c.clippedByScroll && c.visRect.h > 0) issues.push({ code: 'SCROLL_CLIP', severity: 'P2', detail: `滚动容器裁切控件 ${c.rect.w}×${c.rect.h} → 可见 ${c.visRect.w}×${c.visRect.h}：${c.label || c.sel}` })
    if (c.fullyClipped && c.visRect.h <= 0 && c.rect.bottom > 0) issues.push({ code: 'BELOW_FOLD', severity: 'P3', detail: `控件在垂直折叠线以下：${c.label || c.sel} (y=${Math.round(c.rect.y)})` })
  }
  for (const o of out.overlaps) issues.push({ code: 'OVERLAP', severity: 'P2', detail: `可点区域重叠：${o.a} ↔ ${o.b}` })
  for (const o of out.overlays) {
    if (!o.withinViewport) issues.push({ code: 'OVERLAY_FIT', severity: 'P1', detail: `${o.panel} 超出视口 ${JSON.stringify(o.rect)}` })
    if (activeSurface && !activeSurface.contains(document.activeElement)) issues.push({ code: 'FOCUS_NOT_IN_DIALOG', severity: 'P1', detail: `打开浮层后焦点仍在背景：${document.activeElement ? selOf(document.activeElement) : 'body'}` })
    if (!o.close) issues.push({ code: 'OVERLAY_CLOSE', severity: 'P1', detail: `${o.panel} 没有可见关闭按钮` })
    if (o.bodyScroll && o.bodyScroll.h > o.bodyScroll.ch + 2 && o.foot && o.foot.bottom > o.rect.bottom + 1) issues.push({ code: 'OVERLAY_FOOT', severity: 'P2', detail: `${o.panel} 底部按钮覆盖滚动内容` })
  }
  for (const u of out.a11y.unlabeled) issues.push({ code: 'A11Y_NAME', severity: 'P1', detail: `无名称控件：${u.sel}` })
  for (const u of out.a11y.inputsNoLabel) issues.push({ code: 'A11Y_LABEL', severity: 'P1', detail: `输入框没有标签：${u.sel}` })
  for (const d of out.a11y.dialogs) {
    if (!d.label) issues.push({ code: 'A11Y_DIALOG', severity: 'P1', detail: `对话框没有可访问名称：${d.sel}` })
  }
  if (out.a11y.duplicateIds.length) issues.push({ code: 'A11Y_DUPID', severity: 'P2', detail: `重复 id：${out.a11y.duplicateIds.map((d) => d.id).join(', ')}` })
  if (out.a11y.ariaHiddenFocusable) issues.push({ code: 'A11Y_HIDDEN_FOCUS', severity: 'P1', detail: `aria-hidden 容器内有 ${out.a11y.ariaHiddenFocusable} 个可聚焦元素` })
  out.issues = issues.slice(0, 200)

  return out
}

/* ───────────────────────── focus walk (Node side) ───────────────────────── */

async function tabWalk(cdp, max = 20) {
  await cdp.eval('document.body.focus?.()')
  const records = []
  for (let i = 0; i < max; i += 1) {
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 })
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 })
    const info = await cdp.eval(`(() => {
      const el = document.activeElement
      if (!el || el === document.body) return { body: true }
      const s = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      return {
        tag: el.tagName.toLowerCase(), id: el.id || null,
        cls: String(el.className || '').slice(0, 60),
        label: (el.getAttribute('aria-label') || el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 60),
        role: el.getAttribute('role') || null,
        rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
        outline: s.outlineStyle === 'none' ? 'none' : s.outlineWidth + ' ' + s.outlineStyle + ' ' + s.outlineColor,
        shadow: s.boxShadow,
        bg: s.backgroundColor,
        border: s.borderTopColor,
        ring: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0 || s.boxShadow !== 'none',
        inViewport: r.top >= -1 && r.bottom <= innerHeight + 1,
      }
    })()`)
    if (info.body) break
    records.push(info)
    if (records.length > 2 && JSON.stringify(records[records.length - 1]) === JSON.stringify(records[records.length - 2])) break
  }
  return records
}

/* ───────────────────────── state definitions ───────────────────────── */

async function click(cdp, sel) {
  return cdp.eval(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.click(); return true })()`)
}
async function setInput(cdp, sel, value) {
  return cdp.eval(`(() => {
    const el = document.querySelector(${JSON.stringify(sel)})
    if (!el) return false
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
    setter?.call(el, ${JSON.stringify(value)})
    el.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`)
}
async function synthKey(cdp, key, meta = true) {
  return cdp.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, metaKey: ${meta}, bubbles: true, cancelable: true }))`)
}
async function press(cdp, key, code, modifiers = 0, vk = 0) {
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, modifiers, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, modifiers, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk })
}
async function goto(cdp, pathname) {
  await cdp.navigate(`${APP}${pathname}`)
  await sleep(700)
  await cdp.waitFor(() => cdp.eval('!!document.querySelector("#shell") && !document.querySelector("#shell").hidden'), 10_000).catch(() => {})
}
async function theme(cdp, value) {
  await cdp.eval(`localStorage.setItem('dsh.theme', ${JSON.stringify(value)})`)
  await cdp.navigate(APP)
  await sleep(650)
  await cdp.waitFor(() => cdp.eval('!!document.querySelector("#shell") && !document.querySelector("#shell").hidden'), 10_000).catch(() => {})
}
async function home(cdp) {
  const top = await click(cdp, '#newChatTop')
  if (!top) await click(cdp, '#newChat')
  await sleep(900)
  await cdp.eval(`document.querySelector('#scrollArea').scrollTop = 0`).catch(() => {})
  await sleep(250)
}
async function sidebar(cdp) {
  const open = await cdp.eval(`document.querySelector('#sidebar')?.classList.contains('open')`)
  if (!open) await click(cdp, '#menuBtn')
  await sleep(400)
}
async function sheet(cdp, buttonSel) {
  await sidebar(cdp)
  await click(cdp, buttonSel)
  await sleep(650)
}
async function closeOverlay(cdp) {
  await press(cdp, 'Escape', 'Escape', 0, 27)
  await sleep(350)
}

const STATES = [
  // Desktop 1440 × 900
  { name: 'desktop-home-dark', vp: [1440, 900], run: async (c) => { await theme(c, 'dark'); await home(c) } },
  { name: 'desktop-home-light', vp: [1440, 900], run: async (c) => { await theme(c, 'light'); await home(c) } },
  { name: 'desktop-conversation-dark', vp: [1440, 900], run: async (c) => { await theme(c, 'dark'); await goto(c, `/c/${RICH}`); await sleep(900) } },
  { name: 'desktop-conversation-light', vp: [1440, 900], run: async (c) => { await theme(c, 'light'); await goto(c, `/c/${RICH}`); await sleep(900) } },
  { name: 'desktop-conversation-scrolled', vp: [1440, 900], run: async (c) => { await goto(c, `/c/${RICH}`); await sleep(800); await c.eval("document.querySelector('#scrollArea').scrollTop = 1200"); await sleep(500) } },
  { name: 'desktop-long-thread', vp: [1440, 900], run: async (c) => { await goto(c, `/c/${LONG}`); await sleep(1100) } },
  { name: 'desktop-search', vp: [1440, 900], run: async (c) => { await goto(c, '/'); await home(c); await setInput(c, '#convSearch', '优化'); await sleep(1100) } },
  { name: 'desktop-sidebar-status', vp: [1440, 900], run: async (c) => { await goto(c, `/c/${RICH}`); await click(c, '#statusBtn'); await sleep(450) } },
  { name: 'desktop-chat-info', vp: [1440, 900], run: async (c) => { await goto(c, `/c/${RICH}`); await click(c, '#chatInfoBtn'); await sleep(450) } },
  { name: 'desktop-settings-dark', vp: [1440, 900], run: async (c) => { await theme(c, 'dark'); await sheet(c, '#settingsBtn') } },
  { name: 'desktop-settings-light', vp: [1440, 900], run: async (c) => { await theme(c, 'light'); await sheet(c, '#settingsBtn') } },
  { name: 'desktop-projects', vp: [1440, 900], run: async (c) => { await goto(c, `/c/${RICH}`); await sheet(c, '#projectsBtn') } },
  { name: 'desktop-bookmarks', vp: [1440, 900], run: async (c) => { await goto(c, `/c/${RICH}`); await sheet(c, '#bookmarksBtn') } },
  { name: 'desktop-prompts', vp: [1440, 900], run: async (c) => { await goto(c, `/c/${RICH}`); await sheet(c, '#promptsBtn') } },
  { name: 'desktop-memory', vp: [1440, 900], run: async (c) => { await goto(c, `/c/${RICH}`); await sheet(c, '#memoryBtn'); await sleep(400) } },
  { name: 'desktop-shortcuts', vp: [1440, 900], run: async (c) => { await goto(c, `/c/${RICH}`); await sheet(c, '#shortcutsBtn') } },
  { name: 'desktop-archive', vp: [1440, 900], run: async (c) => { await goto(c, `/c/${RICH}`); await sheet(c, '#archiveBtn'); await sleep(500) } },
  { name: 'desktop-manage', vp: [1440, 900], run: async (c) => { await goto(c, `/c/${RICH}`); await sidebar(c); await click(c, '#manageBtn'); await sleep(500) } },
  { name: 'desktop-share-sheet', vp: [1440, 900], run: async (c) => { await goto(c, `/c/${RICH}`); await sleep(900); await c.eval("document.querySelectorAll('button[aria-label=\"分享这条回答\"]')[0]?.click()"); await sleep(700) } },
  { name: 'desktop-export-sheet', vp: [1440, 900], run: async (c) => { await goto(c, `/c/${RICH}`); await press(c, 'k', 'KeyK', 4, 75); await sleep(500); await setInput(c, '#paletteInput', '导出'); await sleep(300); await click(c, '#paletteResults [data-command-id="export"], #paletteResults button'); await sleep(600) } },
  { name: 'desktop-quick-switcher', vp: [1440, 900], run: async (c) => { await goto(c, `/c/${RICH}`); await synthKey(c, 'p'); await sleep(700) } },
  { name: 'desktop-palette', vp: [1440, 900], run: async (c) => { await goto(c, `/c/${RICH}`); await synthKey(c, 'k'); await sleep(700) } },
  { name: 'desktop-scenarios', vp: [1440, 900], run: async (c) => { await goto(c, '/'); await home(c); await click(c, '#scenarioBtn'); await sleep(600) } },
  { name: 'desktop-find', vp: [1440, 900], run: async (c) => { await goto(c, `/c/${RICH}`); await synthKey(c, 'f'); await setInput(c, '#findInput', '优化'); await sleep(700) } },

  // Tablet 768 × 1024
  { name: 'tablet-home', vp: [768, 1024], run: async (c) => { await theme(c, 'dark'); await home(c) } },
  { name: 'tablet-conversation', vp: [768, 1024], run: async (c) => { await goto(c, `/c/${RICH}`); await sleep(800) } },
  { name: 'tablet-settings', vp: [768, 1024], run: async (c) => { await sheet(c, '#settingsBtn') } },
  { name: 'tablet-sidebar', vp: [768, 1024], run: async (c) => { await goto(c, '/'); await sidebar(c) } },

  // Mobile 390 × 844
  { name: 'mobile-home-dark', vp: [390, 844], mobile: true, run: async (c) => { await theme(c, 'dark'); await home(c) } },
  { name: 'mobile-home-light', vp: [390, 844], mobile: true, run: async (c) => { await theme(c, 'light'); await home(c) } },
  { name: 'mobile-conversation', vp: [390, 844], mobile: true, run: async (c) => { await theme(c, 'dark'); await goto(c, `/c/${RICH}`); await sleep(900) } },
  { name: 'mobile-sidebar', vp: [390, 844], mobile: true, run: async (c) => { await goto(c, `/c/${RICH}`); await sidebar(c) } },
  { name: 'mobile-settings', vp: [390, 844], mobile: true, run: async (c) => { await theme(c, 'dark'); await sheet(c, '#settingsBtn') } },
  { name: 'mobile-projects', vp: [390, 844], mobile: true, run: async (c) => { await goto(c, `/c/${RICH}`); await sheet(c, '#projectsBtn') } },
  { name: 'mobile-composer-typing', vp: [390, 844], mobile: true, run: async (c) => { await goto(c, `/c/${RICH}`); await setInput(c, '#input', '帮我总结这段对话，并列出三个下一步行动。'); await sleep(500) } },
  { name: 'mobile-search', vp: [390, 844], mobile: true, run: async (c) => { await goto(c, '/'); await sidebar(c); await setInput(c, '#convSearch', '优化'); await sleep(1100) } },
  { name: 'mobile-shortcuts', vp: [390, 844], mobile: true, run: async (c) => { await goto(c, `/c/${RICH}`); await sheet(c, '#shortcutsBtn') } },
  { name: 'mobile-share-page', vp: [390, 844], mobile: true, run: async (c) => { await c.navigate(`${APP}/s/${SHARE_TOKEN}`); await sleep(900) } },

  // Narrow 320 × 640
  { name: 'narrow-home', vp: [320, 640], mobile: true, run: async (c) => { await theme(c, 'dark'); await home(c) } },
  { name: 'narrow-conversation', vp: [320, 640], mobile: true, run: async (c) => { await goto(c, `/c/${RICH}`); await sleep(900) } },
  { name: 'narrow-settings', vp: [320, 640], mobile: true, run: async (c) => { await sheet(c, '#settingsBtn') } },
]

/* ───────────────────────── digest ───────────────────────── */

function fmtRect(r) {
  return `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.w)}×${Math.round(r.h)}`
}

function stateMarkdown(state, data, focus) {
  const lines = []
  lines.push(`# ${state.name}`)
  lines.push('')
  lines.push(`- 视口：${data.viewport.w}×${data.viewport.h} @${data.viewport.dpr}x · 主题 ${data.tokens.theme} (${data.media.dark ? 'system-dark' : 'system-light'}) · 粗指针 ${data.media.coarse}`)
  lines.push(`- URL：${data.url}`)
  lines.push(`- 审阅表面：${data.surface || 'page'}`)
  lines.push(`- 文档：scroll ${data.doc.scrollW}×${data.doc.scrollH} / client ${data.doc.clientW}×${data.doc.clientH} · 横向溢出 ${data.doc.overflowX ? 'YES' : 'no'}`)
  lines.push(`- 规模：${data.perf.domNodes} 个 DOM 节点，${data.controls.length} 个可见控件，${data.texts.length} 个文本块；资源 ${data.perf.resources} 个 / ${data.perf.transferKB}KB`)
  lines.push(`- 阅读区：${data.perf.scroll ? `内容 ${data.perf.scroll.h}px / 视口 ${data.perf.scroll.ch}px / 滚动 ${data.perf.scroll.top}px` : 'n/a'}；消息 ${data.perf.threadMessages} 条`)
  lines.push('')
  lines.push('## 区域几何')
  lines.push('')
  lines.push('| 区域 | 位置尺寸 | 滚动内容/容器 |')
  lines.push('| --- | --- | --- |')
  for (const r of data.regions) lines.push(`| \`${r.sel}\` | ${fmtRect(r.rect)} | ${r.scroll.h}/${r.scroll.ch}h ${r.scroll.w}/${r.scroll.cw}w |`)
  if (!data.regions.length) lines.push('| — | — | — |')
  lines.push('')
  const issues = data.issues || []
  lines.push(`## 自动检出（${issues.length}）`)
  lines.push('')
  if (!issues.length) lines.push('- 无')
  const seen = new Set()
  for (const issue of issues) {
    const key = issue.code + issue.detail
    if (seen.has(key)) continue
    seen.add(key)
    lines.push(`- **${issue.severity} · ${issue.code}** ${issue.detail}${issue.sel ? `（\`${issue.sel}\`）` : ''}`)
    if (lines.length > 220) { lines.push('- …'); break }
  }
  lines.push('')
  lines.push('## 关键容器与子元素')
  lines.push('')
  for (const c of data.containers.slice(0, 18)) {
    lines.push(`### \`${c.sel}\` ${fmtRect(c.rect)} · display:${c.style.display} gap:${c.style.gap} padding:${c.style.padding} align:${c.style.alignItems}`)
    for (const ch of c.children) {
      lines.push(`- \`${ch.tag}${ch.id ? '#' + ch.id : ''}${ch.cls ? '.' + ch.cls : ''}\` ${fmtRect(ch.rect)} ${ch.fontSize}px 「${ch.label}」`)
    }
    lines.push('')
  }
  lines.push('## 可见控件（前 80）')
  lines.push('')
  lines.push('| # | 控件 | 标签 | 位置 | 字号 | 对比度/目标 |')
  lines.push('| --- | --- | --- | --- | --- | --- |')
  data.controls.slice(0, 80).forEach((c, i) => {
    const flags = [c.below44 ? '触控<44' : '', c.clipped ? '截断' : '', c.inViewport ? '' : '视口外'].filter(Boolean).join(' ')
    lines.push(`| ${i + 1} | \`${c.id ? '#' + c.id : c.tag + '.' + c.cls}\` | ${c.label || c.placeholder || ''} | ${fmtRect(c.rect)} | ${c.style.fontSize}px | ${flags || '—'} |`)
  })
  lines.push('')
  lines.push('## 文本与对比度（每个唯一元素）')
  lines.push('')
  lines.push('| 文本 | 字号/行高 | 颜色/背景 | 对比度 | 位置 |')
  lines.push('| --- | --- | --- | --- | --- |')
  for (const t of data.texts.slice(0, 90)) {
    lines.push(`| ${t.text.replace(/\|/g, '\\|')} | ${t.fontSize}/${t.lineHeight} | ${t.color} / ${t.bg} | ${t.ratio}${t.contrastPass === false ? ' ✗' : ''} | ${fmtRect(t.rect)} |`)
  }
  lines.push('')
  if (data.overlays.length) {
    lines.push('## 浮层')
    lines.push('')
    for (const o of data.overlays) {
      lines.push(`- \`${o.panel}\` ${fmtRect(o.rect)} · 视口内 ${o.withinViewport ? 'yes' : 'NO'} · 圆角 ${o.radius} · 背景 ${o.bg} · 滚动 ${o.bodyScroll ? `${o.bodyScroll.h}/${o.bodyScroll.ch}` : '—'} · 关闭 ${o.close ? fmtRect(o.close.rect) : 'NONE'} · 焦点在内 ${o.focusInside}`)
      lines.push(`  - head ${o.head ? fmtRect(o.head) : '—'} · foot ${o.foot ? fmtRect(o.foot) : '—'} · backdrop ${o.backdrop ? o.backdrop.bg : '—'}`)
    }
    lines.push('')
  }
  lines.push('## 无障碍')
  lines.push('')
  lines.push(`- 无名称控件 ${data.a11y.unlabeled.length}；无标签输入 ${data.a11y.inputsNoLabel.length}；对话框 ${data.a11y.dialogs.length}；重复 id ${data.a11y.duplicateIds.length}；aria-hidden 内可聚焦 ${data.a11y.ariaHiddenFocusable}；正 tabindex ${data.a11y.positiveTabindex}`)
  lines.push(`- 标题：${data.a11y.headings.map((h) => `h${h.level}:${h.text}`).join(' / ') || '无'}`)
  lines.push(`- 地标：${data.a11y.landmarks.map((l) => `${l.tag}${l.role ? '[' + l.role + ']' : ''}${l.label ? ':' + l.label : ''}`).join(' · ') || '无'}`)
  if (data.a11y.unlabeled.length) lines.push(`- 无名称：${data.a11y.unlabeled.map((u) => u.sel).join(', ')}`)
  if (data.a11y.dialogs.length) lines.push(`- 对话框：${data.a11y.dialogs.map((d) => `${d.sel}(${d.label || 'NO NAME'}, modal=${d.ariaModal})`).join(', ')}`)
  lines.push('')
  if (focus?.length) {
    lines.push('## Tab 键焦点轨迹')
    lines.push('')
    lines.push('| 顺序 | 元素 | 标签 | 位置 | 焦点环 |')
    lines.push('| --- | --- | --- | --- | --- |')
    focus.forEach((f, i) => {
      lines.push(`| ${i + 1} | \`${f.id ? '#' + f.id : f.tag + '.' + f.cls}\` | ${f.label} | ${Math.round(f.rect.x)},${Math.round(f.rect.y)} ${Math.round(f.rect.w)}×${Math.round(f.rect.h)} | ${f.ring ? 'yes' : '**NO**'} ${f.outline !== 'none' ? f.outline : ''} |`)
    })
    lines.push('')
  }
  lines.push(`截图：\`shots/${state.name}.png\``)
  lines.push('')
  return lines.join('\n')
}

/* ───────────────────────── runner ───────────────────────── */

const all = { generatedAt: new Date().toISOString(), app: APP, states: [] }
const summary = []
let currentVp = null
let session = null

async function ensureSession(vp, mobile) {
  if (session && currentVp && currentVp[0] === vp[0] && currentVp[1] === vp[1]) return session
  if (session) {
    session.cdp.close()
    await closeTab(session.tab.id)
  }
  const opened = await openApp({ width: vp[0], height: vp[1], mobile })
  const cdp = opened.cdp
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true }).catch(() => {})
  await cdp.send('Network.setBypassServiceWorker', { bypass: true }).catch(() => {})
  await cdp.waitFor(() => cdp.eval('document.readyState === "complete"'), 15_000)
  await login(cdp, ACCESS_CODE).catch(() => {})
  await sleep(600)
  session = { ...opened }
  currentVp = vp
  return session
}

const only = process.env.ONLY || ''
let statesInTab = 0
for (const state of STATES) {
  if (QUICK && !/home-dark|conversation-dark|settings-dark|mobile-conversation/.test(state.name)) continue
  if (only && !new RegExp(only).test(state.name)) continue
  // Recycle the DevTools tab periodically: 42 states keep thousands of nodes
  // and dozens of resources alive, which eventually stalls Runtime.evaluate.
  if (session && statesInTab >= 6) {
    session.cdp.close()
    await closeTab(session.tab.id)
    session = null
    currentVp = null
  }
  statesInTab += 1
  const { cdp } = await ensureSession(state.vp, !!state.mobile)
  log(`\n━━ ${state.name} ${state.vp.join('×')}${state.mobile ? ' mobile' : ''}`)
  try {
    await cdp.eval(`localStorage.setItem('dsh.sidebar', ${JSON.stringify(state.vp[0] >= 1024 ? 'open' : 'closed')})`)
    await state.run(cdp)
    await sleep(900)
    const shot = path.join(OUT, 'shots', `${state.name}.png`)
    await cdp.screenshot(shot)
    const focus = /home|conversation|settings|sidebar/.test(state.name) && !QUICK ? await tabWalk(cdp, 18) : []
    const data = await cdp.eval(`(${pageCollect.toString()})()`)
    data.focus = focus
    data.state = state.name
    data.capturedAt = new Date().toISOString()
    data.shot = path.relative(OUT, shot)
    const file = path.join(OUT, 'states', `${state.name}.md`)
    fs.writeFileSync(file, stateMarkdown(state, data, focus))
    all.states.push(data)
    const p1 = data.issues.filter((i) => i.severity === 'P0' || i.severity === 'P1').length
    const p2 = data.issues.filter((i) => i.severity === 'P2').length
    summary.push({
      state: state.name, viewport: state.vp, mobile: !!state.mobile, url: data.url,
      theme: data.tokens.theme, overflowX: data.doc.overflowX, issues: data.issues.length, p1, p2,
      dom: data.perf.domNodes, controls: data.controls.length, texts: data.texts.length,
      shot: data.shot,
      topIssues: data.issues.filter((i) => i.severity !== 'P3').slice(0, 8),
    })
    log(`  issues=${data.issues.length} p1=${p1} p2=${p2} dom=${data.perf.domNodes} controls=${data.controls.length}`)
  } catch (error) {
    log(`  FAILED: ${error.message}`)
    summary.push({ state: state.name, viewport: state.vp, failed: error.message })
  }
}

// Login screen last (clears the auth cookie, so it must be the final capture).
if (!process.env.SKIP_LOGIN) try {
  const { cdp } = await ensureSession([390, 844], true)
  await cdp.send('Network.clearBrowserCookies')
  await cdp.navigate(`${APP}/`)
  await sleep(900)
  const shot = path.join(OUT, 'shots', 'mobile-login.png')
  await cdp.screenshot(shot)
  const data = await cdp.eval(`(${pageCollect.toString()})()`)
  data.state = 'mobile-login'
  data.shot = path.relative(OUT, shot)
  data.focus = await tabWalk(cdp, 8)
  fs.writeFileSync(path.join(OUT, 'states', 'mobile-login.md'), stateMarkdown({ name: 'mobile-login' }, data, data.focus))
  all.states.push(data)
  summary.push({ state: 'mobile-login', viewport: [390, 844], mobile: true, url: data.url, issues: data.issues.length, shot: data.shot, topIssues: data.issues.slice(0, 8) })
  log(`\n━━ mobile-login issues=${data.issues.length}`)
} catch (error) {
  log(`login capture failed: ${error.message}`)
}

if (session) {
  session.cdp.close()
  await closeTab(session.tab.id)
}

const totals = summary.reduce((acc, s) => {
  acc.issues += s.issues || 0
  acc.p1 += s.p1 || 0
  acc.p2 += s.p2 || 0
  return acc
}, { issues: 0, p1: 0, p2: 0 })

const summaryMd = [
  '# Deep front-end audit · summary',
  '',
  `Generated: ${all.generatedAt}`,
  `States: ${summary.length} · issue candidates: ${totals.issues} (P1 ${totals.p1} / P2 ${totals.p2})`,
  '',
  '| 状态 | 视口 | 主题 | 溢出 | P1 | P2 | DOM | 控件 | 文本 | 截图 |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ...summary.map((s) => `| ${s.state} | ${s.viewport?.join('×')} | ${s.theme || '—'} | ${s.overflowX ? 'YES' : 'no'} | ${s.p1 ?? '—'} | ${s.p2 ?? '—'} | ${s.dom ?? '—'} | ${s.controls ?? '—'} | ${s.texts ?? '—'} | ${s.shot ? `[png](${s.shot})` : '—'} |`),
  '',
  '## 每状态重点',
  '',
  ...summary.flatMap((s) => {
    if (s.failed) return [`### ${s.state}`, '', `- **CAPTURE FAILED** ${s.failed}`, '']
    return [
      `### ${s.state}`,
      '',
      ...(s.topIssues?.length ? s.topIssues.map((i) => `- **${i.severity} ${i.code}** ${i.detail}`) : ['- 无 P1/P2 自动检出']),
      '',
    ]
  }),
].join('\n')

fs.writeFileSync(path.join(OUT, 'evidence.json'), JSON.stringify(all, null, 2))
fs.writeFileSync(path.join(OUT, 'SUMMARY.md'), summaryMd)
log(`\nWrote ${path.relative(ROOT, OUT)} · ${summary.length} states · ${totals.issues} issue candidates`)
log(`P1 ${totals.p1} · P2 ${totals.p2}`)
