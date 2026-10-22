import { openApp, login, closeTab } from './cdp.mjs'
const { cdp, tab } = await openApp({ width: 390, height: 844, mobile: true })
await new Promise(r=>setTimeout(r,900))
const out = await cdp.eval(`(async () => {
  document.querySelector('#convList .conv-main')?.click()
  await new Promise(r=>setTimeout(r,900))
  const item = document.querySelector('#convList .conv-item.active')
  const more = item?.querySelector('.conv-more')
  more?.click()
  await new Promise(r=>setTimeout(r,150))
  const menu = document.querySelector('#convPopover')
  const rename = menu?.querySelector('[data-action="rename"]')
  const before = { hasMenu: !!menu, hasRename: !!rename, sidebarOpen: document.body.classList.contains('sidebar-open') }
  rename?.click()
  await new Promise(r=>setTimeout(r,20))
  const at20 = !!document.querySelector('.conv-rename-input')
  await new Promise(r=>setTimeout(r,250))
  const at270 = { input: !!document.querySelector('.conv-rename-input'), html: document.querySelector('#convList .conv-item.active')?.innerHTML.slice(0,300), sidebarOpen: document.body.classList.contains('sidebar-open') }
  return { before, at20, at270 }
})()`)
console.log(JSON.stringify(out, null, 2))
cdp.close(); await closeTab(tab.id); process.exit(0)
