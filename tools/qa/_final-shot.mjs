import { openApp, closeTab } from './cdp.mjs'
for (const [w,h,m,name] of [[1280,900,false,'/tmp/final-desktop.png'],[390,844,true,'/tmp/final-mobile.png']]) {
  const { cdp, tab } = await openApp({ width:w, height:h, mobile:m })
  await new Promise(r=>setTimeout(r,1800))
  await cdp.screenshot(name)
  cdp.close(); await closeTab(tab.id)
}
process.exit(0)
