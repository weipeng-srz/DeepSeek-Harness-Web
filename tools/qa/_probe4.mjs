import { openApp, closeTab } from './cdp.mjs'
const { cdp, tab } = await openApp({ width: 390, height: 844, mobile: true })
cdp.on('Runtime.exceptionThrown', p => console.log('EXC', p.exceptionDetails?.exception?.description))
await new Promise(r=>setTimeout(r,900))
await cdp.eval(`(async () => {
  const r = await fetch('/api/conversations?q=' + encodeURIComponent('只回复 OK'), {credentials:'same-origin'}).then(r=>r.json())
  const c = r.conversations.find(x=>x.id==='9e1bb713-c453-436b-acbd-0a9c7dccee5b')
  if (c) {
    const item = [...document.querySelectorAll('#convList .conv-item')].find(el=>el.dataset.id===c.id)
    item?.querySelector('.conv-main').click()
  }
  await new Promise(r=>setTimeout(r,1200))
  return true
})()`)
const before = await cdp.eval(`({texts:[...document.querySelectorAll('#thread .msg.user .bubble-text')].map(n=>n.textContent), html: document.querySelector('#thread .msg.user')?.outerHTML.slice(0,500)})`)
console.log('BEFORE', before)
await cdp.eval(`document.querySelector('#thread .msg.user [aria-label="编辑这条提问"]')?.click()`)
await new Promise(r=>setTimeout(r,250))
await cdp.eval(`(() => {
  const area = document.querySelector('.bubble-edit')
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set
  setter.call(area, 'EDITED-PROBE')
  area.dispatchEvent(new Event('input',{bubbles:true}))
  document.querySelector('.user-edit-actions .primary').click()
  return true
})()`)
await new Promise(r=>setTimeout(r,250))
await cdp.eval(`document.querySelector('#confirmOk').click()`)
await new Promise(r=>setTimeout(r,3000))
const after = await cdp.eval(`({texts:[...document.querySelectorAll('#thread .msg.user .bubble-text')].map(n=>n.textContent), bubbles:[...document.querySelectorAll('#thread .msg.user .bubble')].map(n=>({cls:n.className,hidden:n.hidden,text:n.textContent.slice(0,40)})), msgCount:document.querySelectorAll('#thread .msg').length})`)
console.log('AFTER', JSON.stringify(after,null,2))
cdp.close(); await closeTab(tab.id); process.exit(0)
