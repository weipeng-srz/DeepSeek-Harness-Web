import fs from 'node:fs'
import path from 'node:path'
import { ROOT, createSandbox, launchBrowser, loginPage, sleep } from './quality-harness.mjs'
const label = process.env.QA_LABEL || 'round2'
const out = path.join(ROOT, 'reports/quality', label)
fs.mkdirSync(out, { recursive: true })
const sandbox = await createSandbox({ port: Number(process.env.QA_PORT || 8799), label: `${label}-tabs` })
const browser = await launchBrowser()
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
const results = []
try {
  const ids = []
  for (const title of ['QA Tab A', 'QA Tab B']) {
    const created = await sandbox.api('/api/conversations', { method: 'POST', body: JSON.stringify({ engine: 'codex', codexEffort: 'medium' }) }); const id=created.body.conversation.id; ids.push(id)
    await sandbox.api(`/api/conversations/${id}`, { method: 'PATCH', body: JSON.stringify({ title }) })
  }
  const pageA = await context.newPage(); await loginPage(pageA, sandbox)
  await pageA.locator(`[data-id="${ids[0]}"] .conv-main`).click(); await pageA.waitForTimeout(500)
  const pageB = await context.newPage(); await pageB.goto(`${sandbox.base}/c/${ids[1]}`); await pageB.locator('#shell').waitFor({ state: 'visible' }); await pageB.waitForTimeout(500)
  await sleep(4400)
  const requests = []
  pageA.on('request', request => { if (request.method() === 'PATCH') requests.push(new URL(request.url()).pathname) })
  const trigger = await pageA.locator('#codexFootBtn').isVisible() ? '#codexFootBtn' : '#codexSettingsBtn'
  await pageA.locator(trigger).click(); await pageA.locator('.codex-pop').waitFor(); await pageA.waitForTimeout(250)
  const choices = pageA.locator('.codex-effort-choice')
  const choiceLabel = await choices.first().innerText()
  await choices.first().click(); await pageA.waitForTimeout(600)
  const a = (await sandbox.api(`/api/conversations/${ids[0]}`)).body.conversation
  const b = (await sandbox.api(`/api/conversations/${ids[1]}`)).body.conversation
  const ok = requests.includes(`/api/conversations/${ids[0]}`) && !requests.includes(`/api/conversations/${ids[1]}`) && a.codexEffort !== 'medium' && b.codexEffort === 'medium'
  const evidence = { displayedA: new URL(pageA.url()).pathname, displayedB: new URL(pageB.url()).pathname, requestsFromTabA: requests, choiceLabel, actualA: a.codexEffort, actualB: b.codexEffort, modelCalls: 0 }
  results.push({ name: 'Codex selection mutates the displayed tab conversation only', status: ok ? 'passed' : 'failed', evidence }); console.log(`${ok ? 'PASS' : 'FAIL'} Codex tab isolation ${JSON.stringify(evidence)}`)
  await pageA.screenshot({ path: path.join(out, 'codex-tabs-a.png'), fullPage: true })
} catch (error) { results.push({ name: 'Codex tab harness execution', status: 'blocked', evidence: { error: error.stack } }); console.error(error.stack) }
finally {
  fs.writeFileSync(path.join(out, 'codex-tabs.json'), JSON.stringify({ label, generatedAt: new Date().toISOString(), sourceSnapshot: sandbox.dir, results, totals: { passed: results.filter(x => x.status === 'passed').length, failed: results.filter(x => x.status === 'failed').length, blocked: results.filter(x => x.status === 'blocked').length } }, null, 2))
  await browser.close(); await sandbox.stop()
}
