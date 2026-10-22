import { openApp, closeTab } from './cdp.mjs'
const { cdp, tab } = await openApp({ width: 390, height: 844, mobile: true })
const errors=[]; const fails=[]
cdp.on('Runtime.exceptionThrown', p=>errors.push(p.exceptionDetails?.exception?.description?.slice(0,200)))
cdp.on('Network.loadingFailed', p=>{ if(!p.canceled) fails.push(p.errorText) })
await new Promise(r=>setTimeout(r,2200))
const out = await cdp.eval(`({
  shell: !document.querySelector('#shell').hidden,
  convs: document.querySelectorAll('#convList .conv-item').length,
  empty: !document.querySelector('#emptyState').hidden,
  theme: document.documentElement.dataset.theme || 'auto',
  sw: !!navigator.serviceWorker.controller,
  app: [...document.scripts].map(s=>s.src).find(s=>s.includes('app.js')),
  bundle: [...document.styleSheets].map(s=>s.href).filter(Boolean).find(h=>h.includes('bundle')),
  settings: !!document.querySelector('#settingsBtn'),
  title: document.title
})`)
console.log(JSON.stringify({out, errors, fails},null,2))
await cdp.screenshot('/tmp/dsh-final-mobile.png')
cdp.close(); await closeTab(tab.id); process.exit(0)
