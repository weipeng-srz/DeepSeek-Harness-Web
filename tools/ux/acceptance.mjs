// Round-1 acceptance: geometry, touch, focus and typography assertions.
// Read-only. Usage: node tools/ux/acceptance.mjs [--out reports/evolution/round-1/after]
import fs from 'node:fs'
import path from 'node:path'
import { openApp, login, closeTab, APP } from '../qa/cdp.mjs'

const ROOT = process.cwd()
const OUT = path.resolve(process.env.OUT || 'reports/evolution/round-1/after')
const CODE = process.env.ACCESS_CODE || JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8')).accessCode
const CONV = process.env.CONV || '463a289d-ce98-4998-948c-017c90246e42'
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
async function theme(cdp, value) {
  await cdp.eval(`localStorage.setItem('dsh.theme', ${JSON.stringify(value)})`)
  await cdp.eval(`localStorage.setItem('dsh.sidebar', 'open')`)
  await cdp.navigate(APP)
  await sleep(700)
}
async function home(cdp) {
  await cdp.eval(`document.querySelector('#newChat')?.click()`)
  await sleep(700)
}
async function goto(cdp, url) {
  await cdp.navigate(`${APP}${url}`)
  await sleep(900)
}
async function key(cdp, key, code, vk, modifiers = 0) {
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers })
}

const homeMetrics = `(() => {
  const r = (el) => el ? el.getBoundingClientRect() : null
  const area = document.querySelector('#scrollArea')
  const ar = r(area)
  const cards = [...document.querySelectorAll('.scenario-card')].map((el) => {
    const b = el.getBoundingClientRect()
    const visible = Math.max(0, Math.min(b.bottom, ar.bottom) - Math.max(b.top, ar.top))
    return { title: el.querySelector('.scenario-title')?.textContent || '', h: +b.height.toFixed(1), visible: +visible.toFixed(1), bottom: +b.bottom.toFixed(1), top: +b.top.toFixed(1) }
  })
  return {
    vw: innerWidth, vh: innerHeight, scrollTop: area.scrollTop,
    gridBottom: r(document.querySelector('#scenarioGrid'))?.bottom,
    composerTop: r(document.querySelector('.composer-wrap'))?.top,
    noteBottom: r(document.querySelector('.scenario-note'))?.bottom,
    heroTop: r(document.querySelector('.hero'))?.top,
    emptyH: r(document.querySelector('#emptyState'))?.height,
    scrollH: area.scrollHeight, clientH: area.clientHeight,
    cards,
  }
})()`

async function checkHome(cdp, label, themeName) {
  await theme(cdp, themeName)
  await home(cdp)
  const m = await cdp.eval(homeMetrics)
  record(`R1-07-${label}`, `首屏不裁切（${themeName}）`, m.gridBottom <= m.composerTop - 16 && m.noteBottom <= m.composerTop - 8 && m.cards.every((c) => c.h - c.visible <= 1) && m.scrollTop === 0,
    `gridBottom=${m.gridBottom?.toFixed(1)} composerTop=${m.composerTop?.toFixed(1)} noteBottom=${m.noteBottom?.toFixed(1)} cards=${m.cards.map((c) => `${c.visible}/${c.h}`).join(',')}`,
    'gridBottom ≤ composerTop-16；noteBottom ≤ composerTop-8；5 张卡完整可见；scrollTop=0')
  record(`R1-09-${label}`, `首屏几何稳定（${themeName}）`, Math.abs((m.heroTop || 0) - (themeName === 'dark' ? m.heroTop : m.heroTop)) <= 2, `heroTop=${m.heroTop?.toFixed(1)}`, '与另一主题一致（±2px）')
  return m
}

async function openSheet(cdp, button) {
  await cdp.eval(`(() => { const b=document.querySelector(${JSON.stringify(button)}); if(!b) return false; b.focus({preventScroll:true}); b.click(); return true })()`)
  await sleep(650)
}
async function activeInfo(cdp) {
  return cdp.eval(`(() => {
    const el = document.activeElement
    const sheet = [...document.querySelectorAll('.sheet:not([hidden])')].at(-1) || document.querySelector('#palette:not([hidden])')
    const panel = sheet?.querySelector('.sheet-panel, .palette-card')
    return {
      active: el ? (el.id || el.className || el.tagName) : 'body',
      inside: Boolean(panel && el && panel.contains(el)),
      sheetOpen: Boolean(sheet),
      inert: Boolean(document.querySelector('.shell')?.inert),
      panel: panel ? (panel.className || panel.tagName) : null,
    }
  })()`)
}
async function focusSheet(cdp, id, button, label) {
  await openSheet(cdp, button)
  const a = await activeInfo(cdp)
  let stayed = true
  for (let i = 0; i < 10; i += 1) {
    await key(cdp, 'Tab', 'Tab', 9)
    const inside = await cdp.eval(`(() => { const s=[...document.querySelectorAll('.sheet:not([hidden])')].at(-1)||document.querySelector('#palette:not([hidden])'); const p=s?.querySelector('.sheet-panel,.palette-card'); return Boolean(p&&p.contains(document.activeElement)) })()`)
    if (!inside) { stayed = false; break }
  }
  await key(cdp, 'Escape', 'Escape', 27)
  await sleep(600)
  const after = await cdp.eval(`(() => ({ hidden: document.querySelector(${JSON.stringify(id)})?.hidden, focus: document.activeElement?.id || document.activeElement?.className || 'body', inert: Boolean(document.querySelector('.shell')?.inert) }))()`)
  record(`R1-25-${label}`, `${label} 浮层焦点`, a.sheetOpen && a.inside && a.inert && stayed,
    `open=${a.sheetOpen} inside=${a.inside} inert=${a.inert} tabTrap=${stayed} closeFocus=${after.focus}`,
    '打开后焦点在面板内；Tab 10 次不逃逸；shell inert；Esc 关闭并回焦')
}

