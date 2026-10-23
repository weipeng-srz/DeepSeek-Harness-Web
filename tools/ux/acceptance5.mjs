// Round 5 acceptance: final consistency and polish.
import fs from 'node:fs'
import path from 'node:path'
import { openApp, login, closeTab, APP } from '../qa/cdp.mjs'
const ROOT = process.cwd()
const OUT = path.resolve(process.env.OUT || 'reports/evolution/round-5/after')
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
      const groups=[...document.querySelectorAll('.tool-group')]
      const meta=groups[0]?.querySelector('.tool-group-meta')
      const summary=groups[0]?.querySelector('.tool-group-summary')
      const s=getComputedStyle(summary||document.body)
      const sb=document.querySelector('#scrollBottom')?.getBoundingClientRect()
      const mr=meta?.getBoundingClientRect()
      return { count:groups.length, meta:meta?.textContent||'', pad:s.paddingRight, metaRight:mr?.right, sbLeft:sb?.left, failed:[...document.querySelectorAll('.tool-group[data-failed="true"]')].length }
    })()`)
    record('R5-01', '工具组文案与按钮让位', m.count > 0 && !m.meta.includes('点开查看') && (!m.metaRight || !m.sbLeft || m.metaRight <= m.sbLeft - 4), `groups=${m.count} meta=${m.meta} metaRight=${m.metaRight} sbLeft=${m.sbLeft}`, '文案统一；组头右侧让出回底按钮')
    record('R5-02', '失败组有语义色', m.failed >= 1, `failedGroups=${m.failed}`, '至少一个失败组带 data-failed')
    cdp.close(); await closeTab(tab.id)
  }
  {
    const { cdp, tab } = await session(390, 844, true)
    await cdp.navigate(`${APP}/c/${CONV}`); await sleep(900)
    await cdp.eval(`document.querySelector('#settingsBtn')?.click()`); await sleep(600)
    const s = await cdp.eval(`(() => { const f=document.querySelector('.settings-footwrap'); const cs=f?getComputedStyle(f):null; return { overflow:cs?.overflowY, display:cs?.display, height:f?.getBoundingClientRect().height, text:document.querySelector('.settings-storage-info')?.textContent||'' } })()`)
    record('R5-03', '设置底栏不再套滚动条', s.overflow !== 'auto' && s.display === 'grid', `overflow=${s.overflow} display=${s.display} h=${s.height}`, 'footer overflow visible；grid 两列')
    record('R5-04', '文案不再写后续版本', !s.text.includes('后续版本'), `hasLegacy=${s.text.includes('后续版本')}`, '分享能力已上线文案')
    cdp.close(); await closeTab(tab.id)
  }
  {
    const { cdp, tab } = await session(390, 844, true)
    await cdp.navigate(`${APP}/s/qZZ-aGgR22XZyi9CA6bIK6mShyaVWjI_`); await sleep(900)
    const s = await cdp.eval(`(() => { const top=document.querySelector('.share-top'); const main=document.querySelector('.share-main'); const user=document.querySelector('.share-msg.user'); return { pl:parseFloat(getComputedStyle(top).paddingLeft), mainW:main?.getBoundingClientRect().width, textW:user?.querySelector('.share-text')?.getBoundingClientRect().width } })()`)
    record('R5-05', '分享页安全区与行宽', s.pl >= 14 && s.textW >= 320, `paddingLeft=${s.pl} main=${s.mainW} text=${s.textW}`, '安全区 ≥14；正文 ≥320')
    cdp.close(); await closeTab(tab.id)
  }
  const passed = results.filter((r) => r.pass).length
  const report = { generatedAt: new Date().toISOString(), round: 5, passed, total: results.length, results }
  fs.writeFileSync(path.join(OUT, 'acceptance.json'), JSON.stringify(report, null, 2))
  fs.writeFileSync(path.join(OUT, 'acceptance.md'), ['# Round 5 acceptance', '', `Result: **${passed}/${results.length}**`, '', '| ID | Check | Result | Observed | Expected |', '| --- | --- | --- | --- | --- |', ...results.map((r) => `| ${r.id} | ${r.name} | ${r.pass ? 'PASS' : 'FAIL'} | ${r.observed} | ${r.expected} |`)].join('\n'))
  console.log(`\n${passed}/${results.length} checks passed`)
  if (passed !== results.length) process.exitCode = 1
}
main().catch((e) => { console.error(e); process.exit(1) })
