import fs from 'node:fs'
import path from 'node:path'
import { ROOT, createSandbox, launchBrowser, loginPage, sleep } from './quality-harness.mjs'
const label = process.env.QA_LABEL || 'round1'
const out = path.join(ROOT, 'reports/quality', label)
fs.mkdirSync(out, { recursive: true })
const sandbox = await createSandbox({ port: Number(process.env.QA_PORT || 8798), label: `${label}-batch` })
const browser = await launchBrowser()
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
const page = await context.newPage()
page.setDefaultTimeout(6000)
const results = []
const record = (name, ok, evidence = {}) => { results.push({ name, status: ok ? 'passed' : 'failed', evidence }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${JSON.stringify(evidence)}`) }
async function fixtures(prefix) {
  const ids = []
  for (const suffix of ['A', 'B']) {
    const created = await sandbox.api('/api/conversations', { method: 'POST', body: JSON.stringify({ engine: 'dsr' }) })
    const id = created.body.conversation.id; ids.push(id)
    await sandbox.api(`/api/conversations/${id}`, { method: 'PATCH', body: JSON.stringify({ title: `QA ${prefix} ${suffix}` }) })
  }
  await page.reload(); await page.locator('#shell').waitFor({ state: 'visible' }); await page.locator('#manageBtn').click()
  for (const id of ids) await page.locator(`[data-id="${id}"] .conv-main`).click()
  return ids
}
async function waitBatch() { await page.waitForFunction(() => !document.querySelector('#batchBar').hasAttribute('aria-busy')); await page.waitForTimeout(150) }
try {
  await loginPage(page, sandbox)
  const partial = await fixtures('partial')
  const partialURL = `**/api/conversations/${partial[0]}`
  await page.route(partialURL, route => route.request().method() === 'PATCH' ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"QA temporary failure"}' }) : route.continue())
  await page.locator('#batchArchive').click(); await waitBatch()
  const message = await page.locator('#toast').innerText()
  const selected = await page.locator('.conv-item.selected').count()
  const remaining = await sandbox.api('/api/conversations')
  record('batch archive partial failure reports exact counts', message.includes('已归档 1') && message.includes('1 段失败') && selected === 1 && remaining.body.conversations.some(x => x.id === partial[0]) && !remaining.body.conversations.some(x => x.id === partial[1]), { message, selected })
  await page.route(`**/api/conversations/${partial[1]}`, route => route.request().method() === 'PATCH' ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"QA restore failure"}' }) : route.continue())
  await page.locator('#toast button').click(); await waitBatch()
  const undoMessage = await page.locator('#toast').innerText()
  record('batch undo failure does not claim restored', undoMessage.includes('恢复失败') && !undoMessage.includes('已恢复'), { message: undoMessage })
  await page.unrouteAll()
  const all = await fixtures('allfail')
  await page.route('**/api/conversations/*', route => all.includes(route.request().url().split('/').pop()) && route.request().method() === 'PATCH' ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"QA temporary failure"}' }) : route.continue())
  await page.locator('#batchArchive').click(); await waitBatch()
  const allMessage = await page.locator('#toast').innerText()
  record('batch all failures preserve selection and allow retry', allMessage.includes('归档失败') && allMessage.includes('2 段对话未更改') && await page.locator('.conv-item.selected').count() === 2 && await page.locator('#batchArchive').isEnabled(), { message: allMessage, selection: await page.locator('.conv-item.selected').count() })
  await page.unrouteAll()
  const repeated = await fixtures('repeat')
  const calls = []
  await page.route('**/api/conversations/*', async route => {
    if (repeated.includes(route.request().url().split('/').pop()) && route.request().method() === 'PATCH') { calls.push(route.request().url()); await sleep(400) }
    await route.continue()
  })
  const rect = await page.locator('#batchArchive').boundingBox()
  await page.locator('#batchArchive').click(); await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2)
  await page.waitForTimeout(1100); await waitBatch()
  record('batch double click sends each mutation once', calls.length === 2 && new Set(calls).size === 2, { mutations: calls.length, unique: new Set(calls).size })
  await page.unrouteAll()
  const deleted = await fixtures('deletefail')
  await page.route('**/api/conversations/*', route => deleted.includes(route.request().url().split('/').pop()) && route.request().method() === 'DELETE' ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"QA delete failure"}' }) : route.continue())
  await page.locator('#batchDelete').click(); await page.locator('#confirmOk').click(); await waitBatch()
  const deleteMessage = await page.locator('#toast').innerText()
  record('batch deletion all failures remain recoverable', deleteMessage.includes('删除失败') && await page.locator('.conv-item.selected').count() === 2 && await page.locator('#batchDelete').isEnabled(), { message: deleteMessage, selection: await page.locator('.conv-item.selected').count() })
  await page.screenshot({ path: path.join(out, 'batch-failure-recoverable.png'), fullPage: true })
  record('batch failure leaves page interactive', !await page.locator('#shell').evaluate(el => el.inert) && !await page.locator('#convList').evaluate(el => el.inert))
} catch (error) { results.push({ name: 'batch harness execution', status: 'blocked', evidence: { error: error.stack } }); console.error(error.stack) }
finally {
  fs.writeFileSync(path.join(out, 'batch.json'), JSON.stringify({ label, generatedAt: new Date().toISOString(), sourceSnapshot: sandbox.dir, results, totals: { passed: results.filter(x => x.status === 'passed').length, failed: results.filter(x => x.status === 'failed').length, blocked: results.filter(x => x.status === 'blocked').length } }, null, 2))
  await browser.close(); await sandbox.stop()
}
