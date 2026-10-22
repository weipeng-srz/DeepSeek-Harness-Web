import fs from 'node:fs'
import path from 'node:path'
import { ROOT, createSandbox, launchBrowser, loginPage, sleep } from './quality-harness.mjs'

const label = process.env.QA_LABEL || 'r3-quick-after'
const out = path.join(ROOT, 'reports/quality', label)
fs.mkdirSync(out, { recursive: true })
const sandbox = await createSandbox({ port: 8796, label })
const browser = await launchBrowser()
const results = []
const record = (name, ok, evidence = {}) => results.push({ name, status: ok ? 'passed' : 'failed', evidence })
try {
  const now = Date.now()
  await sandbox.api('/api/backup/import', { method: 'POST', body: JSON.stringify({ conversations: Array.from({ length: 75 }, (_, i) => ({ title: i === 74 ? 'QA Oldest Unique Target' : `QA Record ${i}`, createdAt: now - i * 1000, updatedAt: now - i * 1000, messages: [{ role: 'user', text: i === 0 ? 'EARLY_BODY_NEEDLE only exists in early content' : `Question ${i}` }, { role: 'assistant', text: 'Ordinary final response without the earlier keyword' }] })) }) })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
  const page = await context.newPage()
  const errors = []
  const queries = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => {
    const url = new URL(request.url())
    if (url.pathname === '/api/conversations' && url.searchParams.has('q')) queries.push(url.searchParams.get('q'))
  })
  await loginPage(page, sandbox)
  await page.keyboard.press('Meta+p')
  await page.locator('#quickInput').fill('EARLY_BODY_NEEDLE')
  await page.waitForTimeout(500)
  const earlyText = await page.locator('#quickList').innerText()
  record('finds early message outside last preview', await page.locator('#quickList .quick-item').count() === 1, { list: earlyText })
  await page.screenshot({ path: path.join(out, 'body-search.png'), fullPage: true })
  await page.locator('#quickInput').fill('Oldest Unique Target')
  await page.waitForTimeout(500)
  record('finds 75th conversation outside loaded page', await page.locator('#quickList .quick-item').count() === 1, { list: await page.locator('#quickList').innerText() })
  if (process.env.QA_BASELINE !== '1') {
    const semantics = await page.locator('#quickInput').evaluate(el => ({ role: el.getAttribute('role'), expanded: el.getAttribute('aria-expanded'), controls: el.getAttribute('aria-controls'), active: el.getAttribute('aria-activedescendant'), target: Boolean(document.getElementById(el.getAttribute('aria-activedescendant'))) }))
    record('combobox references stable selected result', semantics.role === 'combobox' && semantics.expanded === 'true' && semantics.controls === 'quickList' && semantics.target, semantics)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(300)
    record('keyboard opens historical result', (await page.locator('#topbarName').innerText()).includes('Oldest Unique Target') && !await page.locator('#quickSwitcher').isVisible())
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await page.waitForTimeout(400)
    record('focusing page retains historical conversation', (await page.locator('#topbarName').innerText()).includes('Oldest Unique Target'))

    await page.keyboard.press('Meta+p')
    await page.route('**/api/conversations?*', async route => {
      if (new URL(route.request().url()).searchParams.get('q') !== 'Record') return route.continue()
      const response = await route.fetch()
      await sleep(650)
      await route.fulfill({ response }).catch(() => {})
    })
    await page.locator('#quickInput').fill('Record')
    await page.waitForTimeout(300)
    record('loading state distinguishes pending search', (await page.locator('#quickStatus').innerText()).includes('搜索') && await page.locator('#quickList').getAttribute('aria-busy') === 'true')
    await page.locator('#quickInput').fill('Oldest Unique Target')
    await page.waitForTimeout(900)
    record('latest query wins delayed response', await page.locator('#quickList .quick-item').count() === 1 && (await page.locator('#quickList').innerText()).includes('Oldest Unique Target'))
    await page.locator('#quickInput').fill('Record')
    await page.waitForTimeout(300)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(800)
    record('closing invalidates pending search', !await page.locator('#quickSwitcher').isVisible() && await page.locator('#quickInput').getAttribute('aria-expanded') === 'false' && !(await page.locator('#shell').evaluate(el => el.inert)))
    await page.unroute('**/api/conversations?*')

    let failSearch = true
    await page.route('**/api/conversations?*', route => {
      if (new URL(route.request().url()).searchParams.get('q') === 'EARLY_BODY_NEEDLE' && failSearch) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Injected search outage' }) })
      return route.continue()
    })
    await page.keyboard.press('Meta+p')
    await page.locator('#quickInput').fill('EARLY_BODY_NEEDLE')
    await page.waitForTimeout(500)
    record('error is explicit and offers retry', await page.locator('#quickStatus button').isVisible() && !(await page.locator('#quickStatus').innerText()).includes('没有匹配'))
    await page.screenshot({ path: path.join(out, 'error-retry.png'), fullPage: true })
    failSearch = false
    await page.locator('#quickStatus button').click()
    await page.waitForTimeout(400)
    const retryText = await page.locator('#quickList').innerText()
    record('retry recovers actual server search', await page.locator('#quickList .quick-item').count() === 1 && retryText.includes('QA Record 0') && retryText.includes('only exists in early content'), { list: retryText })
    await page.locator('#quickInput').fill('NOT_PRESENT_ANYWHERE')
    await page.waitForTimeout(450)
    record('empty result clears active descendant', (await page.locator('#quickStatus').innerText()).includes('没有匹配') && !await page.locator('#quickInput').getAttribute('aria-activedescendant'))
    await page.locator('#quickInput').fill('Record')
    await page.waitForTimeout(450)
    await page.keyboard.press('ArrowDown')
    const active = await page.locator('#quickInput').getAttribute('aria-activedescendant')
    record('arrow selection and twelve-result limit', await page.locator('#quickList .quick-item').count() === 12 && await page.locator(`#${active}`).getAttribute('aria-selected') === 'true')
    queries.length = 0
    for (const query of ['R', 'Re', 'Rec', 'Record']) {
      await page.locator('#quickInput').fill(query)
      await page.waitForTimeout(40)
    }
    await page.waitForTimeout(400)
    record('rapid typing produces one debounced query', queries.length === 1 && queries[0] === 'Record', { queries })
    record('no uncaught page exception', errors.length === 0, { errors })
  }
  await context.close()
} finally {
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ fixture: '75 synthetic conversations; real HTTP searches. Delay and 503 are explicit injected transport faults.', results, totals: { passed: results.filter(x => x.status === 'passed').length, failed: results.filter(x => x.status === 'failed').length } }, null, 2))
  await browser.close()
  await sandbox.stop()
}
console.log(JSON.stringify(results, null, 2))
