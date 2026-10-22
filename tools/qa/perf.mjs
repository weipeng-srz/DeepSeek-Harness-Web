import { openApp, closeTab } from './cdp.mjs'
const { cdp, tab } = await openApp({ width: 390, height: 844, mobile: true })
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
await cdp.navigate('http://127.0.0.1:8787/')
await new Promise(r=>setTimeout(r,1800))
const data = await cdp.eval(`(() => {
  const nav = performance.getEntriesByType('navigation')[0] || {}
  const paints = Object.fromEntries(performance.getEntriesByType('paint').map(p=>[p.name, Math.round(p.startTime)]))
  const resources = performance.getEntriesByType('resource').map(r=>({name:r.name.split('/').pop().split('?')[0], transfer:r.transferSize, duration:Math.round(r.duration)}))
  return { domContentLoaded: Math.round(nav.domContentLoadedEventEnd||0), load: Math.round(nav.loadEventEnd||0), paints, resources, heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize/1048576) : null }
})()`)
console.log(JSON.stringify(data,null,2))
cdp.close(); await closeTab(tab.id); process.exit(0)
