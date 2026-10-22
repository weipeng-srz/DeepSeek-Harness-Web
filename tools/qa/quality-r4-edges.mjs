import fs from 'node:fs'
import path from 'node:path'
import { ROOT, createSandbox, launchBrowser, loginPage, sleep } from './quality-harness.mjs'

const out = path.join(ROOT, 'reports/quality/r4-frontend-after')
fs.mkdirSync(out, { recursive: true })
const sandbox = await createSandbox({ port: 8796, label: 'r4-edges' })
const browser = await launchBrowser()
const results = []
const record = (name, ok, evidence = {}) => results.push({ name, status: ok ? 'passed' : 'failed', evidence })
try {
  await sandbox.api('/api/backup/import', { method: 'POST', body: JSON.stringify({ conversations: [
    { title: 'QA Formula First', messages: [{ role: 'assistant', text: '$$x^2+y^2=z^2$$' }] },
    { title: 'QA Formula Second', messages: [{ role: 'assistant', text: '$$E=mc^2$$' }] },
    { title: 'QA Formula Concurrent', messages: [{ role: 'assistant', text: '$$a^2+b^2=c^2$$' }, { role: 'assistant', text: '$$f(x)=x^2$$' }] },
    ...['Alpha', 'Beta'].flatMap(group => Array.from({ length: 70 }, (_, i) => ({ title: `${group} Record ${i}`, messages: [] }))),
  ] }) })
  const formulas = (await sandbox.api('/api/conversations?q=Formula&limit=60')).body.conversations
  const first = formulas.find(x => x.title.endsWith('First')), second = formulas.find(x => x.title.endsWith('Second')), concurrent = formulas.find(x => x.title.endsWith('Concurrent'))
  for (const failedResource of ['katex.min.css', 'auto-render.min.js', null]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
    const page = await context.newPage()
    const attempts = { 'katex.min.css': 0, 'katex.min.js': 0, 'auto-render.min.js': 0 }
    await page.route('**/vendor/katex/**', async route => {
      const name = new URL(route.request().url()).pathname.split('/').pop()
      if (!(name in attempts)) return route.continue()
      attempts[name] += 1
      if (name === failedResource && attempts[name] === 1) return route.abort('failed')
      if (failedResource === null) await sleep(100)
      return route.continue()
    })
    await loginPage(page, sandbox)
    await page.locator('#convSearch').fill('Formula')
    await page.waitForTimeout(400)
    await page.locator(`[data-id="${failedResource ? first.id : concurrent.id}"] .conv-main`).click()
    await page.waitForTimeout(450)
    if (failedResource) {
      record(`${failedResource}: failure keeps readable formula source`, await page.locator('#thread .katex').count() === 0 && (await page.locator('#thread').innerText()).includes('x^2'))
      await page.locator(`[data-id="${second.id}"] .conv-main`).click()
      await page.waitForTimeout(500)
      const links = await page.locator('link[href="/vendor/katex/katex.min.css"]').count()
      const rendered = await page.locator('#thread .katex').count()
      record(`${failedResource}: retries only missing resource without duplicate CSS`, links === 1 && rendered > 0 && attempts[failedResource] === 2 && attempts['katex.min.js'] === 1, { attempts, links, rendered })
    } else {
      const rendered = await page.locator('#thread .katex').count()
      record('concurrent formulas share one resource load', Object.values(attempts).every(count => count === 1) && rendered === 2, { attempts, rendered })
    }
    await context.close()
  }

  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
  const page = await context.newPage()
  await loginPage(page, sandbox)
  await page.locator('#convSearch').fill('Alpha')
  await page.waitForTimeout(450)
  // Deliberately ignore abort for pagination to exercise the version guard even
  // when cancellation cannot stop the underlying transport.
  await page.evaluate(() => {
    const fetchOriginal = window.fetch
    window.fetch = (input, options) => {
      if (String(input).includes('offset=60')) {
        const { signal, ...withoutSignal } = options || {}
        return fetchOriginal(input, withoutSignal)
      }
      return fetchOriginal(input, options)
    }
  })
  let pageRequests = 0
  await page.route('**/api/conversations?*', async route => {
    const url = new URL(route.request().url())
    if (url.searchParams.get('q') !== 'Alpha' || url.searchParams.get('offset') !== '60') return route.continue()
    pageRequests += 1
    const index = pageRequests
    const response = await route.fetch()
    await sleep(index === 1 ? 1200 : 1600)
    await route.fulfill({ response }).catch(() => {})
  })
  await page.locator('#convLoadMore').click()
  await page.waitForTimeout(80)
  await page.locator('#convSearch').fill('Beta')
  await page.waitForTimeout(350)
  await page.locator('#convSearch').fill('Alpha')
  await page.waitForTimeout(350)
  record('A-B-A starts a fresh first page', await page.locator('#convList .conv-item').count() === 60 && !await page.locator('#convLoadMore').isDisabled())
  await page.locator('#convLoadMore').click()
  await page.waitForTimeout(650)
  record('old same-query response and finally cannot alter newer busy page', await page.locator('#convList .conv-item').count() === 60 && await page.locator('#convLoadMore').isDisabled(), { count: await page.locator('#convList .conv-item').count(), busy: await page.locator('#convLoadMore').isDisabled(), pageRequests })
  await page.waitForTimeout(1150)
  const ids = await page.locator('#convList .conv-item').evaluateAll(nodes => nodes.map(node => node.dataset.id))
  record('current pagination appends once and deduplicates', ids.length === 70 && new Set(ids).size === 70 && !await page.locator('#convLoadMore').isDisabled(), { count: ids.length, unique: new Set(ids).size })
  await page.screenshot({ path: path.join(out, 'pagination-aba.png'), fullPage: true })
  await context.close()
} finally {
  fs.writeFileSync(path.join(out, 'edges.json'), JSON.stringify({ fixture: 'Synthetic conversations and local KaTeX assets. Explicit resource abort/delay and pagination abort suppression are test-only fault injection.', results, totals: { passed: results.filter(x => x.status === 'passed').length, failed: results.filter(x => x.status === 'failed').length } }, null, 2))
  await browser.close()
  await sandbox.stop()
}
console.log(JSON.stringify(results, null, 2))
