// Round 4 acceptance: overlays, mobile chrome, share page.
import fs from 'node:fs'
import path from 'node:path'
import { openApp, login, closeTab, APP } from '../qa/cdp.mjs'
const ROOT = process.cwd()
const OUT = path.resolve(process.env.OUT || 'reports/evolution/round-4/after')
const CODE = process.env.ACCESS_CODE || JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8')).accessCode
const CONV = '463a289d-ce98-4998-948c-017c90246e42'
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
async function main() {
  {
    const { cdp, tab } = await session(390, 844, true)
    await cdp.navigate(`${APP}/c/${CONV}`); await sleep(1200)
    const m = await cdp.eval(`(() => {
      const tb=document.querySelector('.topbar'); const sa=document.querySelector('#scrollArea');
      const head=document.querySelector('#thread .tool-head'); const sb=document.querySelector('#scrollBottom');
      const comp=document.querySelector('.composer-wrap');
      return {
        pos:getComputedStyle(tb).position,
        pad:getComputedStyle(sa).paddingTop,
        tbBottom:tb.getBoundingClientRect().bottom,
        headTop:head?.getBoundingClientRect().top ?? null,
        sbBottom: sb?.getBoundingClientRect().bottom ?? null,
        compTop: comp?.getBoundingClientRect().top ?? null,
        hidden: sb?.hidden ?? true,
        failedOpen: [...document.querySelectorAll('.tool-group')].filter(g=>g.querySelector('.tool-group-meta')?.textContent.includes('失败')).map(g=>g.open),
      }
    })()`)
    record('R4-01', '手机顶栏不覆盖正文', m.pos === 'sticky' && m.pad === '0px' && (m.headTop === null || m.headTop >= m.tbBottom - 1), `position=${m.pos} pad=${m.pad} topbarBottom=${m.tbBottom} headTop=${m.headTop}`, 'sticky + scroll padding 0；首条内容在顶栏下方')
    record('R4-02', '失败工具组默认不展开', m.failedOpen.every((open) => open === false), `failedOpen=${m.failedOpen.join(',')}`, '失败组默认收起')
    record('R4-03', '回底按钮在 composer 上方', m.sbBottom === null || m.sbBottom <= m.compTop - 50, `sbBottom=${m.sbBottom} composerTop=${m.compTop}`, '按钮底边 ≤ composerTop-50')
    cdp.close(); await closeTab(tab.id)
  }
  {
    const { cdp, tab } = await session(390, 844, true)
    await cdp.navigate(`${APP}/s/qZZ-aGgR22XZyi9CA6bIK6mShyaVWjI_`); await sleep(900)
    const s = await cdp.eval(`(() => { const b=document.querySelector('#shareCopy')?.getBoundingClientRect(); const u=document.querySelector('.share-msg.user'); return { w:b?.width, h:b?.height, border:u?getComputedStyle(u).borderLeftWidth:null, main:document.querySelector('.share-main')?.getBoundingClientRect().width } })()`)
    record('R4-04', '分享页操作与角色区分', s.h >= 44 && s.border === '2px' && s.main <= 760, `button=${s.w}×${s.h} userBorder=${s.border} main=${s.main}`, '按钮 ≥44；用户消息 2px 左边；正文 ≤760')
    cdp.close(); await closeTab(tab.id)
  }
  {
    const { cdp, tab } = await session(320, 640, true)
    await cdp.navigate(`${APP}/c/${CONV}`); await sleep(900)
    await cdp.eval(`document.querySelector('#settingsBtn')?.click()`); await sleep(600)
    const st = await cdp.eval(`(() => { const f=document.querySelector('.settings-footwrap')?.getBoundingClientRect(); const p=document.querySelector('#settingsSheet .settings-panel')?.getBoundingClientRect(); return { foot:f?.height, panelH:p?.height, inside:p ? document.querySelector('#settingsSheet .settings-panel').contains(document.activeElement) : false } })()`)
    record('R4-05', '320 设置浮层', st.foot <= 96 && st.panelH <= 640 && st.inside, `foot=${st.foot?.toFixed(1)} panel=${st.panelH?.toFixed(1)} focusInside=${st.inside}`, 'footer ≤96；面板 ≤640；焦点在面板')
    cdp.close(); await closeTab(tab.id)
  }
  const passed = results.filter((r) => r.pass).length
  const report = { generatedAt: new Date().toISOString(), round: 4, passed, total: results.length, results }
  fs.writeFileSync(path.join(OUT, 'acceptance.json'), JSON.stringify(report, null, 2))
  fs.writeFileSync(path.join(OUT, 'acceptance.md'), ['# Round 4 acceptance', '', `Result: **${passed}/${results.length}**`, '', '| ID | Check | Result | Observed | Expected |', '| --- | --- | --- | --- | --- |', ...results.map((r) => `| ${r.id} | ${r.name} | ${r.pass ? 'PASS' : 'FAIL'} | ${r.observed} | ${r.expected} |`)].join('\n'))
  console.log(`\n${passed}/${results.length} checks passed`)
  if (passed !== results.length) process.exitCode = 1
}
main().catch((e) => { console.error(e); process.exit(1) })
