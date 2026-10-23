import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { createHash, randomUUID } from 'node:crypto'
import net from 'node:net'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const require = createRequire(import.meta.url)
const runtimeModules = process.env.QA_NODE_MODULES || '/Users/liupengbin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'
export const { chromium } = require(path.join(runtimeModules, 'playwright'))
export const CHROME = process.env.QA_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// A full source copy with fresh storage prevents tests from reading or mutating
// the user's conversations, workspaces, auth token, or model credentials.
export async function createSandbox({ port = 8797, label = 'baseline', seedConversations = [], appBinary = '', singleUser = true } = {}) {
  // Refuse occupied ports before any API call: accidentally connecting to a
  // different QA server would invalidate fixture ownership and the evidence.
  await new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.once('error', error => reject(new Error(`QA port ${port} is unavailable (${error.code}); choose a dedicated QA_PORT`)))
    probe.listen({ host: '127.0.0.1', port, exclusive: true }, () => probe.close(resolve))
  })
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `dsh-quality-${label}-`))
  const sourceRoot = process.env.QA_SOURCE_ROOT || ROOT
  fs.cpSync(path.join(sourceRoot, 'server'), path.join(dir, 'server'), { recursive: true })
  fs.cpSync(path.join(sourceRoot, 'public'), path.join(dir, 'public'), { recursive: true })
  const sourceFiles = {}
  for (const relative of ['server/index.mjs', 'server/store.mjs', 'public/index.html', 'public/js/app.js', 'public/js/codex.js']) {
    sourceFiles[relative] = createHash('sha256').update(fs.readFileSync(path.join(dir, relative))).digest('hex')
  }
  fs.mkdirSync(path.join(dir, 'codex-home'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'dsh-home'), { recursive: true })
  if (seedConversations.length) {
    fs.mkdirSync(path.join(dir, 'data'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'data/conversations.json'), JSON.stringify({ version: 1, conversations: seedConversations.map(input => {
      const id = input.id || randomUUID()
      return { id, title: 'QA seeded conversation', owner: 'single-user-owner', engine: 'dsr', permission: 'workspace-write', createdAt: Date.now(), updatedAt: Date.now(), ...input, workspace: path.join(dir, 'data/workspaces', id), messages: (input.messages || []).map(message => ({ id: `m_${randomUUID()}`, createdAt: Date.now(), status: 'done', ...message })) }
    }) }), { mode: 0o600 })
  }
  const code = 'QUALITY-LOCAL-ONLY'
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ host: '127.0.0.1', port, accessCode: code, title: 'DSH Quality Lab', singleUser, nativeEnabled: false, codexPrewarm: false, dshHome: path.join(dir, 'dsh-home'), ...(appBinary ? { appBinary } : {}) }), { mode: 0o600 })
  const log = fs.openSync(path.join(dir, 'server.log'), 'a')
  const child = spawn(process.execPath, ['server/index.mjs'], { cwd: dir, env: { ...process.env, CODEX_HOME: path.join(dir, 'codex-home') }, stdio: ['ignore', log, log] })
  const base = `http://127.0.0.1:${port}`
  await sleep(150)
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(`sandbox server exited: ${child.exitCode}`)
    try { const r = await fetch(`${base}/`); if (r.ok) break } catch {}
    await sleep(100)
  }
  const login = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) })
  const cookie = login.headers.get('set-cookie').split(';')[0]
  const api = async (url, options = {}) => {
    const response = await fetch(base + url, { ...options, headers: { Cookie: cookie, 'Content-Type': 'application/json', ...options.headers } })
    const text = await response.text()
    let body; try { body = JSON.parse(text) } catch { body = text }
    return { status: response.status, body, headers: response.headers }
  }
  return { dir, base, code, cookie, api, child, sourceFiles, async stop() { child.kill('SIGTERM'); await sleep(300); fs.closeSync(log) } }
}

export async function launchBrowser() {
  return chromium.launch({ executablePath: CHROME, headless: true })
}

export async function loginPage(page, sandbox) {
  await page.goto(sandbox.base)
  await page.locator('#loginView').waitFor({ state: 'visible' })
  await page.locator('#accessCode').fill(sandbox.code)
  await page.locator('#loginBtn').click()
  await page.locator('#shell').waitFor({ state: 'visible' })
  await page.waitForTimeout(350)
}
