import fs from 'node:fs'
import path from 'node:path'
import { ROOT, createSandbox, launchBrowser, loginPage } from './quality-harness.mjs'
const label = process.env.QA_LABEL || 'round3'
const out = path.join(ROOT, 'reports/quality', label)
fs.mkdirSync(out, { recursive: true })
// Seeding the isolated store before startup models an accumulated conversation;
// the import endpoint intentionally caps a single imported history at 400.
const sandbox = await createSandbox({ port: Number(process.env.QA_PORT || 8800), label: `${label}-find-flow`, seedConversations: [{ title: 'QA 1000-message history', messages: Array.from({ length: 1000 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', text: index === 0 ? 'QA_OLDEST_1000_NEEDLE' : index === 999 ? 'QA latest history answer' : `Quality stored message ${index}` })) }] })
const browser = await launchBrowser()
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
const page = await context.newPage()
const results = []
const record = (name, ok, evidence) => { results.push({ name, status: ok ? 'passed' : 'failed', evidence }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${JSON.stringify(evidence)}`) }
try {
  const id = (await sandbox.api('/api/conversations')).body.conversations[0].id
  await loginPage(page, sandbox); await page.locator(`[data-id="${id}"] .conv-main`).click(); await page.locator('#thread .msg').first().waitFor()
  const initial = { messages: await page.locator('#thread .msg').count(), nodes: await page.locator('#thread *').count() }
  await page.keyboard.press('Meta+f')
  const start = await page.evaluate(() => performance.now())
  await page.locator('#findInput').fill('QA_OLDEST_1000_NEEDLE'); await page.locator('mark.find-hit.active').waitFor()
  const durationMs = Math.round(await page.evaluate(() => performance.now()) - start)
  const located = { messages: await page.locator('#thread .msg').count(), nodes: await page.locator('#thread *').count(), count: await page.locator('#findCount').innerText() }
  record('1000-message history finds oldest in a bounded DOM', initial.messages <= 60 && located.messages <= 60 && located.count === '1/1', { fixtureMessages: 1000, initial, located, durationMs, measurement: 'one local Chrome sample including input debounce; not a mobile or production benchmark' })
  await page.keyboard.press('Escape')
  record('closing historical find restores latest answer', (await page.locator('#thread').innerText()).includes('QA latest history answer') && await page.locator('#thread .msg').count() <= 60, { messages: await page.locator('#thread .msg').count() })
  // This explicitly injected transport stream tests rendering lifecycle only;
  // it is not a real model output and is not credited as engine validation.
  await page.route('**/api/conversations/*/chat', route => route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: [{ t: 'ready', messageId: 'qa-stream-assistant', userMessageId: 'qa-stream-user' }, { t: 'text', text: 'QA synthetic render after find' }, { t: 'done', status: 'done', durationMs: 1 }].map(value => JSON.stringify(value)).join('\n') + '\n' }))
  await page.locator('#input').fill('QA lifecycle rendering test'); await page.locator('#sendBtn').click(); await page.waitForTimeout(400)
  record('new streamed view renders after closing old-history find', (await page.locator('#thread').innerText()).includes('QA synthetic render after find') && !await page.locator('#sendBtn').evaluate(el => el.classList.contains('stop')), { syntheticTransport: true, realModelCalled: false, responseVisible: (await page.locator('#thread').innerText()).includes('QA synthetic render after find') })
  await page.screenshot({ path: path.join(out, 'find-1000-stream-followup.png'), fullPage: true })
} catch (error) { results.push({ name: 'find flow harness execution', status: 'blocked', evidence: { error: error.stack } }); console.error(error.stack) }
finally {
  fs.writeFileSync(path.join(out, 'find-flow.json'), JSON.stringify({ label, generatedAt: new Date().toISOString(), sourceSnapshot: sandbox.dir, results }, null, 2))
  await browser.close(); await sandbox.stop()
}
