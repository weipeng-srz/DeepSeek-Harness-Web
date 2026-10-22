import { openApp, login, closeTab } from './cdp.mjs'
const { cdp, tab } = await openApp({ width: 390, height: 844, mobile: true })
await new Promise(r=>setTimeout(r,800))
const out = await cdp.eval(`(() => ({
  innerH: innerHeight, vv: visualViewport?.height, docH: document.documentElement.clientHeight,
  appH: getComputedStyle(document.documentElement).getPropertyValue('--app-h'),
  shellH: document.querySelector('#shell')?.getBoundingClientRect().height,
  composer: document.querySelector('#composer')?.getBoundingClientRect().bottom
}))()`)
console.log('initial', out)
await cdp.eval(`document.querySelector('#convList .conv-main')?.click()`)
await new Promise(r=>setTimeout(r,1200))
const out2 = await cdp.eval(`(() => ({
  innerH: innerHeight, vv: visualViewport?.height, docH: document.documentElement.clientHeight,
  appH: getComputedStyle(document.documentElement).getPropertyValue('--app-h'),
  shellH: document.querySelector('#shell')?.getBoundingClientRect().height,
  composer: document.querySelector('#composer')?.getBoundingClientRect().bottom,
  active: document.activeElement?.id || document.activeElement?.tagName
}))()`)
console.log('conversation', out2)
cdp.close(); await closeTab(tab.id); process.exit(0)
