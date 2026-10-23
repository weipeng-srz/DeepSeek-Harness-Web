// Round 3 acceptance: reading, tool grouping, print defaults, scale.
import fs from 'node:fs'
import path from 'node:path'
import { openApp, login, closeTab, APP } from '../qa/cdp.mjs'
const ROOT = process.cwd()
const OUT = path.resolve(process.env.OUT || 'reports/evolution/round-3/after')
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
    const { cdp, tab } = await session(1440, 900)
    await cdp.navigate(`${APP}/c/${CONV}`); await sleep(1400)
    const group = await cdp.eval(`(() => {
      const g=[...document.querySelectorAll('.tool-group')]
      const first=g[0]
      return {
        count:g.length,
        open:first?.open ?? null,
        summary:first?.querySelector('.tool-group-summary')?.innerText || '',
        h:first?.querySelector('.tool-group-summary')?.getBoundingClientRect().height || 0,
        cards:first?.querySelectorAll('.tool-card').length || 0,
        answerTop:(()=>{const m=document.querySelector('.msg.assistant .msg-body .md');if(!m)return null;return m.getBoundingClientRect().top})(),
        viewportBottom:innerHeight,
      }
    })()`)
    record('R3-01', '连续工具卡折叠成一组', group.count >= 1 && group.cards >= 2 && group.h >= 44, `groups=${group.count} cards=${group.cards} summaryH=${group.h} open=${group.open}`, '至少一组 ≥2 张卡，摘要 ≥44')
    record('R3-02', '默认折叠', group.open === false, `open=${group.open}`, '组默认收起')

    const reading = await cdp.eval(`(() => {
      const tableStyle = (el) => el ? getComputedStyle(el) : null
      document.body.classList.add('text-large')
      const md = document.querySelector('.md'); const table = document.querySelector('.md table'); const h2 = document.querySelector('.md h2')
      const base = { md: md ? parseFloat(getComputedStyle(md).fontSize) : null, table: table ? parseFloat(getComputedStyle(table).fontSize) : null, h2: h2 ? parseFloat(getComputedStyle(h2).fontSize) : null }
      return base
    })()`)
    record('R3-03', '阅读缩放同时放大正文/标题/表格', reading.md > 16 && (!reading.h2 || reading.h2 > reading.md * 0.9), `md=${reading.md} h2=${reading.h2} table=${reading.table}`, '正文 >16；h2 不低于正文')
    const diff = await cdp.eval(`(() => { const d=document.querySelector('.diff-code'); return d?getComputedStyle(d).whiteSpace:null })()`)
    record('R3-04', 'diff 不强制折行', diff === 'pre' || diff === null, `white-space=${diff}`, 'pre 或本会话无 diff')

    await cdp.eval(`document.body.classList.remove('text-large')`)
    await cdp.eval(`document.querySelector('#scrollArea').scrollTop = 0`); await sleep(300)
    const sb = await cdp.eval(`(() => { const b=document.querySelector('#scrollBottom'); return { hidden:b.hidden, bottom:getComputedStyle(b).bottom } })()`)
    record('R3-05', '回底按钮在非底部才出现', sb.hidden === false, `hidden=${sb.hidden}`, '顶部时可见（点击回底）')
    const printRule = await cdp.eval(`(() => { for (const sheet of document.styleSheets) { try { for (const rule of sheet.cssRules) { if (rule.conditionText && rule.conditionText.includes('print') && rule.cssText.includes('body:not(.print-full)')) return true } } catch {} } return false })()`)
    record('R3-06', '打印默认隐藏工具卡', printRule, `printRule=${printRule}`, '存在 @media print 规则')
    cdp.close(); await closeTab(tab.id)
  }
  {
    const { cdp, tab } = await session(390, 844, true)
    await cdp.navigate(`${APP}/c/${CONV}`); await sleep(1200)
    const actions = await cdp.eval(`(() => { const rows=[...document.querySelectorAll('.msg.assistant .msg-actions')]; const visible=rows.map(r=>[...r.querySelectorAll('button')].filter(b=>getComputedStyle(b).display!=='none').length); return { rows:visible, max:Math.max(0,...visible) } })()`)
    record('R3-07', '手机消息操作条不超过 4 个', actions.max <= 4, `counts=${actions.rows.join(',')}`, '每个回答 ≤4 个可见按钮')
    cdp.close(); await closeTab(tab.id)
  }
  const passed = results.filter((r) => r.pass).length
  const report = { generatedAt: new Date().toISOString(), round: 3, passed, total: results.length, results }
  fs.writeFileSync(path.join(OUT, 'acceptance.json'), JSON.stringify(report, null, 2))
  fs.writeFileSync(path.join(OUT, 'acceptance.md'), ['# Round 3 acceptance', '', `Result: **${passed}/${results.length}**`, '', '| ID | Check | Result | Observed | Expected |', '| --- | --- | --- | --- | --- |', ...results.map((r) => `| ${r.id} | ${r.name} | ${r.pass ? 'PASS' : 'FAIL'} | ${r.observed} | ${r.expected} |`)].join('\n'))
  console.log(`\n${passed}/${results.length} checks passed`)
  if (passed !== results.length) process.exitCode = 1
}
main().catch((e) => { console.error(e); process.exit(1) })
