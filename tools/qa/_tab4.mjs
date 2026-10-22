import { openApp, closeTab } from './cdp.mjs'
const { cdp, tab } = await openApp({ width: 390, height: 844, mobile: true })
await new Promise(r=>setTimeout(r,900))
const out = await cdp.eval(`(async () => {
  document.querySelector('#scenarioBtn').click()
  await new Promise(r=>setTimeout(r,300))
  const panel = document.querySelector('#scenarioSheet .sheet-panel')
  const f = [...panel.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter(n=>n.getClientRects().length)
  return f.map((el,i)=>({i,tag:el.tagName,cls:String(el.className).slice(0,30),label:(el.getAttribute('aria-label')||el.textContent||'').trim().slice(0,20),tabindex:el.getAttribute('tabindex')}))
})()`)
console.log(JSON.stringify(out,null,1))
cdp.close(); await closeTab(tab.id); process.exit(0)
