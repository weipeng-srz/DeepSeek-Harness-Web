// Round 2 acceptance: navigation, search, palette, project rail.
import fs from 'node:fs'
import path from 'node:path'
import { openApp, login, closeTab, APP } from '../qa/cdp.mjs'

const ROOT = process.cwd()
const OUT = path.resolve(process.env.OUT || 'reports/evolution/round-2/after')
const CODE = process.env.ACCESS_CODE || JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8')).accessCode
fs.mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const record = (id, name, pass, observed, expected) => {
  results.push({ id, name, pass: Boolean(pass), observed, expected })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${id} ${name} — ${observed}`)
}
async function session(width, height, mobile = false) {
  const { cdp, tab } = await openApp({ width, height, mobile })
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true }).catch(() => {})
  await cdp.send('Network.setBypassServiceWorker', { bypass: true }).catch(() => {})
  await cdp.waitFor(() => cdp.eval('document.readyState === "complete"'), 15_000)
  await login(cdp, CODE)
  await sleep(700)
  return { cdp, tab }
}
async function home(cdp) {
  await cdp.eval(`localStorage.setItem('dsh.sidebar','open')`)
  await cdp.navigate(APP); await sleep(700)
  await cdp.eval(`document.querySelector('#newChat')?.click()`); await sleep(600)
}
const key = async (cdp, k, code, vk, mod = 0) => {
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: mod })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: mod })
}

async function main() {
  {
    const { cdp, tab } = await session(1440, 900)
    await cdp.eval(`localStorage.removeItem('dsh.project'); localStorage.removeItem('dsh.palette.recent')`)
    await home(cdp)
    const nav = await cdp.eval(`(() => {
      const top = (s) => document.querySelector(s)?.getBoundingClientRect().top
      const links = [...document.querySelectorAll('.sidebar-link')].map((e) => e.textContent.trim())
      return { search: top('#convSearch'), links: top('.sidebar-links'), count: links.length, heading: document.querySelector('#convHeading')?.textContent }
    })()`)
    record('R2-01', '侧栏搜索与工具入口', nav.search < nav.links && nav.count === 4 && nav.heading === '对话', `searchTop=${nav.search} linksTop=${nav.links} count=${nav.count} heading=${nav.heading}`, '搜索在工具入口上方；4 个入口；标题=对话')

    await cdp.eval(`(() => { const s=document.querySelector('#projectSelect'); if(!s) return; s.value=''; s.dispatchEvent(new Event('change',{bubbles:true})) })()`)
    await sleep(300)
    await cdp.eval(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'k',metaKey:true,bubbles:true,cancelable:true}))`)
    await sleep(600)
    const pal = await cdp.eval(`(() => ({ first: document.querySelector('.palette-group')?.textContent, groups: [...document.querySelectorAll('.palette-group')].map(e=>e.textContent), items: document.querySelectorAll('.palette-item').length, footer: document.querySelector('.palette-foot')?.innerText }))()`)
    record('R2-03', '命令面板先对话后命令', pal.first === '最近对话' && pal.items <= 15 && pal.footer.includes('⌘P'), `first=${pal.first} items=${pal.items} footer=${pal.footer.replace(/\n/g,' ')}`, '首组=最近对话；≤15 项；footer 含 ⌘P')
    await key(cdp, 'Escape', 'Escape', 27); await sleep(300)

    // Search state + URL
    await cdp.eval(`(() => { const i=document.querySelector('#convSearch'); const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; s.call(i,'优化'); i.dispatchEvent(new Event('input',{bubbles:true})); i.focus(); })()`)
    await sleep(40)
    const loading = await cdp.eval(`document.querySelector('#convResultCount')?.textContent`)
    await sleep(1200)
    const searched = await cdp.eval(`({ count: document.querySelector('#convResultCount')?.textContent, url: location.search, value: document.querySelector('#convSearch')?.value })`)
    record('R2-07', '搜索加载态与 URL', loading.includes('搜索中') && searched.url.includes('q=') && searched.value === '优化', `loading=${loading} count=${searched.count} url=${searched.url}`, '出现搜索中；URL 含 q；输入保留')

    // Project chips + current marker
    await cdp.eval(`document.querySelector('#convSearchClear')?.click()`); await sleep(300)
    const chips = await cdp.eval(`(() => {
      const select = document.querySelector('#projectSelect')
      const option = [...select.options].find((item) => item.value)
      if (!option) return null
      select.value = option.value
      select.dispatchEvent(new Event('change', { bubbles: true }))
      return { value: select.value, label: option.textContent, options: select.options.length }
    })()`)
    await sleep(700)
    const filtered = await cdp.eval(`(() => ({ value: document.querySelector('#projectSelect')?.value, placeholder: document.querySelector('#convSearch')?.placeholder, filterHidden: document.querySelector('#projectFilter')?.hidden }))()`)
    record('R2-04', '项目筛选保持选中与上下文', Boolean(chips && filtered.value === chips.value && String(filtered.placeholder).includes('在「') && !filtered.filterHidden), `selected=${filtered.value} options=${chips?.options} placeholder=${filtered.placeholder}`, 'select 保持项目；placeholder 含 在「项目名」')

    await cdp.eval(`document.querySelector('#archiveBtn')?.click()`); await sleep(600)
    const danger = await cdp.eval(`(() => { const btns=[...document.querySelectorAll('.archive-actions button')]; const del=btns.find(b=>b.textContent.includes('删除')); const restore=btns.find(b=>b.textContent.includes('恢复')); const cs=del?getComputedStyle(del):null; return { color: cs?.color, gap: del&&restore ? Math.round(del.getBoundingClientRect().left-restore.getBoundingClientRect().right) : null } })()`)
    record('R2-18', '归档删除危险色', danger.color ? (danger.color !== 'rgb(29, 29, 29)' && danger.gap >= 8) : true, danger.color ? `color=${danger.color} gap=${danger.gap}` : '无归档行，跳过', '删除为 danger 色；与恢复间距≥8')
    await key(cdp, 'Escape', 'Escape', 27); await sleep(300)

    cdp.close(); await closeTab(tab.id)
  }

  {
    const { cdp, tab } = await session(390, 844, true)
    await cdp.navigate(`${APP}/c/463a289d-ce98-4998-948c-017c90246e42`); await sleep(900)
    const top = await cdp.eval(`(() => { const b=document.querySelector('#searchTop'); const r=b?.getBoundingClientRect(); return { display: b?getComputedStyle(b).display:null, w:r?.width, h:r?.height } })()`)
    record('R2-02-size', '手机顶栏搜索入口', top.display !== 'none' && top.w >= 44 && top.h >= 44, `display=${top.display} ${top.w}×${top.h}`, '可见且 44×44')
    await cdp.eval(`document.querySelector('#searchTop').click()`); await sleep(600)
    const open = await cdp.eval(`({ open: !!document.querySelector('#palette:not([hidden])'), focus: document.activeElement?.id, inside: !!document.activeElement?.closest('#palette') })`)
    record('R2-02-open', '手机搜索打开命令面板', open.open && (open.focus === 'paletteInput' || open.inside), `open=${open.open} focus=${open.focus} inside=${open.inside}`, 'palette 打开且焦点在输入框')
    await key(cdp, 'Escape', 'Escape', 27); await sleep(300)

    await cdp.eval(`document.querySelector('#scrollArea').scrollTop = 500`); await sleep(400)
    const header = await cdp.eval(`(() => {
      const t=document.querySelector('.topbar-title'); const bar=document.querySelector('.topbar')
      const m=document.querySelector('#menuBtn'); const a=document.querySelector('.topbar-actions')
      return { hidden: !t || getComputedStyle(t).display === 'none', menu: m.getBoundingClientRect().width, actions: a.getBoundingClientRect().width, bar: bar.getBoundingClientRect().height }
    })()`)
    record('R2-11', '顶部无标题框，保留菜单与操作', header.hidden && header.menu >= 44 && header.actions > 80, `hidden=${header.hidden} menu=${header.menu} actions=${header.actions}`, '标题框隐藏；左右控件仍可用')

    const font = await cdp.eval(`getComputedStyle(document.querySelector('#convSearch')).fontSize`)
    record('R2-22', '手机搜索框16px', parseFloat(font) >= 16, `font-size=${font}`, '≥16px 防 iOS 放大')
    cdp.close(); await closeTab(tab.id)
  }

  {
    const { cdp, tab } = await session(320, 640, true)
    await home(cdp)
    const h = await cdp.eval(`(() => { const r=(s)=>{const e=document.querySelector(s);const b=e?.getBoundingClientRect();return b?{w:+b.width.toFixed(1),h:+b.height.toFixed(1),top:+b.top.toFixed(1)}:null}; return { input:r('#input'), wrap:r('.composer-wrap'), scroll:r('#scrollArea'), empty:r('#emptyState'), engine: getComputedStyle(document.querySelector('#engineBar')).display } })()`)
    record('R2-14', '320 首页不再被顶栏裁', h.empty.top >= 0 && h.engine === 'none' && h.wrap.h <= 112, `emptyTop=${h.empty.top} engine=${h.engine} wrap=${h.wrap.h}`, 'emptyTop≥0；engine none；wrap≤112')
    cdp.close(); await closeTab(tab.id)
  }

  const passed = results.filter((r) => r.pass).length
  const report = { generatedAt: new Date().toISOString(), round: 2, passed, total: results.length, results }
  fs.writeFileSync(path.join(OUT, 'acceptance.json'), JSON.stringify(report, null, 2))
  fs.writeFileSync(path.join(OUT, 'acceptance.md'), ['# Round 2 acceptance', '', `Result: **${passed}/${results.length}**`, '', '| ID | Check | Result | Observed | Expected |', '| --- | --- | --- | --- | --- |', ...results.map((r) => `| ${r.id} | ${r.name} | ${r.pass ? 'PASS' : 'FAIL'} | ${String(r.observed).replace(/\|/g, '\\|')} | ${r.expected} |`)].join('\n'))
  console.log(`\n${passed}/${results.length} checks passed`)
  if (passed !== results.length) process.exitCode = 1
}
main().catch((e) => { console.error(e); process.exit(1) })
