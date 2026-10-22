// Accessibility + layout probe (contrast, focus trap, targets, landmarks).
import { openApp, login, closeTab } from './cdp.mjs'

function parseColor(value) {
  const match = String(value).match(/rgba?\(([^)]+)\)/)
  if (!match) return null
  const parts = match[1].split(',').map((part) => parseFloat(part.trim()))
  if (parts.length < 3) return null
  return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 }
}

function luminance({ r, g, b }) {
  const channel = (v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrast(a, b) {
  const l1 = luminance(a)
  const l2 = luminance(b)
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

const script = `(() => {
  const nodes = []
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const seen = new Set()
  while (walker.nextNode()) {
    const node = walker.currentNode
    const text = node.nodeValue.trim()
    if (!text || text.length < 2) continue
    const el = node.parentElement
    if (!el || seen.has(el)) continue
    seen.add(el)
    const rect = el.getBoundingClientRect()
    const style = getComputedStyle(el)
    if (!rect.width || !rect.height) continue
    if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') continue
    if (el.closest('[hidden]')) continue
    const parse = (value) => {
      const m = String(value).match(/rgba?\(([^)]+)\)/)
      if (!m) return null
      const p = m[1].split(',').map(Number)
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }
    }
    const chain = []
    let cur = el
    while (cur) {
      const c = parse(getComputedStyle(cur).backgroundColor)
      if (c && c.a > 0) chain.push(c)
      cur = cur.parentElement
    }
    let bg = { r: 255, g: 255, b: 255, a: 1 }
    for (let i = chain.length - 1; i >= 0; i -= 1) {
      const c = chain[i]
      bg = {
        r: c.r * c.a + bg.r * (1 - c.a),
        g: c.g * c.a + bg.g * (1 - c.a),
        b: c.b * c.a + bg.b * (1 - c.a),
        a: 1,
      }
    }
    nodes.push({
      text: text.slice(0, 40),
      color: style.color,
      bg: 'rgb(' + Math.round(bg.r) + ', ' + Math.round(bg.g) + ', ' + Math.round(bg.b) + ')',
      size: parseFloat(style.fontSize),
      weight: style.fontWeight,
      tag: el.tagName,
      cls: String(el.className).slice(0, 40),
      id: el.id,
    })
  }
  return nodes
})()`

async function main() {
  const { cdp, tab } = await openApp({ width: 390, height: 844, mobile: true })
  await cdp.waitFor(() => cdp.eval('document.readyState === "complete"'), 15_000)
  await login(cdp)
  await new Promise((r) => setTimeout(r, 900))
  await cdp.eval(`document.querySelector('#convList .conv-main')?.click()`)
  await new Promise((r) => setTimeout(r, 1200))

  const nodes = await cdp.eval(script)
  const failures = []
  for (const node of nodes) {
    const fg = parseColor(node.color)
    const bg = parseColor(node.bg)
    if (!fg || !bg) continue
    const ratio = contrast(fg, bg)
    const large = node.size >= 24 || (node.size >= 18.66 && Number(node.weight) >= 700)
    const min = large ? 3 : 4.5
    if (ratio < min) failures.push({ ...node, ratio: Math.round(ratio * 100) / 100, min })
  }

  const focus = await cdp.eval(`(async () => {
    document.querySelector('#scenarioBtn').click()
    await new Promise(r => setTimeout(r, 250))
    const sheet = document.querySelector('#scenarioSheet')
    const before = sheet.contains(document.activeElement)
    const visible = [...sheet.querySelectorAll('button, [href], input, textarea, [tabindex]:not([tabindex="-1"])')].filter(n => n.getClientRects().length)
    return { before, visible: visible.length }
  })()`)
  let stayedInside = true
  for (let i = 0; i < 16; i += 1) {
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 })
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 })
    const inside = await cdp.eval(`document.querySelector('#scenarioSheet').contains(document.activeElement)`)
    if (!inside) stayedInside = false
  }
  focus.inside = stayedInside
  await cdp.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
  await new Promise((r) => setTimeout(r, 200))

  const meta = await cdp.eval(`({
    landmarks: [...document.querySelectorAll('main, header, nav, aside, form')].map(n => n.tagName + '.' + (n.className || '')),
    toolExpanded: [...document.querySelectorAll('.tool-head')].map(el => el.getAttribute('aria-expanded')),
    dialogAria: [...document.querySelectorAll('[role="dialog"]')].map(el => ({ label: el.getAttribute('aria-label'), modal: el.getAttribute('aria-modal') })),
    title: document.title,
    skip: !!document.querySelector('.skip-link'),
  })`)

  const report = {
    contrastFailures: failures,
    focus,
    meta,
    checkedTextNodes: nodes.length,
  }
  console.log(JSON.stringify(report, null, 2))
  const fs = await import('node:fs')
  fs.writeFileSync('/tmp/dsh-a11y.json', JSON.stringify(report, null, 2))
  cdp.close()
  await closeTab(tab.id)
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
