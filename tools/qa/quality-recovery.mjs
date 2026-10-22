import fs from 'node:fs'
import path from 'node:path'
import { ROOT, createSandbox, launchBrowser, loginPage, sleep } from './quality-harness.mjs'
const label = process.env.QA_LABEL || 'round2'
const out = path.join(ROOT, 'reports/quality', label)
fs.mkdirSync(out, { recursive: true })
const sandbox = await createSandbox({ port: Number(process.env.QA_PORT || 8799), label: `${label}-recovery` })
const browser = await launchBrowser()
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
const page = await context.newPage()
page.setDefaultTimeout(12000)
const results = []
const record = (name, ok, evidence) => { results.push({ name, status: ok ? 'passed' : 'failed', evidence }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${JSON.stringify(evidence)}`) }
try {
  const imported = await sandbox.api('/api/backup/import', { method: 'POST', body: JSON.stringify({ conversations: [{ title: 'QA Formula A', messages: [{ role: 'assistant', text: 'First formula:\n\n$$x^2+y^2=z^2$$' }] }, { title: 'QA Formula B', messages: [{ role: 'assistant', text: 'Second formula:\n\n$$E=mc^2$$' }] }, { title: 'QA Beta unique', messages: [] }, ...Array.from({ length: 70 }, (_, i) => ({ title: `QA Alpha ${i}`, messages: [] }))] }) })
  if (imported.status >= 400) throw new Error(`Fixture import: ${imported.status}`)
  const list = (await sandbox.api('/api/conversations?limit=100')).body.conversations
  const first = list.find(x => x.title.endsWith('Formula A')); const second = list.find(x => x.title.endsWith('Formula B'))
  await loginPage(page, sandbox)
  let scriptAttempts = 0
  await page.route('**/vendor/katex/katex.min.js', async route => { scriptAttempts += 1; if (scriptAttempts === 1) await route.abort('failed'); else await route.continue() })
  await page.locator('#convSearch').fill('Formula'); await page.waitForTimeout(450)
  await page.locator(`[data-id="${first.id}"] .conv-main`).click(); await page.waitForTimeout(500)
  const initiallyFailed = scriptAttempts === 1 && await page.locator('#thread .katex').count() === 0
  await page.locator(`[data-id="${second.id}"] .conv-main`).click(); await page.waitForTimeout(700)
  const rendered = await page.locator('#thread .katex').count()
  record('math asset failure can retry on next formula without reload', initiallyFailed && scriptAttempts >= 2 && rendered > 0, { initiallyFailed, scriptAttempts, rendered, assets: 'local /vendor/katex, first request deliberately aborted' })
  await page.screenshot({ path: path.join(out, 'math-recovery.png'), fullPage: true }); await page.unrouteAll()
  await page.locator('#convSearch').fill('Alpha'); await page.waitForTimeout(500)
  const before = await page.locator('#convList .conv-item').count()
  await page.route('**/api/conversations?**', async route => {
    const url = new URL(route.request().url())
    if (url.searchParams.get('q') === 'Alpha' && url.searchParams.get('offset') === '60') { const response = await route.fetch(); await sleep(1000); await route.fulfill({ response }) }
    else await route.continue()
  })
  await page.locator('#convLoadMore').click(); await page.waitForTimeout(100)
  await page.locator('#convSearch').fill('Beta'); await page.waitForTimeout(1400)
  const titles = await page.locator('#convList .conv-title').allTextContents()
  const summary = await page.locator('#convResultCount').innerText()
  record('old load-more response cannot contaminate a new search', before === 60 && titles.length === 1 && titles[0].includes('Beta') && !summary.includes('70'), { before, currentQuery: await page.locator('#convSearch').inputValue(), titles, summary })
  await page.screenshot({ path: path.join(out, 'search-pagination-race.png'), fullPage: true })
} catch (error) { results.push({ name: 'recovery harness execution', status: 'blocked', evidence: { error: error.stack } }); console.error(error.stack) }
finally {
  fs.writeFileSync(path.join(out, 'recovery.json'), JSON.stringify({ label, generatedAt: new Date().toISOString(), sourceSnapshot: sandbox.dir, results, totals: { passed: results.filter(x => x.status === 'passed').length, failed: results.filter(x => x.status === 'failed').length, blocked: results.filter(x => x.status === 'blocked').length } }, null, 2))
  await browser.close(); await sandbox.stop()
}
