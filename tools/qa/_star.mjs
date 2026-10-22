import { openApp, closeTab } from './cdp.mjs'
const { cdp, tab } = await openApp({ width: 1280, height: 900, mobile: false })
cdp.on('Runtime.exceptionThrown', p=>console.log('EXC',p.exceptionDetails?.exception?.description?.slice(0,200)))
await new Promise(r=>setTimeout(r,1000))
const convs = await cdp.eval(`fetch('/api/conversations?limit=10',{credentials:'same-origin'}).then(r=>r.json())`)
const target = convs.conversations.find(c=>c.messageCount>=4) || convs.conversations[0]
console.log('target', target.title, target.messageCount)
await cdp.navigate(`http://127.0.0.1:8787/c/${target.id}`)
await new Promise(r=>setTimeout(r,1600))
const out = await cdp.eval(`({
  msgs: document.querySelectorAll('#thread .msg').length,
  users: document.querySelectorAll('#thread .msg.user').length,
  labels: [...document.querySelectorAll('#thread .msg.user button')].map(b=>b.getAttribute('aria-label')||b.textContent.trim()).slice(0,10),
  version: [...document.scripts].map(s=>s.src).find(s=>s.includes('app.js')),
  html: document.querySelector('#thread .msg.user')?.outerHTML.slice(0,400)
})`)
console.log(JSON.stringify(out,null,2))
cdp.close(); await closeTab(tab.id); process.exit(0)
