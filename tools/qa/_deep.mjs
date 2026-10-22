import { openApp, closeTab } from './cdp.mjs'
const { cdp, tab } = await openApp({ width: 1280, height: 900, mobile: false })
cdp.on('Runtime.exceptionThrown', p=>console.log('EXC',p.exceptionDetails?.exception?.description?.slice(0,300)))
await new Promise(r=>setTimeout(r,900))
const convs = await cdp.eval(`fetch('/api/conversations?limit=5',{credentials:'same-origin'}).then(r=>r.json())`)
console.log('conv total', convs.total, convs.conversations.map(c=>c.title.slice(0,10)))
const id = convs.conversations[1]?.id
await cdp.navigate(`http://127.0.0.1:8787/c/${id}`)
await new Promise(r=>setTimeout(r,1800))
const out = await cdp.eval(`({path:location.pathname, title:document.querySelector('#topbarName')?.textContent, msgs:document.querySelectorAll('#thread .msg').length, current:localStorage.getItem('dsh.current'), cached:!!localStorage.getItem('dsh.cache.v1')})`)
console.log(out, 'wanted', id)
cdp.close(); await closeTab(tab.id); process.exit(0)