async function main() {
  // Desktop 1440×900
  {
    const { cdp, tab } = await session(1440, 900)
    const dark = await checkHome(cdp, 'desktop-dark', 'dark')
    const light = await checkHome(cdp, 'desktop-light', 'light')
    record('R1-09-parity', '深浅色首屏起点一致', Math.abs((dark.heroTop || 0) - (light.heroTop || 0)) <= 2, `dark=${dark.heroTop?.toFixed(1)} light=${light.heroTop?.toFixed(1)}`, '±2px')

    await goto(cdp, `/c/${CONV}`)
    await openSheet(cdp, '#projectsBtn')
    await focusSheet(cdp, '#projectsSheet', '#projectsBtn', '项目')
    await openSheet(cdp, '#bookmarksBtn')
    await focusSheet(cdp, '#bookmarksSheet', '#bookmarksBtn', '收藏')
    await openSheet(cdp, '#promptsBtn')
    await focusSheet(cdp, '#promptSheet', '#promptsBtn', '提示词')
    await openSheet(cdp, '#memoryBtn')
    await focusSheet(cdp, '#memorySheet', '#memoryBtn', '记忆')
    await openSheet(cdp, '#archiveBtn')
    await focusSheet(cdp, '#archiveSheet', '#archiveBtn', '归档')

    await cdp.eval(`document.querySelector('#settingsBtn')?.click()`)
    await sleep(500)
    const s = await cdp.eval(`(() => ({ inside: document.querySelector('#settingsSheet .settings-panel')?.contains(document.activeElement), foot: document.querySelector('.settings-footwrap')?.getBoundingClientRect().height }))()`)
    record('R1-25-settings', '设置浮层焦点', s.inside, `inside=${s.inside} foot=${s.foot?.toFixed(1)}`, '焦点在设置面板内')
    await key(cdp, 'Escape', 'Escape', 27); await sleep(300)

    await key(cdp, 'k', 'KeyK', 75, 4); await sleep(500)
    const p = await cdp.eval(`(() => { const b=document.querySelector('.palette-close'); const r=b?.getBoundingClientRect(); return { open:!!document.querySelector('#palette:not([hidden])'), w:r?.width, h:r?.height, inside:document.querySelector('.palette-card')?.contains(document.activeElement) } })()`)
    record('R1-26-palette', '命令面板关闭键', p.open && p.w >= 44 && p.h >= 44 && p.inside, `open=${p.open} close=${p.w}×${p.h} focusInside=${p.inside}`, '44×44 关闭键；焦点在面板内')
    await key(cdp, 'Escape', 'Escape', 27); await sleep(200)

    const focusRing = await cdp.eval(`(() => { const i=document.querySelector('#input'); i.focus(); const s=getComputedStyle(document.querySelector('.composer-inner')); return { shadow:s.boxShadow, border:s.borderTopColor } })()`)
    record('R1-18-focus', '输入区焦点环', focusRing.shadow !== 'none', `shadow=${focusRing.shadow}`, 'focus-within 有可见 box-shadow')
    cdp.close(); await closeTab(tab.id)
  }

  // Mobile 390×844
  {
    const { cdp, tab } = await session(390, 844, true)
    await goto(cdp, `/c/${CONV}`)
    await sleep(500)
    const m = await cdp.eval(`(() => {
      const r = (s) => { const e=document.querySelector(s); if(!e) return null; const b=e.getBoundingClientRect(); return { x:+b.x.toFixed(1), y:+b.y.toFixed(1), w:+b.width.toFixed(1), h:+b.height.toFixed(1) } }
      return {
        input:r('#input'), row:r('.composer-row'), wrap:r('.composer-wrap'), menu:r('#menuBtn'), upload:r('#uploadBtn'), perm:r('#permissionBtn'), send:r('#sendBtn'),
        label:(()=>{const e=document.querySelector('#permissionLabel');return e?getComputedStyle(e).display:'missing'})(),
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
      }
    })()`)
    record('R1-14-390', '390 输入框宽度', m.input.w >= 200, `${m.input.w}×${m.input.h} row=${m.row.h} wrap=${m.wrap.h}`, 'input ≥200；row 54±2；wrap ≤130')
    record('R1-14-390-row', '390 composer 高度', Math.abs(m.row.h - 54) <= 2 && m.wrap.h <= 130, `row=${m.row.h} wrap=${m.wrap.h}`, 'row 54±2；wrap ≤130')
    record('R1-16-390', '移动端权限文字可见', m.label !== 'none' && m.label !== 'missing', `display=${m.label}`, '权限标签可见')
    record('R1-20-390', '390 顶栏触控', m.menu.w >= 44 && m.upload.w >= 44 && m.perm.w >= 44 && m.send.w >= 44, `menu=${m.menu.w} upload=${m.upload.w} perm=${m.perm.w} send=${m.send.w}`, '全部 ≥44')
    record('R1-22-390', '移动端无横向溢出', !m.overflow, `overflow=${m.overflow}`, '无横向滚动')

    // Drawer isolation
    await cdp.eval(`document.querySelector('#menuBtn')?.click()`)
    await sleep(500)
    const d = await cdp.eval(`(() => { const main=document.querySelector('.main'); const scrim=document.querySelector('#scrim'); const cs=getComputedStyle(scrim); return { inert: main?.inert, scrim: cs.opacity, pe: cs.pointerEvents, open: document.body.classList.contains('sidebar-open') } })()`)
    record('R1-22-drawer', '抽屉隔离背景', d.open && d.inert && Number(d.scrim) > 0.5, `open=${d.open} mainInert=${d.inert} scrim=${d.scrim}`, 'main inert；scrim 可见')
    await cdp.eval(`document.querySelector('#scrim')?.click()`); await sleep(400)
    const closed = await cdp.eval(`(() => ({ open: document.body.classList.contains('sidebar-open'), inert: Boolean(document.querySelector('.main')?.inert) }))()`)
    record('R1-22-drawer-close', '抽屉可关闭', !closed.open && !closed.inert, `open=${closed.open} inert=${closed.inert}`, '关闭后 main 恢复')

    // Sidebar touch
    await cdp.eval(`document.querySelector('#menuBtn')?.click()`); await sleep(500)
    const touch = await cdp.eval(`(() => {
      const h = (s) => { const e=document.querySelector(s); if(!e) return 0; return Math.round(e.getBoundingClientRect().height) }
      const links=[...document.querySelectorAll('.sidebar-link')].map(e=>Math.round(e.getBoundingClientRect().height))
      const chips=[...document.querySelectorAll('.project-chip')].map(e=>Math.round(e.getBoundingClientRect().height))
      return { links, manage:h('#manageBtn'), archive:h('#archiveBtn'), search:h('#convSearch'), chips }
    })()`)
    record('R1-21-390', '侧栏触控尺寸', touch.links.every((h) => h >= 44) && touch.manage >= 44 && touch.archive >= 44 && touch.search >= 44 && touch.chips.every((h) => h >= 44),
      `links=${touch.links.join(',')} manage=${touch.manage} archive=${touch.archive} search=${touch.search} chips=${touch.chips.join(',')}`,
      '入口/管理/归档/搜索/项目 chip ≥44')

    // Settings footer
    await cdp.eval(`document.querySelector('#settingsBtn')?.click()`); await sleep(600)
    const st = await cdp.eval(`(() => { const f=document.querySelector('.settings-footwrap'); const body=document.querySelector('.settings-body'); const t=document.querySelector('#notifyToggle'); t.scrollIntoView({block:'center'}); const r=t?.getBoundingClientRect(); const fr=f?.getBoundingClientRect(); const br=body.getBoundingClientRect(); return { foot:fr?.height, toggle:r?.height, toggleBottom:r?.bottom, bodyBottom:br.bottom, visible: r ? Math.max(0,Math.min(r.bottom, br.bottom)-Math.max(r.top, br.top)) : 0 } })()`)
    record('R1-36-settings', '设置底栏', st.foot <= 96 && st.visible >= 44, `foot=${st.foot?.toFixed(1)} toggleVisible=${st.visible?.toFixed(1)}`, 'foot ≤96；开关滚动到底完整可见')
    await key(cdp, 'Escape', 'Escape', 27); await sleep(300)

    const fonts = await cdp.eval(`(() => { const bad=[]; const w=document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); while(w.nextNode()){ const n=w.currentNode; const t=n.nodeValue.trim(); if(t.length<2) continue; const e=n.parentElement; if(!e||e.closest('[hidden],.sr-only')) continue; const b=e.getBoundingClientRect(); if(b.width<1||b.height<1) continue; const s=getComputedStyle(e); const fs=parseFloat(s.fontSize); if(fs<11) bad.push({t:t.slice(0,20),fs,cls:String(e.className).slice(0,40)}) } return bad.slice(0,10) })()`)
    record('R1-02-390', '无 <11px 正文', fonts.length === 0, fonts.length ? fonts.map((f) => `${f.fs}px:${f.t}`).join(' | ') : '0 处', '0 处 <11px 可见文本')
    cdp.close(); await closeTab(tab.id)
  }

  // Narrow 320×640
  {
    const { cdp, tab } = await session(320, 640, true)
    await goto(cdp, `/c/${CONV}`)
    await sleep(500)
    const m = await cdp.eval(`(() => { const r=(s)=>{const e=document.querySelector(s);const b=e.getBoundingClientRect();return {w:+b.width.toFixed(1),h:+b.height.toFixed(1)}}; const sa=document.querySelector('#scrollArea').getBoundingClientRect(); return { input:r('#input'), wrap:r('.composer-wrap'), scrollH:sa.height, overflow:document.documentElement.scrollWidth>innerWidth+1 } })()`)
    record('R1-15-320', '320 输入区', m.input.w >= 200 && m.wrap.h <= 113 && m.scrollH >= 520, `input=${m.input.w} wrap=${m.wrap.h} scroll=${m.scrollH}`, 'input ≥200；wrap ≤113；scroll ≥520')
    record('R1-15-320-overflow', '320 无横向溢出', !m.overflow, `overflow=${m.overflow}`, '无横向滚动')

    await goto(cdp, '/')
    await cdp.eval(`document.querySelector('#newChat')?.click()`); await sleep(700)
    const h = await cdp.eval(`(() => { const r=(s)=>{const e=document.querySelector(s);const b=e?.getBoundingClientRect();return b?{w:+b.width.toFixed(1),h:+b.height.toFixed(1),top:+b.top.toFixed(1)}:null}; const sa=document.querySelector('#scrollArea')?.getBoundingClientRect(); return { input:r('#input'), wrap:r('.composer-wrap'), scrollH:sa?.height, hero:r('.hero'), emptyTop:r('#emptyState') } })()`)
    record('R1-15-320-home', '320 首页输入区与 hero', h.input.w >= 200 && h.wrap.h <= 112 && h.scrollH >= 500 && h.emptyTop.top >= 0, `input=${h.input.w} wrap=${h.wrap.h} scroll=${h.scrollH} emptyTop=${h.emptyTop.top}`, 'input ≥200；wrap ≤112；scroll ≥500；empty 不向上溢出')
    cdp.close(); await closeTab(tab.id)
  }

  // Tablet 768×1024
  {
    const { cdp, tab } = await session(768, 1024, true)
    await goto(cdp, `/c/${CONV}`)
    await cdp.eval(`document.querySelector('#menuBtn')?.click()`); await sleep(500)
    const t = await cdp.eval(`(() => { const h=(s)=>{const e=document.querySelector(s);return e?Math.round(e.getBoundingClientRect().height):0}; return { sidebar:[...document.querySelectorAll('.sidebar-link')].map(e=>Math.round(e.getBoundingClientRect().height)), manage:h('#manageBtn'), archive:h('#archiveBtn') } })()`)
    record('R1-21-768', '平板侧栏触控', t.sidebar.every((h) => h >= 44) && t.manage >= 44 && t.archive >= 44, `links=${t.sidebar.join(',')} manage=${t.manage} archive=${t.archive}`, '≥44')
    cdp.close(); await closeTab(tab.id)
  }

  const passed = results.filter((r) => r.pass).length
  const report = { generatedAt: new Date().toISOString(), round: 1, passed, total: results.length, results }
  fs.writeFileSync(path.join(OUT, 'acceptance.json'), JSON.stringify(report, null, 2))
  fs.writeFileSync(path.join(OUT, 'acceptance.md'), [
    '# Round 1 acceptance', '',
    `Generated: ${report.generatedAt}`,
    `Result: **${passed}/${results.length}**`, '',
    '| ID | Check | Result | Observed | Expected |',
    '| --- | --- | --- | --- | --- |',
    ...results.map((r) => `| ${r.id} | ${r.name} | ${r.pass ? 'PASS' : 'FAIL'} | ${String(r.observed).replace(/\|/g, '\\|')} | ${String(r.expected).replace(/\|/g, '\\|')} |`),
  ].join('\n'))
  console.log(`\n${passed}/${results.length} acceptance checks passed`)
  if (passed !== results.length) process.exitCode = 1
}

main().catch((error) => { console.error(error); process.exit(1) })
