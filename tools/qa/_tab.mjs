import { openApp, closeTab } from './cdp.mjs'
const { cdp, tab } = await openApp({ width: 390, height: 844, mobile: true })
await new Promise(r=>setTimeout(r,900))
await cdp.eval(`document.querySelector('#scenarioBtn').click()`)
await new Promise(r=>setTimeout(r,300))
for (let i=0;i<20;i++){
  await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9,nativeVirtualKeyCode:9})
  await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9,nativeVirtualKeyCode:9})
  const info=await cdp.eval(`(() => { const a=document.activeElement; return { tag:a?.tagName, id:a?.id, cls:String(a?.className||'').slice(0,30), label:a?.getAttribute?.('aria-label')||a?.textContent?.trim().slice(0,20), inside:document.querySelector('#scenarioSheet').contains(a) } })()`)
  console.log(i, JSON.stringify(info))
}
cdp.close(); await closeTab(tab.id); process.exit(0)
