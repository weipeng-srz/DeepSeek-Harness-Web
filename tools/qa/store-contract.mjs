// Store contract: what happens when the data files on disk are wrong.
// Every case boots a real server against a deliberately damaged data dir and
// asserts that (a) the process still serves requests, (b) the damaged bytes are
// preserved next to the store, and (c) the API stays usable for the records
// that are still valid.
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { ROOT, createSandbox, sleep } from './quality-harness.mjs'

const results = []
function record(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const PORT = Number(process.env.QA_PORT || 8819)

async function bootWith(files) {
  const sandbox = await createSandbox({ port: PORT, label: 'store-contract' })
  await sandbox.stop()
  const dataDir = path.join(sandbox.dir, 'data')
  fs.mkdirSync(dataDir, { recursive: true })
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dataDir, name), typeof content === 'string' ? content : JSON.stringify(content))
  }
  const log = fs.openSync(path.join(sandbox.dir, 'server.log'), 'a')
  const child = spawn(process.execPath, ['server/index.mjs'], {
    cwd: sandbox.dir,
    env: { ...process.env, CODEX_HOME: path.join(sandbox.dir, 'codex-home') },
    stdio: ['ignore', log, log],
  })
  const base = sandbox.base
  let up = false
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null) break
    try {
      const response = await fetch(`${base}/api/health`)
      if (response.ok) { up = true; break }
    } catch {}
    await sleep(100)
  }
  const login = up ? await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: sandbox.code }) }) : null
  const cookie = login?.headers.get('set-cookie')?.split(';')[0] || ''
  const api = async (url, options = {}) => {
    const response = await fetch(base + url, { ...options, headers: { Cookie: cookie, 'Content-Type': 'application/json', ...options.headers } })
    const text = await response.text()
    let body
    try { body = JSON.parse(text) } catch { body = text }
    return { status: response.status, body }
  }
  return {
    dir: sandbox.dir,
    base,
    api,
    up,
    pid: child.pid,
    child,
    quarantines: () => fs.readdirSync(dataDir).filter((name) => name.includes('.corrupt-')),
    readData: (name) => fs.readFileSync(path.join(dataDir, name), 'utf8'),
    async stop() {
      child.kill('SIGTERM')
      await sleep(250)
      if (child.exitCode === null) child.kill('SIGKILL')
      fs.closeSync(log)
    },
  }
}

const validConv = (id, title) => ({
  id,
  owner: 'single-user-owner',
  title,
  engine: 'dsr',
  permission: 'workspace-write',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  messages: [{ id: `m_${id}`, role: 'user', text: 'hello', createdAt: Date.now() }],
})

