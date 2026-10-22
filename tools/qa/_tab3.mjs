import { openApp, closeTab } from './cdp.mjs'
const { cdp, tab } = await openApp({ width: 390, height: 844, mobile: true })
await new Promise(r=>setTimeout(r,900))
const out = await cdp.eval(`(async () => {
  document.querySelector('#scenarioBtn').click()
  await new Promise(r=>setTimeout(r,300))
  const sheet = document.querySelector('#scenarioSheet')
  const panel = sheet.querySelector('.sheet-panel')
  const f = [...panel.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter(n=>n.getClientRects().length)
  f[f.length-1].focus()
  const ev = new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true})
  document.dispatchEvent(ev)
  await new Promise(r=>setTimeout(r,80))
  return { trap: window.__trap||0, overlay: window.__trapOverlay, prevented: ev.defaultPrevented, active: document.activeElement?.outerHTML?.slice(0,120), count:f.length }
})()`)
console.log(out)
cdp.close(); await closeTab(tab.id); process.exit(0)
