import { openApp, closeTab } from './cdp.mjs'
const { cdp, tab } = await openApp({ width: 1280, height: 900, mobile: false })
cdp.on('Runtime.exceptionThrown', p=>console.log('EXC',p.exceptionDetails?.exception?.description?.slice(0,200)))
await new Promise(r=>setTimeout(r,900))
const before = await cdp.eval(`performance.getEntriesByType('resource').filter(r=>r.name.includes('katex')).length`)
await cdp.navigate('http://127.0.0.1:8787/c/61998dc7-5771-49fd-9e2b-52c8e39ae717')
await new Promise(r=>setTimeout(r,2500))
const after = await cdp.eval(`({
  katexDom: document.querySelectorAll('.katex').length,
  katexResources: performance.getEntriesByType('resource').filter(r=>r.name.includes('katex')).map(r=>r.name.split('/').pop()),
  text: document.querySelector('#thread .md')?.innerText || ''
})`)
console.log({before, ...after})
cdp.close(); await closeTab(tab.id); process.exit(0)