const cases = [
  {
    name: 'null conversation record',
    files: { 'conversations.json': { version: 1, conversations: [null, validConv('ok-1', 'OK conversation')] } },
    check: async (server) => {
      const list = await server.api('/api/conversations')
      return {
        ok: server.up && list.status === 200 && list.body.conversations.some((conv) => conv.id === 'ok-1'),
        detail: `up=${server.up} status=${list.status} n=${list.body.conversations?.length}`,
      }
    },
  },
  {
    name: 'conversations is not an array',
    files: { 'conversations.json': { version: 1, conversations: { broken: true } } },
    check: async (server) => {
      const list = await server.api('/api/conversations')
      const saved = server.quarantines().some((name) => name.startsWith('conversations.json.corrupt-'))
      const original = saved && server.readData(server.quarantines().find((name) => name.startsWith('conversations.json.corrupt-')))
      return {
        ok: server.up && list.status === 200 && saved && original.includes('"broken":true'),
        detail: `up=${server.up} status=${list.status} quarantine=${saved} originalKept=${original?.includes('broken')}`,
      }
    },
  },
  {
    name: 'conversation without messages',
    files: { 'conversations.json': { version: 1, conversations: [{ id: 'no-msgs', owner: 'single-user-owner', title: 'No messages', engine: 'dsr' }, validConv('ok-2', 'Second')] } },
    check: async (server) => {
      const list = await server.api('/api/conversations')
      const search = await server.api('/api/conversations?q=Second')
      return {
        ok: server.up && list.status === 200 && list.body.conversations.length === 2 && search.status === 200,
        detail: `status=${list.status} n=${list.body.conversations?.length} search=${search.status}`,
      }
    },
  },
  {
    name: 'truncated conversations.json',
    files: { 'conversations.json': '{"version":1,"conversations":[{"id":"cut' },
    check: async (server) => {
      const list = await server.api('/api/conversations')
      const saved = server.quarantines().some((name) => name.startsWith('conversations.json.corrupt-'))
      return { ok: server.up && list.status === 200 && saved, detail: `up=${server.up} status=${list.status} quarantine=${saved}` }
    },
  },
  {
    name: 'null project record',
    files: {
      'conversations.json': { version: 1, conversations: [] },
      'projects.json': { version: 1, projects: [null, { id: 'p_abcdef123456', name: 'Keep me', createdAt: Date.now(), updatedAt: Date.now() }] },
    },
    check: async (server) => {
      const list = await server.api('/api/projects')
      const saved = server.quarantines().some((name) => name.startsWith('projects.json.corrupt-'))
      return {
        ok: server.up && list.status === 200 && list.body.projects.length === 1 && saved,
        detail: `status=${list.status} n=${list.body.projects?.length} quarantine=${saved}`,
      }
    },
  },
  {
    name: 'null share record',
    files: {
      'conversations.json': { version: 1, conversations: [] },
      'shares.json': { version: 1, shares: [null, { id: 's_1', tokenHash: 'x', owner: 'single-user-owner', conversationId: 'c1', createdAt: Date.now() }] },
    },
    check: async (server) => {
      const list = await server.api('/api/shares')
      const saved = server.quarantines().some((name) => name.startsWith('shares.json.corrupt-'))
      return {
        ok: server.up && list.status === 200 && list.body.shares.length === 1 && saved,
        detail: `status=${list.status} n=${list.body.shares?.length} quarantine=${saved}`,
      }
    },
  },
  {
    name: 'memory import does not evict existing memories',
    files: {
      'conversations.json': { version: 1, conversations: [] },
      'memory.json': {
        version: 1,
        settings: { enabled: true, autoCapture: true },
        items: Array.from({ length: 200 }, (_, index) => ({
          id: `mem_old_${index}`,
          owner: 'single-user-owner',
          text: `OLD-FACT-${index} 这是一条旧记忆`,
          source: 'manual',
          createdAt: Date.now() - index * 1000,
          updatedAt: Date.now() - index * 1000,
        })),
      },
    },
    check: async (server) => {
      const before = await server.api('/api/memory')
      const imported = await server.api('/api/backup/import', {
        method: 'POST',
        body: JSON.stringify({ conversations: [], memory: { items: [{ text: 'NEW-FACT-A 新记忆内容' }, { text: 'NEW-FACT-B 另一条新记忆' }] } }),
      })
      const after = await server.api('/api/memory')
      const texts = (after.body.items || []).map((item) => item.text).join('\n')
      return {
        ok: before.body.items?.length === 200 && texts.includes('OLD-FACT-0') && imported.body.memories?.imported === 0,
        detail: JSON.stringify({ before: before.body.items?.length, import: imported.body.memories, old0: texts.includes('OLD-FACT-0') }),
      }
    },
  },
]

for (const testCase of cases) {
  let server
  try {
    server = await bootWith(testCase.files)
    const outcome = await testCase.check(server)
    record(testCase.name, outcome.ok, outcome.detail)
  } catch (error) {
    record(testCase.name, false, String(error.message).slice(0, 160))
  } finally {
    await server?.stop().catch(() => {})
  }
}

const failed = results.filter((item) => !item.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
try {
  fs.mkdirSync(path.join(ROOT, 'reports/ai-optimization'), { recursive: true })
  fs.writeFileSync(path.join(ROOT, 'reports/ai-optimization/store-contract.json'), JSON.stringify(results, null, 2))
} catch {}
if (failed.length) process.exitCode = 1
