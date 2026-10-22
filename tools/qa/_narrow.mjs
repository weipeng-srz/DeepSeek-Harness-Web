import { openApp, closeTab } from './cdp.mjs'
const { cdp, tab } = await openApp({ width: 320, height: 700, mobile: true })
cdp.on('Runtime.exceptionThrown', p=>console.log('EXC',p.exceptionDetails?.exception?.description?.slice(0,200)))
await new Promise(r=>setTimeout(r,1200))
await cdp.eval(`document.querySelector('#convList .conv-main')?.click()`)
await new Promise(r=>setTimeout(r,1200))
const out = await cdp.eval(`(() => {
  const root=document.documentElement
  const overflow=[...document.querySelectorAll('body *')].filter(el=>{const r=el.getBoundingClientRect();return r.width&&r.right>innerWidth+1&&getComputedStyle(el).position!=='fixed'}).slice(0,8).map(el=>({tag:el.tagName,cls:String(el.className).slice(0,30),right:Math.round(el.getBoundingClientRect().right)}))
  const small=[...document.querySelectorAll('button, a[href], input')].filter(el=>{const r=el.getBoundingClientRect();return r.width&&r.height&&(r.width<44||r.height<44)&&!el.closest('[hidden]')}).slice(0,10).map(el=>({id:el.id,cls:String(el.className).slice(0,24),w:Math.round(el.getBoundingClientRect().width),h:Math.round(el.getBoundingClientRect().height)}))
  return {w:innerWidth, scrollW:root.scrollWidth, overflow, small, composerBottom:Math.round(document.querySelector('#composer').getBoundingClientRect().bottom), vh:innerHeight}
})()`)
console.log('NARROW', JSON.stringify(out,null,2))
await cdp.eval(`document.querySelector('#scrollArea').scrollTop = 0`)
await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40,nativeVirtualKeyCode:40,modifiers:1})
await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40,nativeVirtualKeyCode:40,modifiers:1})
await new Promise(r=>setTimeout(r,500))
console.log('KEYNAV', await cdp.eval(`({tag:document.activeElement?.tagName, cls:String(document.activeElement?.className).slice(0,30), msgs:document.querySelectorAll('#thread .msg').length})`))
cdp.close(); await closeTab(tab.id); process.exit(0)
