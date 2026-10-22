import { openApp, closeTab } from './cdp.mjs'
const { cdp, tab } = await openApp({ width: 390, height: 844, mobile: true })
await new Promise(r=>setTimeout(r,900))
const out = await cdp.eval(`(async () => {
  document.querySelector('#scenarioBtn').click()
  await new Promise(r=>setTimeout(r,300))
  const sheet = document.querySelector('#scenarioSheet')
  const panel = sheet.querySelector('.sheet-panel')
  const f = [...panel.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter(n=>n.getClientRects().length)
  const last = f[f.length-1]
  last.focus()
  const before = document.activeElement.textContent.slice(0,20)
  const ev = new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true})
  const ret = document.dispatchEvent(ev)
  await new Promise(r=>setTimeout(r,50))
  return { count:f.length, before, after: document.activeElement.textContent.slice(0,20), afterId: document.activeElement.id, prevented: ev.defaultPrevented, ret, first: f[0].textContent.slice(0,20) }
})()`)
console.log(out)
cdp.close(); await closeTab(tab.id); process.exit(0)
