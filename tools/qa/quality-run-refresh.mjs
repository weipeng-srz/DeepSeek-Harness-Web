import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { ROOT, createSandbox, launchBrowser, loginPage, sleep } from './quality-harness.mjs'
const label = process.env.QA_LABEL || 'run-refresh-current'
const requireReconnect = process.env.QA_REQUIRE_RECONNECT === '1' || ['run-refresh-final', 'run-refresh-current'].includes(label)
const out = path.join(ROOT, 'reports/quality', label); fs.mkdirSync(out, { recursive: true })
const port = Number(process.env.QA_PORT || 8812), proxyPort = Number(process.env.QA_PROXY_PORT || 8813)
const tool = (status, result = '') => ({ type: 'tool', id: 'qa-call', tool: 'read_file', input: { path: 'synthetic-qa.txt' }, status, result })
const seed = (id, status, toolStatus) => ({ id, title: `QA ${id}`, messages: [{ role: 'user', text: 'Synthetic tool status check; no model or file tool executed.' }, { id: `${id}-assistant`, role: 'assistant', text: 'QA persisted answer', status, blocks: [tool(toolStatus, toolStatus === 'running' ? '' : `QA ${toolStatus} result`), { type: 'text', text: 'QA persisted answer' }] }] })
const fixtureIds = ['qa-completed', 'qa-error', 'qa-failed', 'qa-stopped', 'qa-interrupted', 'qa-live', 'qa-refresh-active', 'qa-drop', 'qa-live-stop', 'qa-live-failed', 'qa-unconfirmed']
const sandbox = await createSandbox({ port, label, seedConversations: [seed('qa-completed', 'done', 'completed'), seed('qa-error', 'error', 'error'), seed('qa-failed', 'done', 'failed'), seed('qa-stopped', 'stopped', 'running'), seed('qa-interrupted', 'interrupted', 'running'), ...fixtureIds.slice(5).map(id => seed(id, 'done', 'completed'))] })
const bases = new Map()
for (const id of fixtureIds) bases.set(id, (await sandbox.api(`/api/conversations/${id}`)).body.conversation)
const states = new Map(), sockets = new Set()
const detail = id => {
  const base = structuredClone(bases.get(id)), state = states.get(id)
  if (!state) return base
  base.running = state.status === 'running'; const msg = base.messages.at(-1); msg.status = state.status
  msg.text = state.status === 'running' ? '' : state.status === 'stopped' ? 'QA stopped before tool result' : 'QA terminal response over real HTTP stream'
  msg.blocks = [tool(state.toolStatus, ['completed', 'failed'].includes(state.toolStatus) ? `QA live ${state.toolStatus} result` : ''), ...(msg.text ? [{ type: 'text', text: msg.text }] : [])]
  return base
}
const send = (res, event) => { if (!res.destroyed && !res.writableEnded) res.write(JSON.stringify(event) + '\n') }
const finish = (id, { stopped = false, failed = false, unconfirmed = false } = {}) => {
  const state = states.get(id); state.status = stopped ? 'stopped' : 'done'; state.toolStatus = stopped || unconfirmed ? 'running' : failed ? 'failed' : 'completed'
  for (const res of state.responses) {
    if (!stopped && !unconfirmed) { send(res, { t: 'tool_result', id: 'qa-call', status: state.toolStatus, result: `QA live ${state.toolStatus} result` }); send(res, { t: 'text', text: 'QA terminal response over real HTTP stream' }) }
    send(res, { t: 'done', status: state.status, durationMs: 500 }); res.end()
  }
  state.responses.clear()
}
const proxy = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${proxyPort}`), match = url.pathname.match(/^\/api\/conversations\/([^/]+)(\/attach)?$/)
  if (req.method === 'GET' && match && states.has(match[1])) {
    const id = match[1], state = states.get(id)
    if (!match[2]) { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ conversation: detail(id) })); return }
    state.attaches++
    if (state.status !== 'running') { res.writeHead(409, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'QA run already finished' })); return }
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache', Connection: 'keep-alive' }); res.flushHeaders()
    send(res, { t: 'reset', messageId: `${id}-assistant`, title: `QA ${id}` }); send(res, { t: 'tool_call', id: 'qa-call', tool: 'read_file', input: { path: 'synthetic-qa.txt' } })
    state.responses.add(res); res.on('close', () => state.responses.delete(res))
    if (state.dropFirst && state.attaches === 1) setTimeout(() => res.destroy(), 150)
    return
  }
  const upstream = http.request({ hostname: '127.0.0.1', port, path: req.url, method: req.method, headers: req.headers }, response => { res.writeHead(response.statusCode, response.headers); response.pipe(res) })
  upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end() }); req.pipe(upstream)
})
proxy.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)) })
await new Promise((resolve, reject) => { proxy.once('error', reject); proxy.listen(proxyPort, '127.0.0.1', resolve) })
const browser = await launchBrowser(), results = [], diagnostics = [], errors = []
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' })
const proxySandbox = { ...sandbox, base: `http://127.0.0.1:${proxyPort}` }
const getPage = async id => { const page = await context.newPage(); page.setDefaultTimeout(7000); page.on('pageerror', e => errors.push(e.message)); await page.goto(`${proxySandbox.base}/c/${id}`); await page.locator('.tool-card').waitFor(); return page }
const stateOf = page => page.evaluate(() => ({ cards: [...document.querySelectorAll('.tool-card')].map(el => ({ status: el.dataset.status, badge: el.querySelector('.tool-badge').textContent, result: el.querySelector('pre[data-kind=result]')?.textContent || '' })), send: document.querySelector('#sendBtn').getAttribute('aria-label'), activeStatuses: [...document.querySelectorAll('.gen-status')].filter(el => !el.hidden).map(el => el.textContent), text: document.querySelector('#thread').innerText }))
const check = async (name, run, diagnostic = false) => { const rows = diagnostic ? diagnostics : results; let page; try { const result = await run(p => { page = p }); rows.push({ name, status: result.ok ? 'passed' : 'failed', evidence: result }); console.log(`${diagnostic ? 'DIAGNOSTIC ' : ''}${result.ok ? 'PASS' : 'FAIL'} ${name} ${JSON.stringify(result)}`) } catch (error) { rows.push({ name, status: 'failed', evidence: { error: error.message, ...(page ? { rendered: await stateOf(page).catch(() => null) } : {}) } }); console.log(`${diagnostic ? 'DIAGNOSTIC ' : ''}FAIL ${name} ${error.message}`) } finally { if (page) { await page.waitForTimeout(500); await page.screenshot({ path: path.join(out, `${diagnostic ? 'diagnostic' : 'case'}-${rows.length}.png`), fullPage: true }); await page.close() } } }
try {
  const login = await context.newPage(); await loginPage(login, proxySandbox); await login.close()
  for (const [id, expected] of [['qa-completed', '完成'], ['qa-error', '失败'], ['qa-failed', '失败']]) await check(`persisted ${id} tool keeps its terminal badge after refresh`, async assign => {
    const page = await getPage(id); assign(page); const before = await stateOf(page); await page.reload(); await page.locator('.tool-card').waitFor(); const after = await stateOf(page)
    return { ok: before.cards[0].badge.includes(expected) && after.cards[0].badge.includes(expected) && after.activeStatuses.length === 0 && after.send === '发送', before, after }
  })
  for (const [id, expected] of [['qa-stopped', '停止'], ['qa-interrupted', '中断']]) await check(`${id} conversation never presents an unresolved tool as running or successful`, async assign => {
    const page = await getPage(id); assign(page); await page.reload(); await page.locator('.tool-card').waitFor(); const after = await stateOf(page)
    return { ok: !/运行中|完成/.test(after.cards[0].badge) && after.cards[0].badge.includes(expected) && after.cards[0].status !== 'running' && !after.cards[0].result.includes('运行中') && after.activeStatuses.length === 0, after }
  })
  for (const [id, refreshActive, dropFirst, stopped, failed, unconfirmed] of [['qa-live', false, false, false, false, false], ['qa-refresh-active', true, false, false, false, false], ['qa-live-stop', true, false, true, false, false], ['qa-live-failed', true, false, false, true, false], ['qa-unconfirmed', true, false, false, false, true], ['qa-drop', false, true, false, false, false]]) await check(`${id}: active transport, completion and reload agree`, async assign => {
    states.set(id, { status: 'running', toolStatus: 'running', responses: new Set(), attaches: 0, dropFirst })
    const page = await getPage(id); assign(page); await page.waitForFunction(() => document.querySelector('#sendBtn').getAttribute('aria-label') === '停止生成')
    if (refreshActive) { await page.reload(); await page.waitForFunction(() => document.querySelector('#sendBtn').getAttribute('aria-label') === '停止生成') }
    if (dropFirst) { for (let i = 0; i < 60 && states.get(id).attaches < 2; i++) await sleep(100); if (states.get(id).attaches < 2) throw new Error('HTTP stream reconnect did not occur'); await page.waitForFunction(() => document.querySelector('#sendBtn').getAttribute('aria-label') === '停止生成') }
    const active = await stateOf(page); finish(id, { stopped, failed, unconfirmed }); await page.waitForFunction(() => document.querySelector('#sendBtn').getAttribute('aria-label') === '发送'); await page.waitForTimeout(250)
    const finished = await stateOf(page); await page.reload(); await page.locator('.tool-card').waitFor(); const refreshed = await stateOf(page)
    const terminal = stopped ? state => state.cards[0].badge.includes('停止') && !/运行中|完成/.test(state.cards[0].badge) && state.cards[0].status !== 'running' && !state.cards[0].result.includes('运行中') : unconfirmed ? state => state.cards[0].badge.includes('结果未确认') && state.cards[0].status !== 'running' && !state.cards[0].result.includes('运行中') : failed ? state => state.cards[0].badge.includes('失败') && ['failed', 'error'].includes(state.cards[0].status) : state => state.cards[0].badge.includes('完成') && state.cards[0].status === 'completed'
    return { ok: active.cards[0].badge.includes('运行中') && terminal(finished) && terminal(refreshed) && refreshed.send === '发送' && refreshed.activeStatuses.length === 0, active, finished, refreshed, attaches: states.get(id).attaches, simulatedModel: true }
  }, id === 'qa-drop')
  results.push({ name: 'refresh flows have no uncaught browser exceptions', status: errors.length ? 'failed' : 'passed', evidence: { errors } })
} finally {
  const acceptance = [...results, ...(requireReconnect ? diagnostics : [])]
  const summary = { passed: acceptance.filter(result => result.status === 'passed').length, failed: acceptance.filter(result => result.status !== 'passed').length, total: acceptance.length }
  fs.writeFileSync(path.join(out, 'run-refresh.json'), JSON.stringify({ label, generatedAt: new Date().toISOString(), sourceSnapshot: sandbox.dir, sourceFiles: sandbox.sourceFiles, scope: 'Real isolated server and Chrome. Persisted completed/error/failed/stopped/interrupted tool fixtures use actual storage/API. Active model state and NDJSON chunks are deliberately simulated through a local HTTP proxy; no real model/tool execution. Tests target displayed badge as well as data-status and composer. Raw socket reconnect is retained in diagnostics and counts in acceptance only when requireReconnect is true. No undocumented 204 endpoint behavior is assumed.', requireReconnect, summary, results, diagnostics }, null, 2))
  await context.close(); await browser.close(); for (const socket of sockets) socket.destroy(); await new Promise(resolve => proxy.close(resolve)); await sandbox.stop()
  process.exitCode = summary.failed ? 1 : 0
  console.log(`ACCEPTANCE ${summary.passed}/${summary.total}; exit ${process.exitCode}`)
}
