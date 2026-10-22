import { openApp, closeTab } from './cdp.mjs'
const { cdp, tab } = await openApp({ width: 390, height: 844, mobile: true })
await new Promise(r=>setTimeout(r,2500))
const first = await cdp.eval(`navigator.serviceWorker.getRegistrations().then(r=>({count:r.length, active:!!r[0]?.active, controller:!!navigator.serviceWorker.controller}))`)
await cdp.navigate('http://127.0.0.1:8787/')
await new Promise(r=>setTimeout(r,1500))
const second = await cdp.eval(`({controller:!!navigator.serviceWorker.controller, shell:!document.querySelector('#shell').hidden})`)
await cdp.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0,connectionType:'none'})
let offline
try {
  await cdp.navigate('http://127.0.0.1:8787/')
  await new Promise(r=>setTimeout(r,1200))
  offline = await cdp.eval(`({loaded:document.readyState, shell:!document.querySelector('#shell')?.hidden, body:document.body.innerText.slice(0,80)})`)
} catch (e) { offline = { error: String(e).slice(0,120) } }
console.log({first, second, offline})
cdp.close(); await closeTab(tab.id); process.exit(0)
