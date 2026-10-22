// Isolated R1 regression suite. No real engine, account, or user data is used.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import net from 'node:net'
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-quality-backend-')))
const results = []
let child, store
let serverLog = ''
async function test(id, name, action) {
  const startedAt = performance.now()
  try {
    await action()
    results.push({ id, name, status: 'passed', durationMs: Math.round(performance.now() - startedAt) })
    console.log(`PASS ${id} ${name}`)
  } catch (error) {
    results.push({ id, name, status: 'failed', error: error.message })
    console.error(`FAIL ${id} ${name}: ${error.message}`)
  }
}
function cleanStore() {
  if (store.saveTimer) clearTimeout(store.saveTimer)
  store.saveTimer = null
  store.data.conversations = []
}
function statusIs(status) { return (error) => error.status === status }
async function freePort() {
  const server = net.createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const port = server.address().port
  await new Promise((resolve) => server.close(resolve))
  return port
}
try {
  fs.cpSync(path.join(root, 'server'), path.join(temp, 'server'), { recursive: true })
  fs.symlinkSync(path.join(root, 'public'), path.join(temp, 'public'), 'dir')
  const port = await freePort()
  fs.writeFileSync(path.join(temp, 'config.json'), JSON.stringify({
    host: '127.0.0.1', port, accessCode: 'quality-fixture-code', nativeEnabled: false,
    dshHome: path.join(temp, 'dsh'), codexPrewarm: false,
  }))
  // Engine discovery is the only stub; all HTTP handlers, uploads and storage run unchanged.
  fs.writeFileSync(path.join(temp, 'server', 'codex.mjs'), `
    export const codexAvailable = () => false;
    export const resolveCodexBinary = () => null;
    export const ensureCodexHttpProvider = () => ({ changed: false });
    export const readCodexDefaults = () => ({ model: '', effort: '', provider: 'openai', home: ${JSON.stringify(path.join(temp, 'codex'))} });
  `)
  const { ConversationStore } = await import(pathToFileURL(path.join(temp, 'server', 'store.mjs')))
  store = new ConversationStore()
  await test('R1-006', 'invalid import is atomic and reports 400', () => {
    const original = store.create('owner')
    fs.mkdirSync(original.workspace); fs.writeFileSync(path.join(original.workspace, 'keep.txt'), 'keep')
    const before = JSON.stringify(store.data)
    for (const bad of [null, [], { conversations: [null] }, { conversations: [{ messages: 'bad' }] },
      { conversations: [{ title: 'valid' }, { messages: [null] }] },
      { conversations: [{ messages: [{ blocks: [null] }] }] }]) {
      assert.throws(() => store.import('owner', bad), statusIs(400))
      assert.equal(JSON.stringify(store.data), before)
    }
    assert.equal(fs.readFileSync(path.join(original.workspace, 'keep.txt'), 'utf8'), 'keep')
  })
  await test('R1-006', 'valid backup preserves long history and preferences', () => {
    cleanStore()
    const original = store.create('owner', { engine: 'codex', permission: 'read-only' })
    original.codexModel = 'model-a'; original.codexEffort = 'high'; original.pinned = true
    original.archivedAt = Date.now()
    original.messages = Array.from({ length: 405 }, (_, i) => ({ id: `m${i}`, role: 'assistant', text: `text ${i}`, status: 'interrupted', createdAt: 123, blocks: [{ type: 'text', text: `text ${i}` }] }))
    const backup = store.backup('owner')
    assert.deepEqual(store.import('owner', backup), { imported: 1 })
    const imported = store.data.conversations[0]
    assert.equal(imported.messages.length, 405)
    assert.equal(imported.messages[404].text, 'text 404')
    assert.equal(imported.messages[0].status, 'interrupted')
    assert.equal(imported.pinned, true); assert.equal(imported.archivedAt, original.archivedAt)
    assert.equal(imported.codexModel, 'model-a'); assert.equal(imported.codexEffort, 'high')
    assert.notEqual(imported.id, original.id); assert.equal(imported.codexThreadId, null)
  })
  await test('R1-006', 'valid import above 100 conversations is complete and durable', async () => {
    cleanStore()
    const payload = { version: 1, conversations: Array.from({ length: 101 }, (_, i) => ({ title: `import ${i}`, messages: [] })) }
    assert.deepEqual(store.import('owner', payload), { imported: 101 })
    await store.flush()
    const saved = JSON.parse(fs.readFileSync(path.join(temp, 'data', 'conversations.json'), 'utf8'))
    assert.equal(saved.conversations.length, 101)
  })
  await test('R1-007', '301st create cannot delete pinned conversation or files', () => {
    cleanStore(); const first = store.create('owner'); first.pinned = true
    fs.mkdirSync(first.workspace); fs.writeFileSync(path.join(first.workspace, 'keep.txt'), 'keep')
    for (let i = 1; i < 300; i++) store.create('owner')
    const before = JSON.stringify(store.data)
    assert.throws(() => store.create('owner'), statusIs(409))
    assert.equal(JSON.stringify(store.data), before)
    assert.equal(fs.readFileSync(path.join(first.workspace, 'keep.txt'), 'utf8'), 'keep')
  })
  await test('R1-007', 'over-capacity import and duplicate leave data unchanged', () => {
    const before = JSON.stringify(store.data)
    assert.throws(() => store.import('owner', { conversations: [{ messages: [] }] }), statusIs(409))
    assert.throws(() => store.duplicate('owner', store.data.conversations[0].id), statusIs(409))
    assert.equal(JSON.stringify(store.data), before)
  })
  await test('R1-008', 'three engine modes retain independent files and selection', () => {
    cleanStore()
    for (const mode of ['codex', 'native', 'headless']) {
      const source = store.create('owner', { engine: mode === 'codex' ? 'codex' : 'dsr' })
      source.mode = mode; source.codexModel = 'model-a'; source.codexEffort = 'high'
      source.dshSessionId = 'old-session'; source.codexThreadId = 'old-thread'
      fs.mkdirSync(source.workspace); fs.writeFileSync(path.join(source.workspace, 'original.txt'), mode)
      if (mode === 'native') source.nativeCwd = source.workspace
      const copy = store.duplicate('owner', source.id)
      const expected = mode === 'headless' ? path.join(temp, 'data', 'workspaces', copy.id) : path.join(temp, 'data', 'workspace', 'chats', copy.id)
      assert.equal(copy.workspace, expected)
      assert.equal(fs.readFileSync(path.join(copy.workspace, 'original.txt'), 'utf8'), mode)
      assert.equal(copy.codexModel, 'model-a'); assert.equal(copy.codexEffort, 'high')
      assert.equal(copy.dshSessionId, null); assert.equal(copy.codexThreadId, null)
      fs.writeFileSync(path.join(copy.workspace, 'original.txt'), 'copy changed')
      assert.equal(fs.readFileSync(path.join(source.workspace, 'original.txt'), 'utf8'), mode)
    }
  })
  await test('R1-008', 'copy failure removes partial files and publishes no conversation', () => {
    const source = store.create('owner'); fs.mkdirSync(source.workspace)
    const before = JSON.stringify(store.data), copyFn = fs.cpSync
    let partial
    fs.cpSync = (_source, dest) => { partial = dest; fs.mkdirSync(dest, { recursive: true }); throw new Error('fixture disk failure') }
    try { assert.throws(() => store.duplicate('owner', source.id), statusIs(500)) } finally { fs.cpSync = copyFn }
    assert.equal(JSON.stringify(store.data), before); assert.equal(fs.existsSync(partial), false)
  })
  cleanStore(); clearInterval(store.purgeTimer); await store.flush()
  child = spawn(process.execPath, [path.join(temp, 'server', 'index.mjs')], {
    cwd: temp, env: { ...process.env, CODEX_HOME: path.join(temp, 'codex') }, stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', chunk => { serverLog += chunk }); child.stderr.on('data', chunk => { serverLog += chunk })
  const base = `http://127.0.0.1:${port}`
  let ready = false
  for (let i = 0; i < 100; i++) {
    try { ready = (await fetch(`${base}/api/health`)).ok } catch {}
    if (ready) break
    await new Promise(resolve => setTimeout(resolve, 30))
  }
  assert.ok(ready, 'isolated server started')
  const login = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'quality-fixture-code' }) })
  assert.equal(login.status, 200)
  const cookie = login.headers.get('set-cookie').split(';')[0]
  const api = (route, options = {}) => fetch(base + route, { ...options, headers: { Cookie: cookie, ...options.headers } })
  const postJson = (route, body) => api(route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  let conversation
  await test('R1-010', 'malformed cookies do not block authentication recovery', async () => {
    const malformed = await fetch(`${base}/api/me`, { headers: { Cookie: 'dsh_access=%ZZ; unrelated=ok' } })
    assert.equal(malformed.status, 200); assert.equal((await malformed.json()).authenticated, false)
    const valid = await fetch(`${base}/api/me`, { headers: { Cookie: `bad=%ZZ; ${cookie}` } })
    assert.equal((await valid.json()).authenticated, true)
    assert.equal((await fetch(`${base}/api/conversations`, { headers: { Cookie: 'dsh_access=%ZZ' } })).status, 401)
  })
  await test('R1-010', 'non-object JSON rejected without creating conversations', async () => {
    for (const body of [null, [], 'bad']) assert.equal((await postJson('/api/conversations', body)).status, 400)
    assert.equal((await (await api('/api/conversations')).json()).total, 0)
  })
  await test('R1-010', 'malformed Host returns 400 and server remains healthy', async () => {
    const response = await new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: '127.0.0.1', port }); let text = ''
      socket.setTimeout(3000, () => socket.destroy(new Error('request timeout')))
      socket.on('connect', () => socket.end('GET /api/health HTTP/1.1\r\nHost: [\r\nConnection: close\r\n\r\n'))
      socket.on('data', chunk => { text += chunk }); socket.on('error', reject); socket.on('close', () => resolve(text))
    })
    assert.match(response, /HTTP\/1\.1 400/)
    assert.equal((await fetch(`${base}/api/health`)).status, 200)
  })
  await test('R1-006', 'HTTP invalid import returns 400 and no partial records', async () => {
    const response = await postJson('/api/backup/import', { conversations: [{ messages: [] }, { messages: [null] }] })
    assert.equal(response.status, 400)
    assert.equal((await (await api('/api/conversations')).json()).total, 0)
  })
  await test('R1-009', 'simultaneous same-name uploads preserve both contents', async () => {
    conversation = (await (await postJson('/api/conversations', { engine: 'codex' })).json()).conversation
    const values = ['A'.repeat(1024 * 1024), 'B'.repeat(1024 * 1024)]
    const responses = await Promise.all(values.map(body => api(`/api/conversations/${conversation.id}/upload?name=same.txt`, { method: 'POST', body })))
    for (const response of responses) assert.equal(response.status, 201)
    const files = await Promise.all(responses.map(response => response.json()))
    assert.notEqual(files[0].file.path, files[1].file.path)
    for (let i = 0; i < files.length; i++) {
      const raw = await api(`/api/conversations/${conversation.id}/files/raw?path=${encodeURIComponent(files[i].file.path)}`)
      assert.equal(await raw.text(), values[i])
    }
  })
  await test('R1-009', 'empty upload cleans temporary files without overwriting existing files', async () => {
    assert.equal((await api(`/api/conversations/${conversation.id}/upload?name=same.txt`, { method: 'POST', body: '' })).status, 400)
    const files = (await (await api(`/api/conversations/${conversation.id}/files`)).json()).files
    assert.equal(files.length, 2)
    const uploadDir = path.join(temp, 'data', 'workspace', 'chats', conversation.id, 'uploads')
    assert.equal(fs.readdirSync(uploadDir).filter(name => name.endsWith('.part')).length, 0)
  })
  await test('R1-009', 'cancelled upload cleans its temporary file', async () => {
    await new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: '127.0.0.1', port })
      socket.on('error', reject)
      socket.on('connect', () => {
        socket.write(`POST /api/conversations/${conversation.id}/upload?name=cancelled.txt HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nCookie: ${cookie}\r\nContent-Length: 1000000\r\n\r\npartial`)
        setTimeout(() => { socket.destroy(); resolve() }, 40)
      })
    })
    const uploadDir = path.join(temp, 'data', 'workspace', 'chats', conversation.id, 'uploads')
    for (let i = 0; i < 50 && fs.readdirSync(uploadDir).some(name => name.endsWith('.part')); i++) await new Promise(resolve => setTimeout(resolve, 20))
    assert.equal(fs.readdirSync(uploadDir).filter(name => name.endsWith('.part')).length, 0)
    assert.equal(fs.existsSync(path.join(uploadDir, 'cancelled.txt')), false)
    assert.equal((await fetch(`${base}/api/health`)).status, 200)
  })
  await test('R1-009', 'upload limit and path traversal protection remain enforced', async () => {
    const oversized = await api(`/api/conversations/${conversation.id}/upload?name=large.bin`, { method: 'POST', body: Buffer.alloc(25 * 1024 * 1024 + 1) })
    assert.equal(oversized.status, 413)
    assert.equal((await api(`/api/conversations/${conversation.id}/files/raw?path=../../config.json`)).status, 404)
  })
  await test('R1-009', 'upload refuses an external symlink directory', async () => {
    const conv = (await (await postJson('/api/conversations', { engine: 'codex' })).json()).conversation
    const cwd = path.join(temp, 'data', 'workspace', 'chats', conv.id), outside = path.join(temp, 'outside')
    fs.mkdirSync(cwd, { recursive: true }); fs.mkdirSync(outside); fs.symlinkSync(outside, path.join(cwd, 'uploads'), 'dir')
    assert.equal((await api(`/api/conversations/${conv.id}/upload?name=escape.txt`, { method: 'POST', body: 'safe' })).status, 400)
    assert.deepEqual(fs.readdirSync(outside), [])
  })
  await test('R1-008', 'duplicate files survive subsequent upload via HTTP', async () => {
    const copyResponse = await postJson(`/api/conversations/${conversation.id}/duplicate`, {})
    assert.equal(copyResponse.status, 201)
    const copy = (await copyResponse.json()).conversation
    assert.equal((await api(`/api/conversations/${copy.id}/upload?name=new.txt`, { method: 'POST', body: 'new' })).status, 201)
    const files = (await (await api(`/api/conversations/${copy.id}/files`)).json()).files
    assert.equal(files.length, 3)
    const copiedContents = await Promise.all(files.filter(file => file.name.startsWith('same')).map(async file => (await api(`/api/conversations/${copy.id}/files/raw?path=${encodeURIComponent(file.path)}`)).text()))
    assert.deepEqual(copiedContents.sort(), ['A'.repeat(1024 * 1024), 'B'.repeat(1024 * 1024)])
    assert.equal((await (await api(`/api/conversations/${conversation.id}/files`)).json()).files.length, 2)
  })
  await test('R1-011', 'explicit modern NODE_BIN is respected', () => {
    const result = spawnSync('/bin/bash', [path.join(root, 'start.sh'), '--check-runtime'], { env: { ...process.env, NODE_BIN: process.execPath }, encoding: 'utf8' })
    assert.equal(result.status, 0); assert.equal(result.stdout.trim(), process.execPath)
  })
  await test('R1-011', 'invalid explicit runtime fails with actionable explanation', () => {
    const result = spawnSync('/bin/bash', [path.join(root, 'start.sh'), '--check-runtime'], { env: { ...process.env, NODE_BIN: path.join(temp, 'missing') }, encoding: 'utf8' })
    assert.equal(result.status, 1); assert.match(result.stderr, /Node.js 22/)
  })
  await test('R1-011', 'deployment preserves selected runtime and escapes XML paths', () => {
    const install = fs.readFileSync(path.join(root, 'deploy/install.sh'), 'utf8')
    const script = install.match(/<<'JS'\n([\s\S]*?)\nJS/)[1]
    const target = path.join(temp, 'test-service.plist')
    const result = spawnSync(process.execPath, ['--input-type=module', '-', path.join(root, 'deploy/com.dshchat.server.plist.template'), target, '/tmp/project & demo', '/tmp/runtime & demo/node'], { input: script, encoding: 'utf8' })
    assert.equal(result.status, 0)
    const plist = fs.readFileSync(target, 'utf8')
    assert.match(plist, /<key>NODE_BIN<\/key>/)
    assert.match(plist, /runtime &amp; demo/)
    assert.match(plist, /project &amp; demo/)
    const lint = spawnSync('/usr/bin/plutil', ['-lint', target], { encoding: 'utf8' })
    if (!lint.error) assert.equal(lint.status, 0, lint.stdout)
  })
  await test('R1-011', 'old PATH runtime falls back to installed modern runtime', () => {
    const fakeBin = path.join(temp, 'fake-bin'), nvm = path.join(temp, 'nvm')
    fs.mkdirSync(fakeBin); fs.writeFileSync(path.join(fakeBin, 'node'), '#!/bin/sh\nexit 1\n', { mode: 0o755 })
    fs.mkdirSync(path.join(nvm, 'versions/node/v22-test/bin'), { recursive: true })
    fs.symlinkSync(process.execPath, path.join(nvm, 'versions/node/v22-test/bin/node'))
    const env = { ...process.env, PATH: `${fakeBin}:/usr/bin:/bin`, NVM_DIR: nvm }; delete env.NODE_BIN
    const result = spawnSync('/bin/bash', [path.join(root, 'start.sh'), '--check-runtime'], { env, encoding: 'utf8' })
    assert.equal(result.status, 0)
    const version = spawnSync(result.stdout.trim(), ['-p', 'Number(process.versions.node.split(".")[0])'], { encoding: 'utf8' })
    assert.ok(Number(version.stdout) >= 22)
  })
} catch (error) {
  results.push({ id: 'suite', status: 'failed', error: error.stack })
  console.error(error)
} finally {
  if (store) { clearTimeout(store.saveTimer); clearInterval(store.purgeTimer); await store.writing?.catch(() => {}) }
  if (child && child.exitCode === null) { child.kill('SIGTERM'); await Promise.race([once(child, 'exit'), new Promise(resolve => setTimeout(resolve, 4000))]); if (child.exitCode === null) child.kill('SIGKILL') }
  const output = path.join(root, 'docs/product/quality-2026-10-22/evidence/backend-R1.json')
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, JSON.stringify({ capturedAt: new Date().toISOString(), runtime: process.version, scope: 'temporary store and real HTTP service; engine discovery stubbed; no model calls or user data', results, passed: results.filter(r => r.status === 'passed').length, failed: results.filter(r => r.status === 'failed').length }, null, 2))
  if (results.some(r => r.status === 'failed')) fs.writeFileSync(path.join(temp, 'server.log'), serverLog)
  else fs.rmSync(temp, { recursive: true, force: true })
  console.log(`${results.filter(r => r.status === 'passed').length}/${results.length} passed`)
  process.exitCode = results.some(r => r.status === 'failed') ? 1 : 0
}
