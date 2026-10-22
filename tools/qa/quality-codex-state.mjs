// Real Chromium + isolated real HTTP handlers. Synthetic model catalog, no agent runs.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import net from 'node:net'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createHash } from 'node:crypto'
import { ROOT, launchBrowser, sleep } from './quality-harness.mjs'
const label = process.env.QA_LABEL || 'codex-state-baseline'
const out = path.join(ROOT, 'reports/quality', label)
fs.mkdirSync(out, { recursive: true })
const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-codex-state-')))
const probe = net.createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening')
const port = probe.address().port; await new Promise(resolve => probe.close(resolve))
const base = `http://127.0.0.1:${port}`
fs.cpSync(path.join(ROOT, 'server'), path.join(dir, 'server'), { recursive: true })
fs.cpSync(path.join(ROOT, 'public'), path.join(dir, 'public'), { recursive: true })
fs.mkdirSync(path.join(dir, 'data'), { recursive: true })
const models = ['balanced', 'fast'].map((name, i) => ({ id: `qa-${name}`, name: `QA ${name}`, isDefault: i === 0, defaultReasoningEffort: 'medium', efforts: ['low', 'medium', 'high'].map(value => ({ value, label: value })) }))
fs.writeFileSync(path.join(dir, 'data/codex-models.json'), JSON.stringify({ models, defaultModel: 'qa-balanced', updatedAt: Date.now() }))
fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ host: '127.0.0.1', port, accessCode: 'QUALITY-CODEX-STATE', nativeEnabled: false, codexPrewarm: false, dshHome: path.join(dir, 'dsh') }))
fs.writeFileSync(path.join(dir, 'server/codex.mjs'), `
export const codexAvailable = () => false;
export const resolveCodexBinary = () => null;
export const ensureCodexHttpProvider = () => ({ changed: false });
export const readCodexDefaults = () => ({ model: 'qa-balanced', effort: 'medium', provider: 'openai', home: ${JSON.stringify(path.join(dir, 'codex'))} });
`)
const log = fs.openSync(path.join(dir, 'server.log'), 'a')
const child = spawn(process.execPath, ['server/index.mjs'], { cwd: dir, env: { ...process.env, CODEX_HOME: path.join(dir, 'codex') }, stdio: ['ignore', log, log] })
let browser
const results = []
const waitSeen = promise => Promise.race([promise, sleep(5000).then(() => { throw new Error('Expected intercepted request did not arrive within 5 seconds') })])
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(base + '/api/health')).ok) break } catch {} await sleep(30) }
  const login = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'QUALITY-CODEX-STATE' }) })
  const cookie = login.headers.get('set-cookie').split(';')[0]
  const api = async (route, body, method = body ? 'POST' : 'GET') => {
    const response = await fetch(base + route, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
    if (!response.ok) throw new Error(`${method} ${route}: ${response.status}`)
    return response.json()
  }
  await api('/api/backup/import', { conversations: ['A', 'B'].map((name, i) => ({ title: `State ${name}`, engine: 'codex', codexModel: i ? 'qa-fast' : 'qa-balanced', codexEffort: 'medium', messages: [{ role: 'user', text: `Synthetic ${name}` }, { role: 'assistant', text: `Synthetic response ${name}`, status: 'done' }] })) })
  const conversations = (await api('/api/conversations')).conversations
  const A = conversations.find(c => c.title.includes('State A')).id, B = conversations.find(c => c.title.includes('State B')).id
  browser = await launchBrowser()
  const newContext = async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
    await context.addCookies([{ name: 'dsh_access', value: cookie.slice(cookie.indexOf('=') + 1), url: base }])
    return context
  }
  const open = async (context, id) => {
    const page = await context.newPage(); await page.goto(`${base}/c/${id}`)
    await page.locator('#thread .md').waitFor(); await page.locator('#codexFootBtn').waitFor({ state: 'visible' }); await page.waitForTimeout(500)
    return page
  }
  const state = page => page.evaluate(() => ({ route: location.pathname, currentStorage: localStorage.getItem('dsh.current'), title: document.querySelector('#topbarName')?.textContent, pill: document.querySelector('#codexFootBtn')?.textContent, hidden: document.hidden }))
  const choose = async (page, name) => { await page.locator('#codexFootBtn').click(); await page.locator('.codex-model-choice').filter({ has: page.locator('.codex-model-name', { hasText: `QA ${name}` }) }).click() }

  // Two actual tabs, same browser storage. The first tab remains on /c/A.
  {
    await api(`/api/conversations/${A}`, { codexModel: 'qa-balanced' }, 'PATCH'); await api(`/api/conversations/${B}`, { codexModel: 'qa-fast' }, 'PATCH')
    const context = await newContext(); const a = await open(context, A); const b = await open(context, B)
    const requests = []; a.on('request', request => { if (request.method() === 'PATCH') requests.push({ url: new URL(request.url()).pathname, body: request.postDataJSON() }) })
    await a.locator('#input').click()
    await a.waitForTimeout(2700)
    const before = await state(a)
    await choose(a, 'balanced'); await a.waitForTimeout(350)
    const serverA = (await api(`/api/conversations/${A}`)).conversation, serverB = (await api(`/api/conversations/${B}`)).conversation
    const correct = requests.some(r => r.url.endsWith(A)) && !requests.some(r => r.url.endsWith(B)) && serverB.codexModel === 'qa-fast'
    const screenshot = path.join(out, 'cross-tab.png'); await a.screenshot({ path: screenshot, fullPage: true })
    results.push({ case: 'cross-tab model update targets visible conversation', correct, before, after: await state(a), tabB: await state(b), requests, serverModels: { A: serverA.codexModel, B: serverB.codexModel }, screenshot })
    await context.close()
  }
  // Hold one genuine A summary response until B has rendered its own selection.
  {
    await api(`/api/conversations/${A}`, { codexModel: 'qa-balanced' }, 'PATCH'); await api(`/api/conversations/${B}`, { codexModel: 'qa-fast' }, 'PATCH')
    const context = await newContext(), page = await open(context, A)
    let held = false, release; const gate = new Promise(resolve => { release = resolve }); let intercepted; const seen = new Promise(resolve => { intercepted = resolve })
    await page.route(`**/api/conversations/${A}?summary=1`, async route => {
      if (held) return route.continue()
      held = true; const response = await route.fetch(); intercepted(); await gate; await route.fulfill({ response })
    })
    await page.locator(`[data-id="${A}"] .conv-main`).click(); await waitSeen(seen)
    await page.locator(`[data-id="${B}"] .conv-main`).click()
    await page.waitForURL(`**/c/${B}`); await page.waitForFunction(() => document.querySelector('#codexFootBtn')?.textContent.includes('QA fast'))
    await page.waitForTimeout(600)
    const before = await state(page); release(); await page.waitForTimeout(120)
    const after = await state(page), correct = after.route.endsWith(B) && after.pill.includes('QA fast')
    const screenshot = path.join(out, 'late-summary.png'); await page.screenshot({ path: screenshot, fullPage: true })
    results.push({ case: 'late A summary cannot overwrite B selection', correct, before, after, serverB: (await api(`/api/conversations/${B}`)).conversation.codexModel, screenshot })
    await context.close()
  }
  // Hold the real A PATCH response while navigating to B with another preference.
  {
    await api(`/api/conversations/${A}`, { codexModel: 'qa-balanced' }, 'PATCH'); await api(`/api/conversations/${B}`, { codexModel: 'qa-balanced' }, 'PATCH')
    const context = await newContext(), page = await open(context, A)
    let release; const gate = new Promise(resolve => { release = resolve }); let intercepted; const seen = new Promise(resolve => { intercepted = resolve })
    await page.route(`**/api/conversations/${A}`, async route => {
      if (route.request().method() !== 'PATCH') return route.continue()
      const response = await route.fetch(); intercepted(); await gate; await route.fulfill({ response })
    })
    await choose(page, 'fast'); await waitSeen(seen); await page.keyboard.press('Escape')
    await page.locator(`[data-id="${B}"] .conv-main`).click(); await page.waitForURL(`**/c/${B}`)
    await page.waitForFunction(() => document.querySelector('#codexFootBtn')?.textContent.includes('QA balanced'))
    await page.waitForTimeout(600)
    const before = await state(page); release(); await page.waitForTimeout(120)
    const after = await state(page), correct = after.route.endsWith(B) && after.pill.includes('QA balanced')
    const screenshot = path.join(out, 'late-patch.png'); await page.screenshot({ path: screenshot, fullPage: true })
    results.push({ case: 'late A patch cannot overwrite B selection', correct, before, after, serverB: (await api(`/api/conversations/${B}`)).conversation.codexModel, screenshot })
    await context.close()
  }
  // Exercise the production fetch wrapper with a genuine created response.
  {
    await api(`/api/conversations/${B}`, { codexModel: 'qa-fast' }, 'PATCH')
    const context = await newContext(), page = await open(context, A)
    let release; const gate = new Promise(resolve => { release = resolve }); let intercepted; const seen = new Promise(resolve => { intercepted = resolve })
    await page.route('**/api/conversations', async route => {
      if (route.request().method() !== 'POST') return route.continue()
      const response = await route.fetch(); intercepted(); await gate; await route.fulfill({ response })
    })
    const creation = page.evaluate(() => fetch('/api/conversations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ engine: 'codex' }) }).then(response => response.json()))
    await waitSeen(seen)
    await page.locator(`[data-id="${B}"] .conv-main`).click(); await page.waitForURL(`**/c/${B}`); await page.waitForTimeout(600)
    const before = await state(page); release(); const created = await creation; await page.waitForTimeout(120)
    const after = await state(page)
    results.push({ case: 'late creation response cannot select its conversation over visible B', correct: after.route.endsWith(B) && after.pill.includes('QA fast'), before, after, createdId: created.conversation.id })
    await context.close()
  }
  // Desktop-open transport is explicitly simulated, so no native app is opened.
  {
    const context = await newContext(), page = await context.newPage()
    await page.route(`**/api/conversations/${A}?summary=1`, async route => {
      const response = await route.fetch(), data = await response.json()
      data.conversation.codexThreadId = '00000000-0000-4000-8000-000000000001'
      await route.fulfill({ response, json: data })
    })
    await page.goto(`${base}/c/${A}`); await page.locator('#codexOpenBtn').waitFor({ state: 'visible' })
    let release; const gate = new Promise(resolve => { release = resolve }); let intercepted; const seen = new Promise(resolve => { intercepted = resolve }); const opened = []
    await page.route('**/open-codex', async route => { opened.push(new URL(route.request().url()).pathname); intercepted(); await gate; await route.fulfill({ status: 200, json: { ok: true } }) })
    await page.locator('#codexOpenBtn').click(); await waitSeen(seen)
    await page.locator(`[data-id="${B}"] .conv-main`).click(); await page.waitForURL(`**/c/${B}`); await page.waitForTimeout(600)
    release(); await page.waitForTimeout(120)
    const toast = await page.locator('#codexToast.show').allTextContents()
    results.push({ case: 'desktop open stays on captured A and completion does not notify B', correct: opened.length === 1 && opened[0].includes(A) && !toast.some(text => text.includes('已在 Codex')), opened, after: await state(page), toast, injection: 'Synthetic thread id and simulated desktop-open response; no native app call' })
    await context.close()
  }
  {
    const context = await newContext(), page = await open(context, A)
    let count = 0, release; const gate = new Promise(resolve => { release = resolve }); let intercepted; const seen = new Promise(resolve => { intercepted = resolve })
    await page.route(`**/api/conversations/${A}?summary=1`, async route => {
      count += 1; const response = await route.fetch(); intercepted(); await gate; await route.fulfill({ response })
    })
    await page.locator(`[data-id="${A}"] .conv-main`).click(); await waitSeen(seen)
    for (let i = 0; i < 3; i++) { await page.locator(`[data-id="${A}"] .conv-main`).click(); await page.waitForTimeout(270) }
    const pendingCount = count; release(); await page.waitForTimeout(120)
    results.push({ case: 'repeated refresh triggers reuse the pending summary request', correct: pendingCount === 1, pendingCount })
    await context.close()
  }
  {
    await api(`/api/conversations/${A}`, { codexModel: 'qa-balanced' }, 'PATCH')
    const context = await newContext(), page = await open(context, A)
    let failed = false
    await page.route(`**/api/conversations/${A}`, async route => {
      if (route.request().method() === 'PATCH' && !failed) { failed = true; return route.fulfill({ status: 503, json: { error: 'QA temporary save failure' } }) }
      return route.continue()
    })
    await choose(page, 'fast'); await page.locator('#codexToast.show').waitFor()
    const error = await page.locator('#codexToast').textContent()
    await page.locator('.codex-model-choice').filter({ has: page.locator('.codex-model-name', { hasText: 'QA fast' }) }).click()
    await page.waitForFunction(() => document.querySelector('#codexFootBtn')?.textContent.includes('QA fast'))
    const serverModel = (await api(`/api/conversations/${A}`)).conversation.codexModel
    results.push({ case: 'failed selection preserves current value and can be retried', correct: error.includes('QA temporary') && serverModel === 'qa-fast', error, serverModel, injection: 'First PATCH response intentionally 503; retry uses real HTTP handler' })
    await context.close()
  }
} catch (error) { results.push({ case: 'suite', error: error.stack }); process.exitCode = 1 }
finally {
  if (browser) await browser.close()
  child.kill('SIGTERM'); await sleep(300); fs.closeSync(log)
  const report = { capturedAt: new Date().toISOString(), fixture: 'Synthetic model catalog and messages, isolated real server handlers, Chrome UI interaction; zero model runs', sourceHash: createHash('sha256').update(fs.readFileSync(path.join(dir, 'public/js/codex.js'))).digest('hex'), sandbox: dir, results }
  fs.writeFileSync(path.join(out, 'codex-state.json'), JSON.stringify(report, null, 2))
  fs.writeFileSync(path.join(ROOT, 'docs/product/quality-2026-10-22/evidence', `${label}.json`), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(results, null, 2))
  if (process.argv.includes('--verify') && results.some(result => result.correct !== true)) process.exitCode = 1
}
