import http from 'node:http'
import https from 'node:https'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'
import os from 'node:os'
import zlib from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'
import {
  ACCESS_CODE,
  AUTH_ENABLED,
  PUBLIC_DIR,
  SECRET,
  MODEL,
  NATIVE_ENABLED,
  NATIVE_WORKSPACE_TITLE,
  SHARED_WORKSPACE,
  DATA_DIR,
  config,
  saveConfig,
} from './config.mjs'
import { writeHeadlessPatch } from './profile.mjs'
import { ConversationStore } from './store.mjs'
import { ProjectStore } from './project-store.mjs'
import { ShareStore } from './share-store.mjs'
import { LibraryStore } from './library-store.mjs'
import { AuditLog } from './audit.mjs'
import { MemoryStore } from './memory-store.mjs'
import { startDshRun } from './dsh.mjs'
import { nativeBridge } from './native.mjs'
import { codexBridge, effortLabel } from './codex-bridge.mjs'
import { codexAvailable, ensureCodexHttpProvider, readCodexDefaults } from './codex.mjs'
import { Notifier } from './notify.mjs'

const VERSION = '5.0.0'
const SERVER_EPOCH = Date.now()
const AUTH_COOKIE = 'dsh_access'
const CLIENT_COOKIE = 'dsh_cid'
const AUTH_EPOCH_PATH = path.join(DATA_DIR, 'auth-epoch')
function readAuthEpoch() {
  try {
    const value = Number(fs.readFileSync(AUTH_EPOCH_PATH, 'utf8').trim())
    return Number.isFinite(value) && value >= 0 ? value : 0
  } catch {
    return 0
  }
}
let authEpoch = readAuthEpoch()
function authToken() {
  return crypto.createHmac('sha256', SECRET).update(`${ACCESS_CODE}:${authEpoch}`).digest('hex')
}
function bumpAuthEpoch() {
  authEpoch += 1
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.writeFileSync(AUTH_EPOCH_PATH, String(authEpoch), { mode: 0o600 })
  } catch (error) {
    console.error('[auth] 写入会话纪元失败:', error.message)
  }
}
const MAX_BODY = 64 * 1024
const MAX_UPLOAD = 25 * 1024 * 1024
const MAX_PROMPT = 24_000
const MAX_PARALLEL_RUNS = 4
const MAX_RUNS_PER_MINUTE = 12
const MAX_ATTACHMENTS = 5
const STATIC_CACHE = new Map()
const chatRate = new Map()
const idempotency = new Map()
const shareViewRate = new Map()
const shareFailures = new Map()
const startingRuns = new Set()

const DEFAULT_PERMISSION = 'workspace-write'
const PERMISSION_ALIASES = {
  standard: 'workspace-write',
  ask: 'workspace-write',
  default: 'workspace-write',
  readonly: 'read-only',
  full: 'danger-full-access',
  'full-access': 'danger-full-access',
  fullaccess: 'danger-full-access',
  never: 'danger-full-access',
}
const FALLBACK_PERMISSIONS = [
  {
    value: 'read-only',
    name: '只读',
    description: '可以读取和搜索，但不能写入文件或执行修改。',
  },
  {
    value: 'workspace-write',
    name: '标准',
    description: '仅允许在工作区内写入，敏感操作会先征求你的同意。',
  },
  {
    value: 'danger-full-access',
    name: '完全权限',
    description: '不受工作区限制，不再弹出授权确认，Agent 可直接执行任意操作。',
  },
]

const SINGLE_USER = config.singleUser !== false
const SHARED_OWNER = 'single-user-owner'
const store = new ConversationStore()
const projects = new ProjectStore()
const shares = new ShareStore()
const library = new LibraryStore()
const requestContext = new AsyncLocalStorage()
const audit = new AuditLog(() => requestContext.getStore())
store.onPurge = (conv) => {
  const revoked = shares.revokeAllForConversation(conv.id)
  const removedBookmarks = library.removeConversation(conv.owner, conv.id)
  const removedMemories = memory.removeConversation(conv.owner, conv.id)
  if (revoked) audit.add('share.revoke', `对话永久删除，撤销 ${revoked} 个分享`, { conversationId: conv.id })
  if (removedBookmarks || removedMemories) {
    audit.add('conversation.cleanup', `清理收藏 ${removedBookmarks} 条、记忆 ${removedMemories} 条`, { conversationId: conv.id })
  }
}

// A deleted conversation stays in the trash for 30 days, but its public
// links must die with the 8-second undo window.
const shareRevokeTimers = new Map()
function scheduleShareRevoke(conversationId, delay = 8500) {
  const existing = shareRevokeTimers.get(conversationId)
  if (existing) clearTimeout(existing)
  const timer = setTimeout(() => {
    shareRevokeTimers.delete(conversationId)
    const conv = store.get(conversationId)
    if (!conv?.deletedAt) return
    const revoked = shares.revokeAllForConversation(conversationId)
    if (revoked) audit.add('share.revoke', `对话进入最近删除，撤销 ${revoked} 个分享`, { conversationId })
  }, delay)
  if (timer.unref) timer.unref()
  shareRevokeTimers.set(conversationId, timer)
}

function cancelShareRevoke(conversationId) {
  const timer = shareRevokeTimers.get(conversationId)
  if (timer) clearTimeout(timer)
  shareRevokeTimers.delete(conversationId)
}

for (const conv of store.data.conversations) {
  if (!conv.deletedAt) continue
  const age = Date.now() - conv.deletedAt
  if (age >= 8500) {
    shares.revokeAllForConversation(conv.id)
  } else {
    scheduleShareRevoke(conv.id, 8500 - age)
  }
}
const memory = new MemoryStore()
const notifier = new Notifier({
  settings: config.notify,
  log: (message) => console.error(`[notify] ${message}`),
})
if (SINGLE_USER) {
  store.setOwner(SHARED_OWNER)
  void store.flush()
}
const patchInfo = writeHeadlessPatch()
const activeRuns = new Map()
const authFailures = new Map()
// requestId -> { run, kind }，用于在重新打开网页并回放事件时跳过已经处理过的卡片。
const pendingInteractions = new Map()
let permissionCatalogCache = { at: 0, value: null }

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
}

/* ── helpers ─────────────────────────────────────────────────────────── */

function parseCookies(req) {
  const header = req.headers.cookie
  const out = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index < 0) continue
    const key = part.slice(0, index).trim()
    const value = part.slice(index + 1).trim()
    if (key) {
      try { out[key] = decodeURIComponent(value) } catch { /* Ignore only this malformed cookie. */ }
    }
  }
  return out
}

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a))
  const bufB = Buffer.from(String(b))
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

function isAuthed(req) {
  if (!AUTH_ENABLED) return true
  const cookies = parseCookies(req)
  return timingSafeEqual(cookies[AUTH_COOKIE] || '', authToken())
}

function clientId(req, res) {
  const cookies = parseCookies(req)
  let id = cookies[CLIENT_COOKIE]
  if (!id || !/^[a-f0-9]{32}$/.test(id)) {
    id = crypto.randomBytes(16).toString('hex')
    res.appendHeader(
      'Set-Cookie',
      `${CLIENT_COOKIE}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`,
    )
  }
  return id
}

const ownerOf = (cid) => crypto.createHash('sha256').update(`owner:${SECRET}:${cid}`).digest('hex').slice(0, 40)

function sendJson(res, status, payload) {
  const raw = Buffer.from(JSON.stringify(payload))
  const accepts = /\bgzip\b/i.test(String(res.req?.headers['accept-encoding'] || ''))
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    Vary: 'Accept-Encoding',
  }
  if (!accepts || raw.length <= 1024) {
    res.writeHead(status, { ...headers, 'Content-Length': raw.length })
    res.end(raw)
    return
  }
  // Compress off the request path: a multi-megabyte conversation JSON was
  // blocking every other request while gzipSync ran.
  zlib.gzip(raw, { level: 6 }, (error, body) => {
    if (error || res.destroyed) {
      res.writeHead(status, { ...headers, 'Content-Length': raw.length })
      res.end(raw)
      return
    }
    res.writeHead(status, { ...headers, 'Content-Length': body.length, 'Content-Encoding': 'gzip' })
    res.end(body)
  })
}

async function readJsonBody(req, maxBytes = MAX_BODY) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    total += chunk.length
    if (total > maxBytes) throw Object.assign(new Error('请求体过大'), { status: 413 })
    chunks.push(chunk)
  }
  if (!chunks.length) return {}
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error('JSON body must be an object')
    }
    return body
  } catch {
    throw Object.assign(new Error('请求体必须是合法的 JSON 对象'), { status: 400 })
  }
}

function isSecureRequest(req) {
  return Boolean(req?.socket?.encrypted) || String(req?.headers?.['x-forwarded-proto'] || '').toLowerCase() === 'https'
}

function securityHeaders(res) {
  if (res.req && isSecureRequest(res.req)) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000')
  }
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  )
}

function publicBaseUrl(req = null) {
  const configured = String(config.publicBaseUrl || config.notify?.baseUrl || '').trim().replace(/\/+$/, '')
  if (configured) return configured
  const scheme = tlsOptions ? 'https' : 'http'
  const host = String(req?.headers?.host || '').trim()
  if (host && !/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host)) return `${scheme}://${host}`
  // A localhost-bound server is not reachable via a LAN address. Only fall
  // back to the LAN IP when the server actually listens on all interfaces.
  const bind = String(config.host || '').trim()
  if (bind && bind !== '0.0.0.0' && bind !== '::') return `${scheme}://127.0.0.1:${config.port}`
  const lan = lanAddresses()[0]
  return `${scheme}://${lan || '127.0.0.1'}:${config.port}`
}

function lanAddresses() {
  const out = []
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) out.push(entry.address)
    }
  }
  return out
}

/* Public base URL used in notification deep links. Falls back to the first
 * LAN address so a phone on the same Wi-Fi can open the conversation. */
function notifyBaseUrl() {
  const configured = String(config.notify?.baseUrl || '').trim()
  if (configured) return configured.replace(/\/+$/, '')
  const host = lanAddresses()[0] || '127.0.0.1'
  return `http://${host}:${config.port}`
}

function conversationUrl(id) {
  return id ? `${notifyBaseUrl()}/c/${encodeURIComponent(id)}` : notifyBaseUrl()
}

/* ── static files ────────────────────────────────────────────────────── */

const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.mjs', '.svg', '.json', '.txt', '.map'])
const CSS_BUNDLE_FILES = [
  'css/style.css',
  'css/glass.css',
  'css/apple.css',
  'css/apple-pro.css',
  'css/ux.css',
  'css/refine.css',
  'css/visual.css',
  'css/memory.css',
  'css/projects.css',
]
let cssBundleCache = { key: '', raw: null, gzip: null, etag: '' }

function serveCssBundle(req, res) {
  let key = ''
  try {
    for (const rel of CSS_BUNDLE_FILES) {
      const stat = fs.statSync(path.join(PUBLIC_DIR, rel))
      key += `${rel}:${stat.size}:${stat.mtimeMs};`
    }
    // Validate metadata on every request, but only read/compress on a miss.
    // Conditional 304 responses therefore perform no content reads either.
    if (cssBundleCache.key !== key) {
      const chunks = CSS_BUNDLE_FILES.map((rel) => fs.readFileSync(path.join(PUBLIC_DIR, rel)))
      const raw = Buffer.concat(chunks.flatMap((chunk) => [chunk, Buffer.from('\n')]))
      cssBundleCache = {
        key,
        raw,
        gzip: zlib.gzipSync(raw, { level: 6 }),
        etag: `"bundle-${crypto.createHash('sha1').update(key).digest('hex').slice(0, 12)}"`,
      }
    }
  } catch (error) {
    return sendJson(res, 500, { error: `样式打包失败：${error.message}` })
  }
  const { raw, gzip, etag } = cssBundleCache
  const versioned = /[?&]v=[^&]+/.test(req.url || '')
  const cacheControl = versioned ? 'public, max-age=31536000, immutable' : 'no-cache'
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { ETag: etag, 'Cache-Control': cacheControl })
    return res.end()
  }
  const accepts = /\bgzip\b/i.test(String(req.headers['accept-encoding'] || ''))
  const body = accepts ? gzip : raw
  res.writeHead(200, {
    'Content-Type': 'text/css; charset=utf-8',
    'Content-Length': body.length,
    ETag: etag,
    'Cache-Control': cacheControl,
    Vary: 'Accept-Encoding',
    ...(accepts ? { 'Content-Encoding': 'gzip' } : {}),
  })
  if (req.method === 'HEAD') return res.end()
  res.end(body)
}

function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname
  try {
    rel = decodeURIComponent(rel)
  } catch {
    return sendJson(res, 400, { error: '非法路径' })
  }
  const resolved = path.resolve(PUBLIC_DIR, '.' + rel)
  if (!resolved.startsWith(path.resolve(PUBLIC_DIR) + path.sep)) {
    return sendJson(res, 403, { error: '禁止访问' })
  }
  let stat
  try {
    stat = fs.statSync(resolved)
  } catch {
    return sendJson(res, 404, { error: '页面不存在' })
  }
  if (!stat.isFile()) return sendJson(res, 404, { error: '页面不存在' })
  const ext = path.extname(resolved).toLowerCase()
  const type = CONTENT_TYPES[ext] || 'application/octet-stream'
  const etag = `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`
  const versioned = /[?&]v=[^&]+/.test(req.url || '')
  const cacheControl =
    ext === '.html' ? 'no-store' : versioned ? 'public, max-age=31536000, immutable' : 'no-cache'

  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { ETag: etag, 'Cache-Control': cacheControl })
    return res.end()
  }

  const accepts = /\bgzip\b/i.test(String(req.headers['accept-encoding'] || ''))
  const canCompress = accepts && COMPRESSIBLE.has(ext) && stat.size > 512 && stat.size < 8 * 1024 * 1024
  const key = `${resolved}:${etag}`
  let body = null
  if (canCompress) {
    const cached = STATIC_CACHE.get(key)
    if (cached) body = cached
    else {
      try {
        body = zlib.gzipSync(fs.readFileSync(resolved), { level: 6 })
        if (STATIC_CACHE.size > 80) STATIC_CACHE.clear()
        STATIC_CACHE.set(key, body)
      } catch {
        body = null
      }
    }
  }

  const headers = {
    'Content-Type': type,
    ETag: etag,
    'Cache-Control': cacheControl,
    Vary: 'Accept-Encoding',
    'Content-Length': body ? body.length : stat.size,
  }
  if (body) headers['Content-Encoding'] = 'gzip'
  res.writeHead(200, headers)
  if (req.method === 'HEAD') return res.end()
  if (body) return res.end(body)
  fs.createReadStream(resolved).pipe(res)
}

/* ── conversations ───────────────────────────────────────────────────── */

function normalizePermission(value) {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : ''
  const normalized = PERMISSION_ALIASES[raw] || raw
  if (normalized === 'read-only' || normalized === 'workspace-write' || normalized === 'danger-full-access') {
    return normalized
  }
  return DEFAULT_PERMISSION
}

const CODEX_DEFAULTS = readCodexDefaults()

function safeCodexId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9._-]{1,96}$/.test(value) ? value : ''
}

function codexCatalog() {
  return codexBridge.currentModels()
}

function resolveCodexSelection(conv = {}) {
  const catalog = codexCatalog()
  const models = Array.isArray(catalog.models) ? catalog.models : []
  const preferred = safeCodexId(conv.codexModel) || safeCodexId(catalog.defaultModel) || safeCodexId(CODEX_DEFAULTS.model)
  const entry = models.find((model) => model.id === preferred) || models[0] || null
  const model = entry?.id || preferred || CODEX_DEFAULTS.model || 'gpt-6.1-sol'
  let effort = safeCodexId(conv.codexEffort) || safeCodexId(entry?.defaultEffort) || safeCodexId(CODEX_DEFAULTS.effort) || 'medium'
  if (entry?.efforts?.length && !entry.efforts.some((item) => item.value === effort)) {
    effort = entry.defaultEffort || entry.efforts[0].value
  }
  return {
    model,
    effort,
    modelName: entry?.name || model,
    effortName: effortLabel(effort),
    entry,
    catalog,
  }
}

function codexDeepLink(threadId) {
  const id = safeCodexId(threadId)
  return id ? `codex://threads/${id}` : null
}

function permissionOrder(value) {
  return { 'read-only': 0, 'workspace-write': 1, 'danger-full-access': 2, auto: 3 }[value] ?? 9
}

async function permissionCatalog() {
  if (Date.now() - permissionCatalogCache.at > 30_000) {
    let remote = null
    if (NATIVE_ENABLED) {
      try {
        remote = await nativeBridge.permissionCatalog()
      } catch {}
    }
    permissionCatalogCache = { at: Date.now(), value: remote }
  }
  const merged = new Map(FALLBACK_PERMISSIONS.map((option) => [option.value, option]))
  const remoteOptions = Array.isArray(permissionCatalogCache.value?.options)
    ? permissionCatalogCache.value.options
    : []
  for (const option of remoteOptions) {
    if (!option || typeof option.value !== 'string' || !option.value) continue
    const value = option.value
    if (!['read-only', 'workspace-write', 'danger-full-access', 'auto'].includes(value)) continue
    const known = merged.get(value)
    merged.set(value, {
      value,
      name: known?.name || option.name || value,
      description: known?.description || option.description || '',
    })
  }
  const remoteDefault = permissionCatalogCache.value?.defaultPreset
  const defaultPermission = ['read-only', 'workspace-write', 'danger-full-access'].includes(remoteDefault)
    ? remoteDefault
    : DEFAULT_PERMISSION
  return {
    default: defaultPermission,
    options: [...merged.values()].sort((a, b) => permissionOrder(a.value) - permissionOrder(b.value)),
  }
}

function convSummary(conv) {
  const engine = conv.engine === 'codex' ? 'codex' : 'dsr'
  const selection = engine === 'codex' ? resolveCodexSelection(conv) : null
  return {
    id: conv.id,
    title: conv.title,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
    dshSessionId: conv.dshSessionId,
    codexThreadId: conv.codexThreadId || null,
    codexModel: selection?.model || null,
    codexModelName: selection?.modelName || null,
    codexEffort: selection?.effort || null,
    codexEffortName: selection?.effortName || null,
    codexDeepLink: codexDeepLink(conv.codexThreadId),
    engine,
    permission: normalizePermission(conv.permission),
    pinned: Boolean(conv.pinned),
    archived: Boolean(conv.archivedAt),
    projectId: conv.projectId || null,
    noMemory: Boolean(conv.noMemory),
    forkedFrom: conv.forkedFrom || null,
    running: activeRuns.has(conv.id),
  }
}

function projectSummary(project, counts) {
  return {
    ...project,
    conversationCount: counts?.count || 0,
    lastActiveAt: counts?.lastActiveAt || project.updatedAt || 0,
    fileCount: projects.listFiles(project.id).length,
  }
}

function projectsPayload(owner) {
  const { counts, unfiled, total } = store.projectCounts(owner)
  const list = projects.list().map((project) => projectSummary(project, counts.get(project.id)))
  return {
    projects: list,
    counts: { total, unfiled, filed: total - unfiled, projects: list.filter((project) => !project.archivedAt).length, archived: list.filter((project) => project.archivedAt).length },
  }
}

function ownedProject(id, res) {
  const project = projects.get(id)
  if (!project || project.deletedAt) {
    sendJson(res, 404, { error: '项目不存在' })
    return null
  }
  return project
}

function clampPayloadText(value, max = 4000) {
  if (typeof value !== 'string') return value
  if (value.length <= max) return value
  return `${value.slice(0, max)}\n…（为加快首屏已截断，完整内容可单独加载）`
}

function limitedMessagePayload(messages) {
  const clampBlock = (block) => {
    if (!block || typeof block !== 'object') return block
    if (block.type === 'text') return block
    if (block.type === 'thinking') {
      if (!block.text || block.text.length <= 12_000) return block
      return { ...block, text: clampPayloadText(block.text, 12_000), textTruncated: true }
    }
    if (block.type !== 'tool') return block
    const next = { ...block }
    if (typeof block.result === 'string' && block.result.length > 4000) {
      next.result = clampPayloadText(block.result, 4000)
      next.resultTruncated = true
      next.resultLength = block.result.length
    }
    try {
      const serializedInput = JSON.stringify(block.input ?? null)
      if (serializedInput && serializedInput.length > 4000) {
        next.input = { _truncated: true, preview: serializedInput.slice(0, 4000) }
        next.inputTruncated = true
      }
    } catch {}
    return next
  }
  return messages.map((msg) => ({
    ...msg,
    ...(msg.thinking ? { thinking: clampPayloadText(msg.thinking, 12_000) } : {}),
    ...(Array.isArray(msg.blocks) ? { blocks: msg.blocks.map(clampBlock) } : {}),
    ...(Array.isArray(msg.versions)
      ? {
          versions: msg.versions.map((version) => ({
            ...version,
            text: clampPayloadText(version.text || '', 4000),
            ...(Array.isArray(version.blocks) ? { blocks: version.blocks.map(clampBlock) } : {}),
          })),
        }
      : {}),
  }))
}

function ownedConversation(id, res, owner) {
  const conv = store.get(id)
  if (!conv || conv.owner !== owner || conv.deletedAt) {
    sendJson(res, 404, { error: '会话不存在' })
    return null
  }
  return conv
}

function messageId() {
  return 'm_' + crypto.randomBytes(8).toString('hex')
}

function markInteractionResolved(requestId, { broadcast = true } = {}) {
  const entry = pendingInteractions.get(requestId)
  if (!entry) return
  pendingInteractions.delete(requestId)
  entry.run.resolved.add(requestId)
  if (broadcast) {
    entry.run.send({
      t: entry.kind === 'question' ? 'question_resolved' : 'approval_resolved',
      requestId,
    })
  }
}

/* ── chat streaming ──────────────────────────────────────────────────── */

function buildBlocks() {
  const blocks = []
  return {
    blocks,
    text() {
      return blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n\n')
    },
    thinking() {
      return blocks.filter((b) => b.type === 'thinking').map((b) => b.text).join('\n\n')
    },
    appendThinking(text) {
      const last = blocks.at(-1)
      if (last && last.type === 'thinking') last.text += (last.text ? '\n\n' : '') + text
      else blocks.push({ type: 'thinking', text })
    },
    appendText(text) {
      const last = blocks.at(-1)
      if (last && last.type === 'text') last.text += (last.text ? '\n' : '') + text
      else blocks.push({ type: 'text', text })
    },
    toolCall(call) {
      blocks.push({ type: 'tool', ...call })
    },
    toolResult(callId, status, result) {
      const block = blocks.find((b) => b.type === 'tool' && b.id === callId)
      if (block) {
        block.status = status || 'completed'
        block.result = result
      } else {
        blocks.push({
          type: 'tool',
          id: callId,
          tool: 'tool',
          input: null,
          status: status || 'completed',
          result,
        })
      }
    },
  }
}

function toolSummary(tool, input) {
  if (!input || typeof input !== 'object') return ''
  const keys = ['description', 'command', 'file_path', 'path', 'pattern', 'query', 'url', 'prompt']
  for (const key of keys) {
    if (typeof input[key] === 'string' && input[key].trim()) return input[key].trim()
  }
  return ''
}

/* ── workspace files ─────────────────────────────────────────────────── */

const FILE_SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  '.cache',
  '__pycache__',
  '.venv',
  'venv',
  '.pnpm-store',
])

const IMAGE_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
}

const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.json', '.jsonl', '.csv', '.tsv', '.log',
  '.py', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx',
  '.css', '.scss', '.less', '.yaml', '.yml', '.toml', '.sh', '.bash', '.zsh',
  '.sql', '.xml', '.ini', '.cfg', '.conf', '.go', '.rs', '.java', '.kt',
  '.c', '.h', '.cpp', '.hpp', '.rb', '.php', '.swift', '.vue', '.svelte',
  '.dockerfile', '.env', '.gitignore', '.lock',
])

function fileKind(name) {
  const ext = path.extname(name).toLowerCase()
  if (IMAGE_TYPES[ext]) return 'image'
  if (ext === '.pdf') return 'pdf'
  if (TEXT_EXTENSIONS.has(ext)) return 'text'
  return 'other'
}

function scanWorkspace(root, options = {}) {
  const maxFiles = options.maxFiles ?? 400
  const maxDepth = options.maxDepth ?? 6
  const out = []
  if (!root) return out
  let exists = true
  try {
    if (!fs.statSync(root).isDirectory()) exists = false
  } catch {
    exists = false
  }
  if (!exists) return out

  const walk = (directory, depth, prefix) => {
    if (out.length >= maxFiles || depth > maxDepth) return
    let entries
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (out.length >= maxFiles) break
      if (entry.name.startsWith('.')) continue
      const absolute = path.join(directory, entry.name)
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        if (!FILE_SKIP_DIRS.has(entry.name)) walk(absolute, depth + 1, relative)
        continue
      }
      if (!entry.isFile()) continue
      let stat
      try {
        stat = fs.statSync(absolute)
      } catch {
        continue
      }
      out.push({
        path: relative,
        name: entry.name,
        size: stat.size,
        mtime: stat.mtimeMs,
        kind: fileKind(entry.name),
      })
    }
  }
  walk(root, 0, '')
  out.sort((left, right) => right.mtime - left.mtime)
  return out
}

function snapshotWorkspace(root) {
  const snapshot = new Map()
  for (const file of scanWorkspace(root, { maxFiles: 2000, maxDepth: 8 })) {
    snapshot.set(file.path, `${file.size}:${Math.round(file.mtime)}`)
  }
  return snapshot
}

function conversationRoot(conv) {
  const root = conv.mode === 'native' ? conv.nativeCwd : conv.workspace
  if (!root) return null
  try {
    if (!fs.statSync(root).isDirectory()) return null
  } catch {
    return null
  }
  return root
}

function resolveWorkspaceFile(root, relative) {
  if (typeof relative !== 'string' || !relative || relative.includes(String.fromCharCode(0))) {
    throw new Error('文件路径无效')
  }
  if (path.isAbsolute(relative) || /^[a-zA-Z]:/.test(relative)) throw new Error('文件路径无效')
  const realRoot = fs.realpathSync(root)
  const absolute = path.resolve(realRoot, relative)
  if (absolute !== realRoot && !absolute.startsWith(realRoot + path.sep)) {
    throw new Error('文件不在对话工作区内')
  }
  const real = fs.realpathSync(absolute)
  if (!real.startsWith(realRoot + path.sep)) throw new Error('文件不在对话工作区内')
  const stat = fs.statSync(real)
  if (!stat.isFile()) throw new Error('不是文件')
  return { absolute: real, relative: path.relative(realRoot, real), stat }
}

function collectTurnFiles(root, before, touched) {
  if (!root) return []
  const after = scanWorkspace(root, { maxFiles: 2000, maxDepth: 8 })
  const changed = new Map()
  for (const file of after) {
    const previous = before.get(file.path)
    if (previous === undefined || previous !== `${file.size}:${Math.round(file.mtime)}`) {
      changed.set(file.path, file)
    }
  }
  for (const relative of touched) {
    if (changed.has(relative)) continue
    try {
      const stat = fs.statSync(path.join(root, relative))
      if (!stat.isFile()) continue
      changed.set(relative, {
        path: relative,
        name: path.basename(relative),
        size: stat.size,
        mtime: stat.mtimeMs,
        kind: fileKind(relative),
      })
    } catch {}
  }
  return [...changed.values()].sort((left, right) => right.mtime - left.mtime).slice(0, 40)
}


async function ensureUploadWorkspace(conv) {
  if (conv.engine === 'codex') {
    conv.mode = 'codex'
    conv.workspace = path.join(SHARED_WORKSPACE, 'chats', conv.id)
    fs.mkdirSync(conv.workspace, { recursive: true })
    store.touch(conv)
    return conv.workspace
  }
  if (!conv.mode) {
    const available = NATIVE_ENABLED ? await nativeBridge.available() : false
    conv.mode = available ? 'native' : 'headless'
  }
  if (conv.mode === 'native') {
    conv.nativeCwd = conv.nativeCwd || path.join(SHARED_WORKSPACE, 'chats', conv.id)
    conv.workspace = conv.nativeCwd
    fs.mkdirSync(conv.nativeCwd, { recursive: true })
  } else {
    conv.workspace = conv.workspace || path.join(WORKSPACE_ROOT, conv.id)
    fs.mkdirSync(conv.workspace, { recursive: true })
  }
  store.touch(conv)
  return conv.mode === 'native' ? conv.nativeCwd : conv.workspace
}

async function syncProjectFilesToWorkspace(conv, project) {
  const files = projects.listFiles(project.id)
  if (!files.length) return { files: [], error: '' }
  let root
  try {
    root = await ensureUploadWorkspace(conv)
  } catch (error) {
    return { files: [], error: `工作区不可用：${error.message}` }
  }
  const destination = path.join(root, 'project')
  try {
    fs.mkdirSync(destination, { recursive: true })
  } catch (error) {
    return { files: [], error: `无法创建 project/ 目录：${error.message}` }
  }
  const linked = []
  let failed = 0
  for (const file of files.slice(0, 20)) {
    const source = path.join(projects.fileRoot(project.id), file.name)
    const target = path.join(destination, file.name)
    try {
      const stat = fs.existsSync(target) ? fs.statSync(target) : null
      if (!stat || stat.size !== file.size || Math.round(stat.mtimeMs) !== Math.round(file.mtime)) {
        fs.copyFileSync(source, target)
      }
      linked.push({ name: file.name, size: file.size, relative: `project/${file.name}` })
    } catch {
      failed += 1
    }
  }
  return {
    files: linked,
    error: failed ? `${failed}/${files.length} 个项目文件复制失败，本轮上下文可能不完整` : '',
  }
}

function sanitizeUploadName(raw) {
  let name = String(raw || '').split(/[\\/]/).pop() || 'file'
  name = name.replace(/[\u0000-\u001f<>:"|?*]/g, '_').replace(/\s+/g, ' ').trim()
  if (!name || name === '.' || name === '..') name = 'file'
  return name.slice(0, 120)
}

function uploadDestination(directory, name) {
  const uploadsDir = path.join(directory, 'uploads')
  fs.mkdirSync(uploadsDir, { recursive: true })
  const realRoot = fs.realpathSync(directory)
  const realUploads = fs.realpathSync(uploadsDir)
  if (!realUploads.startsWith(realRoot + path.sep)) {
    throw Object.assign(new Error('上传目录不在对话工作区内'), { status: 400 })
  }
  const extension = path.extname(name)
  const base = path.basename(name, extension)
  let target = path.join(uploadsDir, name)
  let index = 1
  while (fs.existsSync(target)) {
    target = path.join(uploadsDir, `${base}-${index}${extension}`)
    index += 1
  }
  return { uploadsDir, target }
}

async function readUploadTo(req, target) {
  const temp = path.join(path.dirname(target), `.upload-${crypto.randomUUID()}.part`)
  let bytes = 0
  const limiter = new Transform({
    transform(chunk, _encoding, callback) {
      bytes += chunk.length
      if (bytes > MAX_UPLOAD) {
        callback(Object.assign(new Error('单个文件不能超过 25MB'), { status: 413 }))
        return
      }
      callback(null, chunk)
    },
  })
  try {
    await pipeline(req, limiter, fs.createWriteStream(temp, { mode: 0o600, flags: 'wx' }))
    if (bytes === 0) throw Object.assign(new Error('上传内容为空'), { status: 400 })
    // link() publishes a complete file exclusively. Concurrent uploads cannot
    // overwrite one another, and no empty reservation is visible in the drawer.
    const extension = path.extname(target)
    const base = target.slice(0, target.length - extension.length)
    let destination = target
    let index = 1
    while (true) {
      try {
        fs.linkSync(temp, destination)
        break
      } catch (error) {
        if (error.code !== 'EEXIST') throw error
        destination = `${base}-${index++}${extension}`
      }
    }
    fs.rmSync(temp, { force: true })
    return { size: bytes, target: destination }
  } catch (error) {
    try {
      fs.rmSync(temp, { force: true })
    } catch {}
    throw error
  }
}

function serveConversationFile(req, res, conv, url) {
  const root = conversationRoot(conv)
  if (!root) return sendJson(res, 404, { error: '对话还没有工作区文件' })
  let file
  try {
    file = resolveWorkspaceFile(root, url.searchParams.get('path') || '')
  } catch (error) {
    return sendJson(res, 404, { error: error.message })
  }
  const extension = path.extname(file.absolute).toLowerCase()
  const download = url.searchParams.get('download') === '1'
  let contentType = 'application/octet-stream'
  let disposition = 'attachment'
  if (IMAGE_TYPES[extension]) {
    contentType = IMAGE_TYPES[extension]
    disposition = 'inline'
  } else if (extension === '.pdf') {
    contentType = 'application/pdf'
    disposition = 'inline'
  } else if (TEXT_EXTENSIONS.has(extension)) {
    contentType = 'text/plain; charset=utf-8'
    disposition = 'inline'
  }
  if (download) disposition = 'attachment'
  const filename = path.basename(file.absolute)
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  const inlinePdf = contentType === 'application/pdf' && disposition === 'inline'

  securityHeaders(res)
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': file.stat.size,
    'Content-Disposition': `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    // The native PDF viewer needs an unsandboxed document, but may only be
    // embedded by this app. All other workspace files retain full isolation.
    'X-Frame-Options': inlinePdf ? 'SAMEORIGIN' : 'DENY',
    'Content-Security-Policy': inlinePdf
      ? "default-src 'none'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'"
      : "default-src 'none'; sandbox",
  })
  if (req.method === 'HEAD') return res.end()
  fs.createReadStream(file.absolute).pipe(res)
}


function projectPromptBlock(conv, english = false) {
  if (!conv.projectId) return ''
  const project = projects.get(conv.projectId)
  if (!project || project.deletedAt) return ''
  const parts = english
    ? ['[Project context]', `Project: ${project.name}`]
    : ['[项目上下文]', `项目：${project.name}`]
  if (project.instructions) parts.push(english ? `Project instructions:\n${project.instructions}` : `项目指令：\n${project.instructions}`)
  if (project.notes) parts.push(english ? `Project notes:\n${project.notes}` : `项目资料：\n${project.notes}`)
  parts.push(english
    ? 'Use this context only when it does not conflict with the current message; do not repeat it verbatim.'
    : '以上项目上下文仅在与本轮消息不冲突时生效；不要逐条复述项目资料。')
  const block = parts.join('\n')
  return block.length > 12000 ? block.slice(0, 12000) + '\n…（项目上下文已截断）' : block
}

function versionSnapshot(message) {
  return {
    id: 'v_' + crypto.randomBytes(5).toString('hex'),
    text: String(message.text || ''),
    blocks: JSON.parse(JSON.stringify(message.blocks || [])),
    thinking: String(message.thinking || ''),
    status: message.status || 'done',
    error: message.error || null,
    createdAt: Number(message.createdAt) || Date.now(),
    completedAt: Number(message.completedAt) || null,
    usage: message.usage ? JSON.parse(JSON.stringify(message.usage)) : null,
    durationMs: Number(message.durationMs) || null,
    model: message.model || null,
    effort: message.codexEffort || null,
    editedAt: Number(message.editedAt) || null,
    context: message.context ? JSON.parse(JSON.stringify(message.context)) : null,
    files: Array.isArray(message.files) ? JSON.parse(JSON.stringify(message.files)) : [],
  }
}

function restoreVersion(message, snapshot) {
  message.text = snapshot.text || ''
  message.blocks = JSON.parse(JSON.stringify(snapshot.blocks || []))
  message.thinking = snapshot.thinking || ''
  message.status = snapshot.status || 'done'
  message.error = snapshot.error || null
  message.createdAt = Number(snapshot.createdAt) || message.createdAt
  message.completedAt = Number(snapshot.completedAt) || null
  message.usage = snapshot.usage || null
  message.durationMs = Number(snapshot.durationMs) || null
  message.model = snapshot.model || message.model
  message.codexEffort = snapshot.effort || null
  message.editedAt = Number(snapshot.editedAt) || null
  message.context = snapshot.context ? JSON.parse(JSON.stringify(snapshot.context)) : null
  message.files = Array.isArray(snapshot.files) ? snapshot.files : []
}

function transcriptFor(conv, excludeId) {
  const lines = []
  for (const msg of conv.messages) {
    if (msg.id === excludeId || msg.status === 'running') continue
    if (msg.role !== 'user' && msg.role !== 'assistant') continue
    const text = String(msg.text || '').replace(/\s+/g, ' ').trim()
    if (!text) continue
    lines.push(`${msg.role === 'user' ? '用户' : '助手'}：${text.slice(0, 1200)}`)
  }
  const selected = lines.slice(-16)
  let body = selected.join('\n')
  if (body.length > 14000) body = body.slice(-14000)
  return body
}

function normalizeAttachments(conv, raw) {
  if (!Array.isArray(raw) || !raw.length) return []
  const root = conversationRoot(conv)
  if (!root) throw Object.assign(new Error('附件工作区不存在'), { status: 400 })
  const seen = new Set()
  const out = []
  for (const item of raw.slice(0, MAX_ATTACHMENTS)) {
    const relative = typeof item === 'string' ? item : item?.path
    if (typeof relative !== 'string' || !relative || seen.has(relative)) continue
    seen.add(relative)
    let file
    try {
      file = resolveWorkspaceFile(root, relative)
    } catch {
      throw Object.assign(new Error('附件不在当前对话工作区内'), { status: 400 })
    }
    if (file.stat.size > MAX_UPLOAD) throw Object.assign(new Error('附件不能超过 25MB'), { status: 413 })
    out.push({
      path: file.relative.split(path.sep).join('/'),
      name: path.basename(file.relative),
      size: file.stat.size,
      kind: fileKind(file.relative),
    })
  }
  return out
}

function chatRateLimited(owner) {
  const now = Date.now()
  const list = (chatRate.get(owner) || []).filter((at) => now - at < 60_000)
  if (list.length >= MAX_RUNS_PER_MINUTE) {
    chatRate.set(owner, list)
    return true
  }
  list.push(now)
  chatRate.set(owner, list)
  return false
}

async function handleChat(req, res, owner, restId) {
  const conv = ownedConversation(restId, res, owner)
  if (!conv) return
  const archivedProject = conv.projectId ? projects.get(conv.projectId) : null
  if (archivedProject?.deletedAt) {
    return sendJson(res, 409, { error: '项目在最近删除中，恢复项目后才能继续对话' })
  }
  if (archivedProject?.archivedAt) {
    return sendJson(res, 409, { error: '项目已归档，恢复项目后才能继续对话' })
  }
  const body = await readJsonBody(req)
  let text = typeof body.text === 'string' ? body.text.trim() : ''
  const retryOf = typeof body.retryOf === 'string' ? body.retryOf : ''
  const editOf = typeof body.editOf === 'string' ? body.editOf : ''
  const internal = body.internal === true
  const instruction = typeof body.instruction === 'string' ? body.instruction.trim().slice(0, 500) : ''
  if (!text && !retryOf && !editOf) return sendJson(res, 400, { error: '消息不能为空' })
  if ([...text].length > MAX_PROMPT) return sendJson(res, 400, { error: `消息过长（最多 ${MAX_PROMPT} 字符）` })
  if (activeRuns.has(conv.id) || startingRuns.has(conv.id)) {
    return sendJson(res, 409, { error: '当前会话正在生成回复，请稍候或先停止' })
  }
  if (activeRuns.size + startingRuns.size >= MAX_PARALLEL_RUNS) {
    return sendJson(res, 429, { error: '当前同时生成的对话较多，请稍后再试' })
  }
  if (chatRateLimited(owner)) {
    return sendJson(res, 429, { error: '发送太频繁了，请稍等一分钟再试' })
  }
  const idempotencyKey = String(req.headers['idempotency-key'] || '').slice(0, 80)
  if (idempotencyKey) {
    const now = Date.now()
    for (const [key, value] of idempotency) {
      if (now - value.at > 120_000) idempotency.delete(key)
    }
    if (idempotency.has(idempotencyKey)) {
      return sendJson(res, 409, { error: '这条消息已经发送过了' })
    }
    idempotency.set(idempotencyKey, { at: now, convId: conv.id })
  }

  let attachments = []
  try {
    attachments = normalizeAttachments(conv, body.attachments)
  } catch (error) {
    return sendJson(res, error.status || 400, { error: error.message })
  }

  const now = Date.now()
  let userMessage
  let previousVersions = []
  let editBranchTitle = ''
  if (retryOf) {
    const index = conv.messages.findIndex((msg) => msg.id === retryOf && msg.role === 'assistant')
    if (index < 0) return sendJson(res, 404, { error: '要重新生成的回答不存在' })
    if (index !== conv.messages.length - 1) {
      return sendJson(res, 409, { error: '只能重新生成最后一条回答；更早的回答请用「从这里分叉」保留后文。' })
    }
    const old = conv.messages[index]
    let userIndex = index - 1
    while (userIndex >= 0 && conv.messages[userIndex].role !== 'user') userIndex -= 1
    if (userIndex < 0) return sendJson(res, 400, { error: '找不到对应的提问' })
    userMessage = conv.messages[userIndex]
    text = userMessage.text
    if (Array.isArray(userMessage.attachments) && userMessage.attachments.length) {
      attachments = userMessage.attachments
    }
    previousVersions = [...(Array.isArray(old.versions) ? old.versions : []), versionSnapshot(old)].slice(-30)
    conv.messages.splice(index)
  } else if (editOf) {
    const index = conv.messages.findIndex((msg) => msg.id === editOf && msg.role === 'user')
    if (index < 0) return sendJson(res, 404, { error: '要编辑的消息不存在' })
    userMessage = conv.messages[index]
    if (conv.messages.length > index + 1) {
      try {
        const tail = conv.messages[conv.messages.length - 1]
        const branch = store.fork(owner, conv.id, tail.id)
        if (branch) {
          branch.title = `${String(conv.title || '对话').slice(0, 40)} · 编辑前`
          branch.forkedFrom = { ...(branch.forkedFrom || {}), reason: 'edit' }
          store.touch(branch)
          editBranchTitle = branch.title
        }
      } catch (error) {
        return sendJson(res, error.status || 409, { error: `无法为编辑前的后文创建分支，已取消本次编辑：${error.message}` })
      }
    }
    userMessage.text = text
    userMessage.editedAt = now
    userMessage.attachments = attachments
    conv.messages.splice(index + 1)
  } else {
    userMessage = {
      id: messageId(),
      role: 'user',
      text,
      createdAt: now,
      ...(internal ? { internal: true } : {}),
    }
    if (attachments.length) userMessage.attachments = attachments
    conv.messages.push(userMessage)
  }
  if (attachments.length) userMessage.attachments = attachments

  // Capture durable preferences before building this turn's prompt so a
  // "记住…" message applies immediately, without waiting for the next turn.
  const project = conv.projectId ? projects.get(conv.projectId) : null
  const projectSync = project ? await syncProjectFilesToWorkspace(conv, project) : { files: [], error: '' }
  const projectFiles = projectSync.files
  const memoryDisabled = Boolean(conv.noMemory || project?.memoryOff)
  const capturedMemories =
    !memoryDisabled && !retryOf && !editOf && !internal ? memory.capture(owner, text, conv.id, project?.id || null) : []

  const english = !/[\u4e00-\u9fff]/.test(text) && /[A-Za-z]{3,}/.test(text)
  let promptText = text
  if (attachments.length) {
    const attachmentHeader = english ? '[Attached files]' : '[用户上传的附件]'
    const attachmentAsk = english ? 'Read these files when needed.' : '请按需读取这些文件。'
    const pdfWarning = attachments.some((file) => /\.pdf$/i.test(file.name))
      ? (english ? '\nNote: scanned PDFs may have no text layer; say so instead of guessing.' : '\n注意：扫描版 PDF 可能没有文本层，若读取不到内容请明确说明，不要猜测。')
      : ''
    promptText += `\n\n${attachmentHeader}\n${attachments
      .map((file) => `- ${file.path}（${file.name}，${file.size} bytes）`)
      .join('\n')}\n${attachmentAsk}${pdfWarning}`
  }
  if (retryOf) {
    promptText += english
      ? '\n\n(Please regenerate the previous answer, ignore your earlier version, and do not mention that this is a retry.)'
      : '\n\n（请重新生成上一条回答，忽略你之前给出的版本，不要提及这是一次重试。）'
    if (instruction) promptText += english ? `\nRewrite request: ${instruction}` : `\n重写要求：${instruction}`
  } else if (editOf) {
    promptText += '\n\n（这是编辑后的重新发送，请以本条消息为准，忽略此前相同问题的上下文。）'
  }
  const projectBlock = projectPromptBlock(conv, english)
  const projectFilesBlock = projectFiles.length
    ? `[项目文件]\n${projectFiles.map((file) => `- ${file.relative}（${file.name}，${file.size} bytes）`).join('\n')}\n这些文件已复制到当前工作区的 project/ 目录，可直接读取。`
    : ''
  const memoryBlock = memoryDisabled ? '' : memory.promptBlock(owner, project?.id || null)
  if (memoryBlock) promptText = `${memoryBlock}\n\n${promptText}`
  if (projectBlock) promptText = `${projectBlock}\n\n${promptText}`
  if (projectFilesBlock) promptText = `${projectFilesBlock}\n\n${promptText}`

  // The text is rendered with textContent on the client; store it as-is.
  const assistant = {
    id: messageId(),
    role: 'assistant',
    blocks: [],
    text: '',
    thinking: '',
    status: 'running',
    error: null,
    createdAt: Date.now(),
    completedAt: null,
    usage: null,
    durationMs: null,
    model: MODEL,
    files: [],
    context: {
      projectId: project?.id || null,
      projectName: project?.name || null,
      memoryChars: memoryBlock.length,
      projectChars: projectBlock.length,
      permission: conv.permission,
    },
    ...(previousVersions.length ? { versions: previousVersions } : {}),
  }
  conv.messages.push(assistant)
  if (conv.title === '新对话') conv.title = store.titleFrom(text || '附件')
  store.touch(conv)
  startingRuns.add(conv.id)

  const hub = {
    convId: conv.id,
    conv,
    messageId: assistant.id,
    events: [],
    sinks: new Set(),
    resolved: new Set(),
    finished: false,
    kill: null,
    answerApproval: null,
    answerQuestion: null,
    heartbeat: null,
    subscribe(sink, { reset = false } = {}) {
      if (reset) {
        try {
          sink.write(JSON.stringify({ t: 'reset', messageId: this.messageId, title: this.conv.title }) + '\n')
          for (const event of this.events) {
            // 只为当前订阅者的一次性提示（例如刚捕获的记忆）不回放。
            if (event.transient) continue
            // 已经回答/处理过的问题与授权不再回放，避免刷新或重开网页时重复弹卡。
            if (
              event.requestId &&
              this.resolved.has(event.requestId) &&
              (event.t === 'question' ||
                event.t === 'question_resolved' ||
                event.t === 'approval' ||
                event.t === 'approval_resolved' ||
                event.t === 'approval_cancelled')
            ) {
              continue
            }
            sink.write(JSON.stringify(event) + '\n')
          }
        } catch {}
      }
      this.sinks.add(sink)
      sink.on('close', () => this.sinks.delete(sink))
    },
    send(payload) {
      if (this.finished) return
      this.events.push(payload)
      const line = JSON.stringify(payload) + '\n'
      for (const sink of [...this.sinks]) {
        if (sink.writableEnded || sink.destroyed) {
          this.sinks.delete(sink)
          continue
        }
        try {
          sink.write(line)
        } catch {
          this.sinks.delete(sink)
        }
      }
    },
    end() {
      if (this.finished) return
      this.finished = true
      clearInterval(this.heartbeat)
      for (const [requestId, entry] of pendingInteractions) {
        if (entry.run === this) pendingInteractions.delete(requestId)
      }
      for (const sink of [...this.sinks]) {
        try {
          sink.end()
        } catch {}
      }
      this.sinks.clear()
    },
  }
  hub.heartbeat = setInterval(() => {
    for (const sink of [...hub.sinks]) {
      if (sink.writableEnded || sink.destroyed) {
        hub.sinks.delete(sink)
        continue
      }
      try {
        sink.write('\n')
      } catch {
        hub.sinks.delete(sink)
      }
    }
  }, 15_000)
  if (hub.heartbeat.unref) hub.heartbeat.unref()
  activeRuns.set(conv.id, hub)

  securityHeaders(res)
  res.writeHead(200, {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
    Connection: 'keep-alive',
  })
  if (res.socket) res.socket.setNoDelay(true)
  hub.subscribe(res)

  const state = buildBlocks()
  let turnEnd = null
  let dshError = null
  let status = 'done'
  let lastSave = 0

  const persist = (force = false) => {
    const now = Date.now()
    if (!force && now - lastSave < 900) return
    lastSave = now
    assistant.blocks = state.blocks
    assistant.text = state.text()
    assistant.thinking = state.thinking()
    store.scheduleSave()
  }

  hub.send({ t: 'ready', userMessageId: userMessage.id, messageId: assistant.id, title: conv.title })
  if (projectSync.error) hub.send({ t: 'notice', text: `项目文件未完整同步：${projectSync.error}` })
  if (editBranchTitle) hub.send({ t: 'notice', text: `编辑前的后文已保存为分支「${editBranchTitle}」，可在列表里找到。` })
  if (capturedMemories.length) {
    hub.send({
      t: 'memory',
      saved: capturedMemories,
      count: memory.count(owner),
      enabled: memory.settings.enabled,
      transient: true,
    })
  }

  let mode = conv.engine === 'codex' ? 'codex' : conv.mode
  if (conv.engine === 'codex') {
    conv.mode = 'codex'
    store.touch(conv)
  } else if (!mode) {
    const nativeAvailable = NATIVE_ENABLED ? await nativeBridge.available() : false
    mode = nativeAvailable ? 'native' : 'headless'
    conv.mode = mode
    store.touch(conv)
    if (mode === 'headless' && NATIVE_ENABLED) {
      hub.send({
        t: 'notice',
        text: '桌面版原生桥接尚未连接：本条对话使用 headless 模式，不会出现在桌面版。重启 DeepSeek Harness 后，新对话会自动使用原生模式。',
      })
    }
  }

  let workspaceDir = null
  let beforeFiles = new Map()
  const touchedFiles = new Set()

  const onEvent = (event) => {
    switch (event.type) {
      case 'session': {
        if (typeof event.sessionId === 'string') {
          conv.dshSessionId = event.sessionId
          store.touch(conv)
          hub.send({ t: 'session', sessionId: event.sessionId })
        }
        break
      }
      case 'thread': {
        if (typeof event.threadId === 'string' && event.threadId) {
          conv.codexThreadId = event.threadId
          store.touch(conv)
          hub.send({ t: 'session', sessionId: event.threadId, deepLink: codexDeepLink(event.threadId) })
          if (conv.title && conv.title !== '新对话') {
            void codexBridge.setThreadName(event.threadId, conv.title)
          }
        }
        break
      }
      case 'usage': {
        if (event.usage) assistant.usage = event.usage
        break
      }
      case 'file': {
        if (workspaceDir && typeof event.path === 'string' && event.path) {
          const root = path.resolve(workspaceDir)
          const absolute = path.isAbsolute(event.path)
            ? path.resolve(event.path)
            : path.resolve(root, event.path)
          if (absolute === root || absolute.startsWith(root + path.sep)) {
            touchedFiles.add(path.relative(root, absolute))
          }
        }
        break
      }
      case 'notice': {
        if (typeof event.text === 'string' && event.text) {
          hub.send({ t: 'notice', text: event.text })
        }
        break
      }
      case 'status': {
        if (event.phase === 'turn_end') turnEnd = event.reason || null
        if (event.phase === 'step_end' && event.usage) {
          const usage = assistant.usage || {
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            totalTokens: 0,
            steps: 0,
          }
          for (const key of ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens']) {
            usage[key] = (usage[key] || 0) + (Number(event.usage[key]) || 0)
          }
          usage.totalTokens = (usage.totalTokens || 0) + (Number(event.usage.totalTokens) || 0)
          usage.steps = (usage.steps || 0) + 1
          assistant.usage = usage
        }
        hub.send({
          t: 'status',
          phase: event.phase,
          turn: event.turn,
          step: event.step,
          usage: event.usage || null,
        })
        break
      }
      case 'thinking': {
        if (typeof event.text === 'string' && event.text) {
          state.appendThinking(event.text)
          hub.send({ t: 'thinking', text: event.text })
          persist()
        }
        break
      }
      case 'text': {
        if (typeof event.text === 'string' && event.text) {
          state.appendText(event.text)
          hub.send({ t: 'text', text: event.text })
          persist()
        }
        break
      }
      case 'tool_call': {
        state.toolCall({
          id: event.callId || crypto.randomUUID(),
          tool: event.tool || 'tool',
          input: event.input ?? null,
          status: 'running',
        })
        hub.send({
          t: 'tool_call',
          id: event.callId,
          tool: event.tool,
          input: event.input ?? null,
          summary: toolSummary(event.tool, event.input),
        })
        if (workspaceDir && ['write', 'edit', 'str_replace_editor', 'present'].includes(event.tool)) {
          const raw = event.input?.file_path || event.input?.path
          if (typeof raw === 'string' && raw) {
            const root = path.resolve(workspaceDir)
            const absolute = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(root, raw)
            if (absolute.startsWith(root + path.sep)) touchedFiles.add(path.relative(root, absolute))
          }
        }
        persist()
        break
      }
      case 'tool_result': {
        const cappedResult = typeof event.result === 'string'
          ? (event.result.length > 200_000
            ? `${event.result.slice(0, 80_000)}\n…（中间省略 ${event.result.length - 180_000} 字）…\n${event.result.slice(-100_000)}\n（工具输出超过 200KB，已截断后保存）`
            : event.result)
          : event.result
        state.toolResult(event.callId, event.status, cappedResult)
        hub.send({
          t: 'tool_result',
          id: event.callId,
          status: event.status,
          result: cappedResult,
        })
        persist()
        break
      }
      case 'final': {
        if (typeof event.text === 'string' && event.text && !state.text()) {
          state.appendText(event.text)
          hub.send({ t: 'text', text: event.text })
        }
        break
      }
      case 'delta': {
        if ((event.kind === 'text' || event.kind === 'thinking') && typeof event.text === 'string' && event.text) {
          hub.send({ t: 'delta', kind: event.kind, text: event.text })
        }
        break
      }
      case 'approval': {
        if (typeof event.requestId === 'string' && typeof event.toolName === 'string') {
          pendingInteractions.set(event.requestId, { run: hub, kind: 'approval' })
          hub.send({
            t: 'approval',
            requestId: event.requestId,
            callId: event.callId ?? null,
            toolName: event.toolName,
            reason: event.reason ?? null,
            displayReason: event.displayReason ?? null,
          })
          notifier.emit('approval', {
            conversationId: conv.id,
            title: conv.title,
            toolName: event.toolName,
            reason: event.displayReason || event.reason || '',
            url: conversationUrl(conv.id),
          })
        }
        break
      }
      case 'approval_cancelled': {
        if (typeof event.requestId === 'string') {
          markInteractionResolved(event.requestId, { broadcast: false })
          hub.send({ t: 'approval_cancelled', requestId: event.requestId })
        }
        break
      }
      case 'question': {
        if (typeof event.requestId === 'string' && Array.isArray(event.questions)) {
          pendingInteractions.set(event.requestId, { run: hub, kind: 'question' })
          hub.send({
            t: 'question',
            requestId: event.requestId,
            callId: event.callId ?? null,
            questions: event.questions,
          })
          notifier.emit('question', {
            conversationId: conv.id,
            title: conv.title,
            questions: event.questions,
            url: conversationUrl(conv.id),
          })
        }
        break
      }
      case 'meta': {
        if (typeof event.model === 'string') {
          hub.send({ t: 'meta', model: event.model, effort: event.effort || null })
        }
        break
      }
      case 'error': {
        dshError = event.message || '运行失败'
        hub.send({ t: 'error', message: dshError })
        break
      }
    }
  }

  try {
  let result = null

  if (mode === 'codex') {
    conv.workspace = path.join(SHARED_WORKSPACE, 'chats', conv.id)
    fs.mkdirSync(conv.workspace, { recursive: true })
    workspaceDir = conv.workspace
    const selection = resolveCodexSelection(conv)
    if (conv.codexModel !== selection.model || conv.codexEffort !== selection.effort) {
      conv.codexModel = selection.model
      conv.codexEffort = selection.effort
    }
    assistant.model = selection.modelName
    assistant.codexEffort = selection.effortName
    beforeFiles = snapshotWorkspace(workspaceDir)
    store.touch(conv)
    const run = codexBridge.startRun({
      prompt: promptText,
      cwd: workspaceDir,
      threadId: conv.codexThreadId || null,
      permission: normalizePermission(conv.permission),
      model: selection.model,
      effort: selection.effort,
      onEvent,
    })
    hub.kill = () => run.kill()
    hub.answerApproval = (requestId, decision) => run.answerApproval(requestId, decision)
    hub.answerQuestion = (requestId, answers) => run.answerQuestion(requestId, answers)
    const outcome = await run.done
    result = {
      codex: true,
      codexStatus: outcome.status,
      codexError: outcome.error,
      code: outcome.status === 'done' ? 0 : 1,
      killed: outcome.status === 'stopped',
      timedOut: Boolean(outcome.timedOut),
      durationMs: outcome.durationMs,
      model: selection.model,
      effort: selection.effort,
      modelName: selection.modelName,
      effortName: selection.effortName,
    }
  } else if (mode === 'native') {
    const previousSession = conv.dshSessionId
    let canResume = Boolean(previousSession) && conv.contextEpoch === SERVER_EPOCH
    let nativePrompt = promptText
    if (previousSession && !canResume) {
      const transcript = transcriptFor(conv, userMessage.id)
      if (transcript) {
        nativePrompt = `[上下文恢复] 服务刚刚重启，下面是这段对话之前的记录。请接着回答当前消息，不要重复旧回答。\n${transcript}\n\n[当前消息]\n${promptText}`
        hub.send({ t: 'notice', text: '服务重启后已重建会话上下文，继续本次对话。' })
      }
      void nativeBridge.archiveSession(previousSession).catch(() => {})
      conv.dshSessionId = `session-${crypto.randomUUID()}`
      canResume = false
    }
    if (!conv.dshSessionId) conv.dshSessionId = `session-${crypto.randomUUID()}`
    conv.contextEpoch = SERVER_EPOCH
    conv.nativeCwd = path.join(SHARED_WORKSPACE, 'chats', conv.id)
    conv.workspace = conv.nativeCwd
    fs.mkdirSync(conv.nativeCwd, { recursive: true })
    workspaceDir = conv.nativeCwd
    beforeFiles = snapshotWorkspace(workspaceDir)
    store.touch(conv)
    hub.send({ t: 'session', sessionId: conv.dshSessionId })
    const run = nativeBridge.startRun({
      sessionId: conv.dshSessionId,
      prompt: nativePrompt,
      cwd: conv.nativeCwd,
      isResume: canResume,
      permission: normalizePermission(conv.permission),
      title: NATIVE_WORKSPACE_TITLE,
      onEvent,
    })
    hub.kill = () => run.kill()
    const outcome = await run.done
    result = {
      native: true,
      nativeStatus: outcome.status,
      nativeError: outcome.error,
      code: outcome.status === 'done' ? 0 : 1,
      killed: outcome.status === 'stopped',
      timedOut: Boolean(outcome.timedOut),
      spawnError: null,
      stderr: outcome.error || '',
      sawSession: true,
      finalText: '',
      durationMs: outcome.durationMs,
    }
  } else {
    fs.mkdirSync(conv.workspace, { recursive: true })
    workspaceDir = conv.workspace
    beforeFiles = snapshotWorkspace(workspaceDir)
    let sessionId = conv.dshSessionId
    let attempt = 0
    while (attempt < 2) {
      attempt += 1
      result = await runOnce()
      if (attempt === 1 && sessionId && !result.sawSession && result.code !== 0 && result.stderr) {
        state.blocks.length = 0
        sessionId = null
        conv.dshSessionId = null
        hub.send({ t: 'notice', text: '原会话记录不可用，已为你开始新的上下文。' })
        continue
      }
      break
    }

    async function runOnce() {
      const run = startDshRun({
        prompt: promptText,
        sessionId,
        cwd: conv.workspace,
        permission: conv.permission,
        onEvent,
      })
      hub.kill = () => run.kill()
      return await run.done
    }
  }

  assistant.usage = assistant.usage || null
  assistant.durationMs = result?.durationMs ?? null
  if (result?.codex) {
    status = result.codexStatus
    assistant.model = result.modelName || 'Codex'
    assistant.codexModel = result.model || null
    assistant.codexEffort = result.effortName || null
    if (status === 'error') assistant.error = result.codexError || 'Codex 运行失败'
  } else if (result?.native) {
    status = result.nativeStatus
    if (result.timedOut) {
      status = 'error'
      assistant.error = '生成超时，已自动停止'
    } else if (status === 'error') {
      assistant.error = result.nativeError || '原生会话运行失败'
    }
  } else if (result?.killed && !result?.timedOut) {
    status = 'stopped'
  } else if (result?.timedOut) {
    status = 'error'
    assistant.error = '生成超时，已自动停止'
  } else if (result?.spawnError) {
    status = 'error'
    assistant.error = `无法启动 DeepSeek Harness：${result.spawnError.message}`
  } else if (result?.code === 0 && (!turnEnd || turnEnd.kind === 'completed')) {
    status = 'done'
  } else {
    status = 'error'
    const fromReason = turnEnd?.error?.message
    const fromStderr = (result?.stderr || '')
      .split('\n')
      .filter((line) => line && !line.startsWith('dsh: reasoning:'))
      .at(-1)
    assistant.error = dshError || fromReason || fromStderr || `DeepSeek Harness 退出码 ${result?.code}`
  }

  assistant.files = collectTurnFiles(workspaceDir, beforeFiles, touchedFiles)
  assistant.status = status
  assistant.completedAt = Date.now()
  assistant.blocks = state.blocks
  assistant.text = state.text()
  assistant.thinking = state.thinking()
  if (assistant.error) hub.send({ t: 'error', message: assistant.error })
  store.touch(conv)
  await store.flush()

  hub.send({
    t: 'done',
    status,
    durationMs: assistant.durationMs,
    usage: assistant.usage,
    sessionId: conv.engine === 'codex' ? conv.codexThreadId : conv.dshSessionId,
    threadId: conv.engine === 'codex' ? conv.codexThreadId || null : null,
    deepLink: conv.engine === 'codex' ? codexDeepLink(conv.codexThreadId) : null,
    model: assistant.model || null,
    effort: assistant.codexEffort || null,
    engine: conv.engine === 'codex' ? 'codex' : 'dsr',
    files: assistant.files,
  })

  // Outbound notification: fire-and-forget, never blocks the run.
  const notifyPayload = {
    conversationId: conv.id,
    title: conv.title,
    text: assistant.text,
    model: assistant.model || null,
    durationMs: assistant.durationMs,
    url: conversationUrl(conv.id),
  }
  if (status === 'done') notifier.emit('done', notifyPayload)
  else if (status === 'error') notifier.emit('error', { ...notifyPayload, error: assistant.error || '运行失败' })
  } finally {
    activeRuns.delete(conv.id)
    startingRuns.delete(conv.id)
    hub.end()
  }
}

/* ── routing ─────────────────────────────────────────────────────────── */

async function handleApi(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const origin = req.headers.origin
    if (origin) {
      try {
        if (new URL(origin).host !== req.headers.host) {
          return sendJson(res, 403, { error: '跨站请求被拒绝' })
        }
      } catch {
        return sendJson(res, 403, { error: '跨站请求被拒绝' })
      }
    }
    if (String(req.headers['sec-fetch-site'] || '').toLowerCase() === 'cross-site') {
      return sendJson(res, 403, { error: '跨站请求被拒绝' })
    }
  }
  const owner = SINGLE_USER ? SHARED_OWNER : ownerOf(clientId(req, res))
  const segments = url.pathname.split('/').filter(Boolean) // ['api', ...]
  const rest = segments.slice(1)

  if (rest[0] === 'health') {
    return sendJson(res, 200, { ok: true })
  }
  if (rest[0] === 'login' && req.method === 'POST') {
    const ip = req.socket.remoteAddress || 'unknown'
    const now = Date.now()
    const entry = authFailures.get(ip) || { count: 0, resetAt: now + 60_000 }
    if (now > entry.resetAt) {
      entry.count = 0
      entry.resetAt = now + 60_000
    }
    if (entry.count >= 8) {
      return sendJson(res, 429, { error: '尝试次数过多，请一分钟后再试' })
    }
    const body = await readJsonBody(req)
    const code = String(body.code ?? '').trim()
    if (!AUTH_ENABLED || timingSafeEqual(code, ACCESS_CODE)) {
      authFailures.delete(ip)
      res.appendHeader(
        'Set-Cookie',
        `${AUTH_COOKIE}=${authToken()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${isSecureRequest(req) ? '; Secure' : ''}`,
      )
      return sendJson(res, 200, { ok: true, model: MODEL })
    }
    entry.count += 1
    authFailures.set(ip, entry)
    return sendJson(res, 401, { error: '访问码不正确' })
  }
  if (rest[0] === 'logout' && req.method === 'POST') {
    // Single-user auth has no session table. Rotating the epoch invalidates
    // every previously issued cookie, so a copied cookie cannot outlive the
    // logout the user just performed.
    bumpAuthEpoch()
    res.appendHeader('Set-Cookie', `${AUTH_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isSecureRequest(req) ? '; Secure' : ''}`)
    return sendJson(res, 200, { ok: true, revokedAllDevices: true })
  }
  if (rest[0] === 'me') {
    return sendJson(res, 200, {
      authenticated: isAuthed(req),
      authRequired: AUTH_ENABLED,
      model: MODEL,
      title: config.title,
      native: NATIVE_ENABLED && nativeBridge.initialized,
      nativeEnabled: NATIVE_ENABLED,
      shared: SINGLE_USER,
      codex: codexAvailable(),
      codexReady: codexBridge.ready,
      codexModels: codexBridge.currentModels().models.length,
      permission: DEFAULT_PERMISSION,
      baseUrl: publicBaseUrl(req),
      secureContext: isSecureRequest(req),
      memory: {
        enabled: memory.settings.enabled,
        autoCapture: memory.settings.autoCapture,
        count: memory.count(owner),
      },
    })
  }

  if (rest[0] === 'share' && rest.length === 2 && (req.method === 'GET' || req.method === 'POST')) {
    const ip = req.socket.remoteAddress || 'unknown'
    const now = Date.now()
    const bucket = (shareViewRate.get(ip) || []).filter((at) => now - at < 60_000)
    if (bucket.length >= 120) return sendJson(res, 429, { error: '访问太快，请稍后再试' })
    bucket.push(now)
    shareViewRate.set(ip, bucket)
    let raw = ''
    try {
      raw = decodeURIComponent(rest[1])
    } catch {
      return sendJson(res, 400, { error: '链接无效' })
    }
    const failKey = `${rest[1]}:${ip}`
    const failure = shareFailures.get(failKey)
    if (failure && failure.count >= 8 && now - failure.resetAt < 10 * 60_000) {
      return sendJson(res, 429, { error: '口令尝试次数过多，请 10 分钟后再试' })
    }
    let password = ''
    if (req.method === 'POST') {
      try {
        const body = await readJsonBody(req, 8 * 1024)
        password = String(body.password || '').slice(0, 64)
      } catch {}
    }
    const result = await shares.findPublic(raw, password)
    if (result.error === 'notfound') return sendJson(res, 404, { error: '分享不存在或已被撤销' })
    if (result.error === 'revoked') return sendJson(res, 410, { error: '这个分享已被撤销' })
    if (result.error === 'expired') return sendJson(res, 410, { error: '这个分享已过期' })
    if (result.error === 'password') {
      const current = shareFailures.get(failKey) || { count: 0, resetAt: now }
      if (now - current.resetAt > 10 * 60_000) {
        current.count = 0
        current.resetAt = now
      }
      current.count += 1
      shareFailures.set(failKey, current)
      return sendJson(res, 401, { passwordRequired: true, error: '请输入分享口令' })
    }
    shareFailures.delete(failKey)
    securityHeaders(res)
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Robots-Tag', 'noindex, nofollow')
    return sendJson(res, 200, result.share)
  }

  if (!isAuthed(req)) return sendJson(res, 401, { error: '需要访问码' })

  if (rest[0] === 'projects') {
    try {
      if (rest.length === 1) {
        if (req.method === 'GET') {
          if (url.searchParams.get('trash') === '1') {
            return sendJson(res, 200, { projects: projects.listTrash(), counts: { trash: projects.listTrash().length } })
          }
          return sendJson(res, 200, projectsPayload(owner))
        }
        if (req.method === 'POST') {
          const body = await readJsonBody(req)
          const project = projects.create(body)
          return sendJson(res, 201, { project: projectSummary(project), ...projectsPayload(owner) })
        }
        return sendJson(res, 405, { error: '不支持的方法' })
      }
      if (rest.length === 3 && rest[2] === 'files') {
        const project = ownedProject(rest[1], res)
        if (!project) return
        const root = projects.fileRoot(project.id)
        if (req.method === 'GET') {
          return sendJson(res, 200, { files: projects.listFiles(project.id), note: '最多 20 个文件会随项目上下文复制到对话工作区 project/ 目录' })
        }
        if (req.method === 'POST') {
          const name = sanitizeUploadName(url.searchParams.get('name'))
          fs.mkdirSync(root, { recursive: true, mode: 0o700 })
          let target = path.join(root, name)
          const extension = path.extname(name)
          const base = path.basename(name, extension)
          let index = 1
          while (fs.existsSync(target)) target = path.join(root, `${base}-${index++}${extension}`)
          if (projects.listFiles(project.id).length >= 20) {
            return sendJson(res, 409, { error: '项目文件最多 20 个，请先删除不用的文件' })
          }
          try {
            const uploaded = await readUploadTo(req, target)
            audit.add('project.file.upload', `项目文件：${path.basename(uploaded.target)}`, { projectId: project.id })
            return sendJson(res, 201, { file: { name: path.basename(uploaded.target), size: uploaded.size }, files: projects.listFiles(project.id) })
          } catch (error) {
            return sendJson(res, error.status || 400, { error: error.message || '上传失败' })
          }
        }
        if (req.method === 'DELETE') {
          const body = await readJsonBody(req)
          const name = sanitizeUploadName(body.name)
          try {
            fs.rmSync(path.join(root, name), { force: true })
          } catch {}
          audit.add('project.file.delete', `删除项目文件：${name}`, { projectId: project.id })
          return sendJson(res, 200, { ok: true, files: projects.listFiles(project.id) })
        }
        return sendJson(res, 405, { error: '不支持的方法' })
      }
      if (rest.length === 3 && rest[2] === 'file' && req.method === 'GET') {
        const project = ownedProject(rest[1], res)
        if (!project) return
        const root = projects.fileRoot(project.id)
        let file
        try {
          file = resolveWorkspaceFile(root, url.searchParams.get('name') || '')
        } catch (error) {
          return sendJson(res, 404, { error: error.message })
        }
        const extension = path.extname(file.absolute).toLowerCase()
        const contentType = IMAGE_TYPES[extension] || (TEXT_EXTENSIONS.has(extension) ? 'text/plain; charset=utf-8' : extension === '.pdf' ? 'application/pdf' : 'application/octet-stream')
        securityHeaders(res)
        const download = url.searchParams.get('download') === '1'
        res.writeHead(200, {
          'Content-Type': contentType,
          'Content-Length': file.stat.size,
          'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(path.basename(file.absolute))}`,
          'Cache-Control': 'no-store',
        })
        return fs.createReadStream(file.absolute).pipe(res)
      }
      if (rest.length === 3 && rest[2] === 'restore' && req.method === 'POST') {
        const project = projects.get(rest[1])
        if (!project || !project.deletedAt) return sendJson(res, 404, { error: '最近删除里没有这个项目' })
        const restored = projects.restore(project.id)
        if (!restored) return sendJson(res, 410, { error: '超过 30 天，无法恢复' })
        const attached = store.attachProject(project.detachedConversationIds || [], project.id)
        delete project.detachedConversationIds
        audit.add('project.restore', `恢复项目：${String(project.name || '').slice(0, 60)}`, { projectId: project.id, attached })
        return sendJson(res, 200, { ok: true, ...projectsPayload(owner) })
      }
      if (rest.length === 3 && rest[2] === 'purge' && req.method === 'POST') {
        const project = projects.get(rest[1])
        if (!project || !project.deletedAt) return sendJson(res, 404, { error: '最近删除里没有这个项目' })
        const removedMemories = memory.removeProject(owner, project.id)
        projects.purge(project.id)
        audit.add('project.purge', `永久删除项目：${String(project.name || '').slice(0, 60)}`, { projectId: project.id, removedMemories })
        return sendJson(res, 200, { ok: true, removedMemories, ...projectsPayload(owner) })
      }
      if (rest.length === 2) {
        const project = ownedProject(rest[1], res)
        if (!project) return
        if (req.method === 'PATCH') {
          const body = await readJsonBody(req)
          if (body.defaultPermission !== undefined && body.defaultPermission !== project.defaultPermission) {
            audit.add('project.permission.change', `项目默认权限 ${project.defaultPermission || 'workspace-write'} → ${body.defaultPermission}`, { projectId: project.id })
          }
          const updated = projects.update(project.id, body)
          return sendJson(res, 200, { project: projectSummary(updated), ...projectsPayload(owner) })
        }
        if (req.method === 'DELETE') {
          const removed = projects.remove(project.id)
          const detached = store.detachProject(project.id)
          if (removed) removed.detachedConversationIds = detached
          audit.add('project.trash', `移到最近删除：${String(project.name || '').slice(0, 60)}`, { projectId: project.id, detached: detached.length })
          return sendJson(res, 200, { ok: true, removed: Boolean(removed), moved: detached.length, ...projectsPayload(owner) })
        }
        return sendJson(res, 405, { error: '不支持的方法' })
      }
      return sendJson(res, 404, { error: '未知接口' })
    } catch (error) {
      return sendJson(res, error.status || 400, { error: error.message || '项目操作失败' })
    }
  }

  if (rest[0] === 'shares') {
    if (rest.length === 1 && req.method === 'GET') {
      return sendJson(res, 200, { shares: shares.list(owner), counts: shares.counts(owner), baseUrl: publicBaseUrl(req) })
    }
    if (rest.length === 3 && rest[2] === 'refresh' && req.method === 'POST') {
      const meta = shares.list(owner).find((item) => item.id === rest[1])
      if (!meta) return sendJson(res, 404, { error: '分享不存在' })
      const conv = store.get(meta.conversationId)
      if (!conv || conv.owner !== owner || conv.deletedAt) return sendJson(res, 404, { error: '来源对话不存在或已删除' })
      try {
        const body = await readJsonBody(req).catch(() => ({}))
        const refreshed = shares.refresh(owner, rest[1], conv, { allowSensitive: body.allowSensitive === true })
        if (!refreshed) return sendJson(res, 409, { error: '分享已撤销，无法更新' })
        audit.add('share.refresh', `更新分享快照：${String(conv.title || '').slice(0, 80)}`, { shareId: rest[1], conversationId: conv.id })
        return sendJson(res, 200, { ok: true, updatedAt: refreshed.share.updatedAt })
      } catch (error) {
        return sendJson(res, error.status || 400, { error: error.message || '更新快照失败', sensitive: Number(error.sensitive) || 0 })
      }
    }
    if (rest.length === 2 && req.method === 'DELETE') {
      const revoked = shares.revoke(owner, rest[1])
      if (!revoked) return sendJson(res, 404, { error: '分享不存在' })
      audit.add('share.revoke', '撤销只读分享', { shareId: revoked.id, conversationId: revoked.conversationId })
      return sendJson(res, 200, { ok: true, shares: shares.list(owner), counts: shares.counts(owner) })
    }
    return sendJson(res, 405, { error: '不支持的方法' })
  }

  if (rest[0] === 'settings') {
    if (rest.length === 1 && req.method === 'GET') {
      return sendJson(res, 200, {
        publicBaseUrl: String(config.publicBaseUrl || ''),
        effectiveBaseUrl: publicBaseUrl(req),
        bindHost: String(config.host || ''),
        tlsEnabled: Boolean(tlsOptions),
      })
    }
    if (rest.length === 1 && req.method === 'PATCH') {
      const body = await readJsonBody(req)
      if (typeof body.publicBaseUrl !== 'string') return sendJson(res, 400, { error: '缺少 publicBaseUrl' })
      const value = body.publicBaseUrl.trim().replace(/\/+$/, '')
      if (value && !/^https?:\/\/[^\s/]+(?:\/[^\s]*)?$/i.test(value)) {
        return sendJson(res, 400, { error: '请填写完整的 http(s) 地址，例如 https://chat.example.com' })
      }
      config.publicBaseUrl = value
      if (!saveConfig()) return sendJson(res, 500, { error: '配置写入失败' })
      audit.add('settings.shareBase', `对外地址：${value || '自动'}`, {})
      return sendJson(res, 200, {
        publicBaseUrl: value,
        effectiveBaseUrl: publicBaseUrl(req),
        bindHost: String(config.host || ''),
        tlsEnabled: Boolean(tlsOptions),
      })
    }
    return sendJson(res, 405, { error: '不支持的方法' })
  }

  if (rest[0] === 'audit') {
    if (rest.length === 1 && req.method === 'GET') {
      return sendJson(res, 200, { entries: audit.list(url.searchParams.get('limit')) })
    }
    if (rest.length === 1 && req.method === 'DELETE') {
      const removed = audit.clear()
      audit.add('audit.clear', `清空操作记录（${removed} 条）`, {})
      return sendJson(res, 200, { ok: true, removed })
    }
    return sendJson(res, 405, { error: '不支持的方法' })
  }

  if (rest[0] === 'library') {
    if (rest.length === 1 && req.method === 'GET') {
      return sendJson(res, 200, library.get(owner))
    }
    if (rest.length === 1 && req.method === 'PUT') {
      const body = await readJsonBody(req, 2 * 1024 * 1024)
      return sendJson(res, 200, library.put(owner, body))
    }
    return sendJson(res, 405, { error: '不支持的方法' })
  }

  if (rest[0] === 'memory') {
    try {
      if (rest.length === 1) {
        if (req.method === 'GET') {
          return sendJson(res, 200, {
            enabled: memory.settings.enabled,
            autoCapture: memory.settings.autoCapture,
            count: memory.count(owner),
            items: memory.list(owner),
          })
        }
        if (req.method === 'POST') {
          const body = await readJsonBody(req)
          const projectId = typeof body.projectId === 'string' ? body.projectId : null
          const result = memory.add(owner, body.text, { source: 'manual', projectId })
          return sendJson(res, result.created ? 201 : 200, {
            item: result.item,
            created: result.created,
            count: memory.count(owner),
          })
        }
        if (req.method === 'DELETE') {
          const removed = memory.clear(owner)
          return sendJson(res, 200, { ok: true, removed, count: 0 })
        }
        return sendJson(res, 405, { error: '不支持的方法' })
      }
      if (rest.length === 2 && rest[1] === 'settings' && req.method === 'PATCH') {
        const body = await readJsonBody(req)
        if (typeof body.enabled !== 'boolean' && typeof body.autoCapture !== 'boolean') {
          return sendJson(res, 400, { error: '缺少记忆设置' })
        }
        const settings = memory.setSettings(body)
        return sendJson(res, 200, { ...settings, count: memory.count(owner) })
      }
      if (rest.length === 2 && rest[1] === 'extract' && req.method === 'POST') {
        const body = await readJsonBody(req)
        const conversationId = typeof body.conversationId === 'string' ? body.conversationId : ''
        if (!conversationId) return sendJson(res, 400, { error: '请先打开一段对话' })
        const conv = store.get(conversationId)
        if (!conv || conv.owner !== owner || conv.deletedAt) {
          return sendJson(res, 404, { error: '会话不存在' })
        }
        const candidates = memory.candidatesFor(owner, conv)
        return sendJson(res, 200, { candidates, count: memory.count(owner) })
      }
      if (rest.length === 2 && req.method === 'PATCH') {
        const body = await readJsonBody(req)
        if (
          typeof body.text !== 'string' &&
          typeof body.pinned !== 'boolean' &&
          typeof body.disabled !== 'boolean'
        ) {
          return sendJson(res, 400, { error: '没有可更新的内容' })
        }
        const item = memory.update(owner, rest[1], body)
        return sendJson(res, 200, { item, count: memory.count(owner) })
      }
      if (rest.length === 2 && req.method === 'DELETE') {
        const removed = memory.remove(owner, rest[1])
        if (!removed) return sendJson(res, 404, { error: '记忆不存在' })
        return sendJson(res, 200, { ok: true, count: memory.count(owner) })
      }
      return sendJson(res, 404, { error: '未知接口' })
    } catch (error) {
      return sendJson(res, error.status || 400, { error: error.message || '记忆操作失败' })
    }
  }

  if (rest[0] === 'notify') {
    if (rest.length === 1 && req.method === 'GET') {
      return sendJson(res, 200, { ...notifier.status(), baseUrl: notifyBaseUrl() })
    }
    if (rest.length === 1 && req.method === 'PATCH') {
      try {
        const body = await readJsonBody(req)
        const current = config.notify || {}
        const nextRaw = {
          ...current,
          ...body,
          channels: Array.isArray(body.channels) ? body.channels : current.channels || [],
        }
        config.notify = { ...nextRaw, ...notifier.update(nextRaw) }
        saveConfig()
        return sendJson(res, 200, { ...notifier.status(), baseUrl: notifyBaseUrl() })
      } catch (error) {
        return sendJson(res, error.status || 400, { error: error.message || '通知设置保存失败' })
      }
    }
    if (rest.length === 2 && rest[1] === 'test' && req.method === 'POST') {
      const body = await readJsonBody(req)
      const result = await notifier.test({
        to: typeof body.to === 'string' ? body.to : '',
        text: typeof body.text === 'string' ? body.text : '',
      })
      return sendJson(res, result.ok ? 200 : 502, result)
    }
    return sendJson(res, 405, { error: '不支持的方法' })
  }

  if (rest[0] === 'permissions' && req.method === 'GET') {
    return sendJson(res, 200, await permissionCatalog())
  }

  if (rest[0] === 'codex' && rest[1] === 'models' && req.method === 'GET') {
    const catalog = codexBridge.currentModels()
    if (catalog.source === 'fallback') void codexBridge.listModels().catch(() => {})
    const selection = resolveCodexSelection({})
    return sendJson(res, 200, {
      models: catalog.models,
      defaultModel: selection.model,
      defaultEffort: selection.effort,
      source: catalog.source || 'cache',
      updatedAt: catalog.updatedAt || 0,
    })
  }

  if (rest[0] === 'codex' && rest[1] === 'status' && req.method === 'GET') {
    return sendJson(res, 200, {
      available: codexAvailable(),
      ready: codexBridge.ready,
      models: codexBridge.currentModels().models.length,
      source: codexBridge.currentModels().source || 'cache',
    })
  }

  if (rest[0] === 'backup' && req.method === 'GET') {
    const projectBackup = projects.export()
    const backup = store.backup(owner)
    res.setHeader('X-Backup-Count', String(backup.count || 0))
    return sendJson(res, 200, {
      ...backup,
      projects: projectBackup.projects,
      memory: memory.export(owner),
      library: library.export(owner),
    })
  }
  if (rest[0] === 'backup' && rest[1] === 'import' && req.method === 'POST') {
    if (activeRuns.size > 0) return sendJson(res, 409, { error: '有任务正在生成，请稍后再导入' })
    const body = await readJsonBody(req, 128 * 1024 * 1024)
    if (!Array.isArray(body.conversations)) return sendJson(res, 400, { error: '备份格式不正确' })
    let projectImport = { imported: 0, map: new Map() }
    let result
    try {
      projectImport = body.projects ? projects.import({ projects: body.projects }) : projectImport
      result = store.import(owner, body, { projectMap: projectImport.map })
    } catch (error) {
      for (const id of projectImport.map.values()) projects.purge(id)
      throw error
    }
    audit.add('backup.import', `导入备份：${result.imported} 段对话`, { conversations: result.imported, projects: projectImport.imported })
    const memories = body.memory ? memory.import(owner, body.memory, { projectMap: projectImport.map, conversationMap: result.conversationMap }) : { imported: 0, skipped: 0 }
    const libraryImport = body.library ? library.import(owner, body.library, { conversationMap: result.conversationMap, messageMap: result.messageMap }) : { imported: 0 }
    const { conversationMap: _conversationMap, messageMap: _messageMap, ...resultPayload } = result
    return sendJson(res, 200, {
      ok: true,
      ...resultPayload,
      projects: projectImport.imported,
      skippedProjects: projectImport.skipped || 0,
      memories,
      library: libraryImport,
    })
  }

  if (rest[0] === 'conversations') {
    if (rest.length === 1) {
      if (req.method === 'GET') {
        const query = url.searchParams.get('q') || ''
        const limit = Number(url.searchParams.get('limit')) || 60
        const offset = Number(url.searchParams.get('offset')) || 0
        const archived = url.searchParams.get('archived') === '1'
        if (url.searchParams.get('trash') === '1') {
          return sendJson(res, 200, { conversations: store.listTrash(owner), total: store.listTrash(owner).length, hasMore: false, nextOffset: 0 })
        }
        const projectId = url.searchParams.get('projectId') || ''
        const unfiled = url.searchParams.get('unfiled') === '1'
        const result = store.list(owner, { query, limit, offset, archived, projectId, unfiled, includeArchived: Boolean(query) && !archived })
        return sendJson(res, 200, {
          conversations: result.items.map((conv) => ({
            ...conv,
            running: activeRuns.has(conv.id) || startingRuns.has(conv.id),
          })),
          total: result.total,
          hasMore: result.hasMore,
          nextOffset: result.nextOffset,
        })
      }
      if (req.method === 'POST') {
        const body = await readJsonBody(req)
        const engine = body.engine === 'codex' ? 'codex' : 'dsr'
        const permission = normalizePermission(body.permission)
        const projectId = typeof body.projectId === 'string' && body.projectId ? body.projectId : null
        if (projectId && (!projects.get(projectId) || projects.get(projectId)?.deletedAt)) {
          return sendJson(res, 400, { error: '项目不存在或已删除' })
        }
        if (projectId && projects.get(projectId)?.archivedAt) {
          return sendJson(res, 409, { error: '项目已归档，请先恢复项目再新建对话' })
        }
        const parentProject = projectId ? projects.get(projectId) : null
        const finalEngine = parentProject?.defaultEngine === 'codex' ? 'codex' : parentProject?.defaultEngine === 'dsr' ? 'dsr' : engine
        const finalPermission = parentProject?.defaultPermission
          ? normalizePermission(parentProject.defaultPermission)
          : permission
        const conv = store.create(owner, { engine: finalEngine, permission: finalPermission, projectId })
        if (finalEngine === 'codex') {
          const selection = resolveCodexSelection({
            codexModel: body.codexModel,
            codexEffort: body.codexEffort,
          })
          conv.codexModel = selection.model
          conv.codexEffort = selection.effort
          store.touch(conv)
        }
        return sendJson(res, 201, { conversation: convSummary(conv) })
      }
      return sendJson(res, 405, { error: '不支持的方法' })
    }
    if (rest.length === 3 && rest[2] === 'restore' && req.method === 'POST') {
      const target = store.get(rest[1])
      if (!target || target.owner !== owner) return sendJson(res, 404, { error: '会话不存在' })
      const restored = store.restore(target.id)
      if (!restored) return sendJson(res, 410, { error: '最近删除已超过 30 天，无法恢复' })
      cancelShareRevoke(target.id)
      audit.add('conversation.restore', `恢复对话：${String(restored.title || '').slice(0, 80)}`, { conversationId: restored.id })
      return sendJson(res, 200, { conversation: convSummary(restored) })
    }
    if (rest.length === 3 && rest[2] === 'purge' && req.method === 'POST') {
      const target = store.get(rest[1])
      if (!target || target.owner !== owner || !target.deletedAt) return sendJson(res, 404, { error: '最近删除里没有这个对话' })
      cancelShareRevoke(target.id)
      shares.revokeAllForConversation(target.id)
      const removedBookmarks = library.removeConversation(owner, target.id)
      const removedMemories = memory.removeConversation(owner, target.id)
      store.purge(target.id)
      audit.add('conversation.purge', `永久删除：${String(target.title || '').slice(0, 80)}`, { conversationId: target.id, removedBookmarks, removedMemories })
      return sendJson(res, 200, { ok: true })
    }
    const conv = ownedConversation(rest[1], res, owner)
    if (!conv) return
    if (rest.length === 2 && req.method === 'GET') {
      const summaryOnly = url.searchParams.get('summary') === '1'
      if (summaryOnly) return sendJson(res, 200, { conversation: convSummary(conv) })
      const totalMessages = conv.messages.length
      const tail = Math.min(Math.max(Number(url.searchParams.get('tail')) || 0, 0), 2000)
      const before = url.searchParams.get('before') || ''
      const fullRequest = url.searchParams.get('full') === '1'
      const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 60, 1), 500)
      let start = 0
      let end = totalMessages
      if (fullRequest) {
        start = 0
        end = totalMessages
      } else if (before) {
        const index = conv.messages.findIndex((msg) => msg.id === before)
        if (index >= 0) {
          end = index
          start = Math.max(0, end - limit)
        }
      } else if (tail > 0) {
        start = Math.max(0, totalMessages - tail)
      }
      const paginated = Boolean(tail || before) && !fullRequest
      const messages = paginated ? limitedMessagePayload(conv.messages.slice(start, end)) : conv.messages.slice(start, end)
      return sendJson(res, 200, {
        conversation: { ...convSummary(conv), messages },
        totalMessages,
        hasEarlier: start > 0,
        start,
      })
    }
    if (rest.length === 2 && req.method === 'DELETE') {
      const run = activeRuns.get(conv.id)
      if (run?.kill) run.kill()
      if (conv.mode === 'native' && conv.dshSessionId) {
        await nativeBridge.archiveSession(conv.dshSessionId)
      }
      store.softRemove(conv.id)
      scheduleShareRevoke(conv.id)
      audit.add('conversation.delete', `移到最近删除：${String(conv.title || '').slice(0, 80)}`, { conversationId: conv.id })
      return sendJson(res, 200, { ok: true, undoUntil: Date.now() + 8000 })
    }
    if (rest.length === 3 && rest[2] === 'duplicate' && req.method === 'POST') {
      const copy = store.duplicate(owner, conv.id)
      if (!copy) return sendJson(res, 409, { error: '无法创建副本' })
      return sendJson(res, 201, { conversation: convSummary(copy) })
    }
    if (rest.length === 2 && req.method === 'PATCH') {
      const body = await readJsonBody(req)
      if (body.engine === 'codex' || body.engine === 'dsr') {
        if (conv.messages.length > 0 || activeRuns.has(conv.id)) {
          return sendJson(res, 409, { error: '已有消息的对话不能切换引擎' })
        }
        conv.engine = body.engine
        if (body.engine === 'codex') {
          conv.mode = 'codex'
          const selection = resolveCodexSelection({
            codexModel: body.codexModel || conv.codexModel,
            codexEffort: body.codexEffort || conv.codexEffort,
          })
          conv.codexModel = selection.model
          conv.codexEffort = selection.effort
        } else if (conv.mode === 'codex') {
          conv.mode = undefined
        }
        store.touch(conv)
      }
      if (conv.engine === 'codex' && (body.codexModel !== undefined || body.codexEffort !== undefined)) {
        const selection = resolveCodexSelection({
          codexModel: body.codexModel !== undefined ? body.codexModel : conv.codexModel,
          codexEffort: body.codexEffort !== undefined ? body.codexEffort : conv.codexEffort,
        })
        const changed = selection.model !== conv.codexModel || selection.effort !== conv.codexEffort
        conv.codexModel = selection.model
        conv.codexEffort = selection.effort
        if (changed) {
          store.touch(conv)
          const run = activeRuns.get(conv.id)
          if (run) run.send({ t: 'meta', model: selection.modelName, effort: selection.effortName })
        }
      }
      if (typeof body.title === 'string') {
        const title = body.title.replace(/\s+/g, ' ').trim()
        if (!title) return sendJson(res, 400, { error: '标题不能为空' })
        if ([...title].length > 60) return sendJson(res, 400, { error: '标题最多 60 个字符' })
        conv.title = title
        store.touch(conv)
        if (conv.engine === 'codex' && conv.codexThreadId) {
          void codexBridge.setThreadName(conv.codexThreadId, title)
        }
      }
      if (typeof body.pinned === 'boolean') {
        conv.pinned = body.pinned
        store.touch(conv)
      }
      if (body.noMemory !== undefined) {
        conv.noMemory = body.noMemory === true
        store.touch(conv)
      }
      if (body.projectId !== undefined) {
        const projectId = typeof body.projectId === 'string' && body.projectId ? body.projectId : null
        if (projectId && (!projects.get(projectId) || projects.get(projectId)?.deletedAt)) {
          return sendJson(res, 400, { error: '项目不存在或已删除' })
        }
        if (projectId && projects.get(projectId)?.archivedAt) return sendJson(res, 409, { error: '项目已归档，不能把对话移入' })
        if (conv.projectId !== projectId) {
          conv.projectId = projectId
          store.touch(conv)
        }
      }
      if (typeof body.archived === 'boolean') {
        store.archive(conv.id, body.archived)
      }
      if (typeof body.permission === 'string') {
        const permission = normalizePermission(body.permission)
        if (permission !== conv.permission) {
          const previousPermission = conv.permission
          conv.permission = permission
          store.touch(conv)
          audit.add('permission.change', `权限 ${previousPermission} → ${permission}`, { conversationId: conv.id })
          const run = activeRuns.get(conv.id)
          if (run) {
            if (conv.mode !== 'codex' && conv.dshSessionId) {
              void nativeBridge.setPermission(conv.dshSessionId, permission).catch(() => {})
            }
            if (conv.mode === 'headless') {
              // A headless child's sandbox mode is fixed at spawn. Be explicit
              // instead of letting the chip imply the running turn changed.
              run.send({ t: 'notice', text: '权限已保存，将在下一条消息生效（当前 headless 任务继续使用启动时的权限）。' })
            } else {
              run.send({ t: 'permission', permission })
            }
          }
        }
      }
      return sendJson(res, 200, { conversation: convSummary(conv) })
    }
    if (rest.length === 3 && rest[2] === 'context' && req.method === 'GET') {
      const project = conv.projectId ? projects.get(conv.projectId) : null
      const memoryDisabled = Boolean(conv.noMemory || project?.memoryOff)
      return sendJson(res, 200, {
        project: project ? { id: project.id, name: project.name, emoji: project.emoji } : null,
        projectBlock: projectPromptBlock(conv),
        memoryBlock: memoryDisabled ? '' : memory.promptBlock(owner, project?.id || null),
        memoryDisabled,
        memoryCount: memory.count(owner),
        limits: { projectPromptChars: projectPromptBlock(conv).length, memoryPromptChars: memoryDisabled ? 0 : memory.promptBlock(owner, project?.id || null).length },
      })
    }
    if (rest.length === 4 && rest[2] === 'messages' && req.method === 'PATCH') {
      const body = await readJsonBody(req)
      const message = conv.messages.find((msg) => msg.id === rest[3] && msg.role === 'assistant')
      if (!message) return sendJson(res, 404, { error: '回答不存在' })
      const text = typeof body.text === 'string' ? body.text.trim() : ''
      if (!text) return sendJson(res, 400, { error: '回答不能为空' })
      if ([...text].length > MAX_PROMPT) return sendJson(res, 400, { error: '回答过长' })
      const previous = versionSnapshot(message)
      message.versions = [...(Array.isArray(message.versions) ? message.versions : []), previous].slice(-30)
      message.text = text
      // Manual wording edits keep the original block order: replace the first
      // text block in place and preserve tool/thinking blocks around it.
      const rebuilt = []
      let placed = false
      for (const block of Array.isArray(message.blocks) ? message.blocks : []) {
        if (!block) continue
        if (block.type === 'text') {
          if (!placed) {
            rebuilt.push({ type: 'text', text })
            placed = true
          }
          continue
        }
        rebuilt.push(block)
      }
      if (!placed) rebuilt.unshift({ type: 'text', text })
      message.blocks = rebuilt
      message.editedAt = Date.now()
      message.status = 'done'
      message.error = null
      message.completedAt = Date.now()
      store.touch(conv)
      audit.add('message.edit', '手动编辑回答', { conversationId: conv.id, messageId: message.id })
      return sendJson(res, 200, { ok: true, messageId: message.id })
    }
    if (rest.length === 5 && rest[2] === 'messages' && rest[4] === 'tool' && req.method === 'GET') {
      const message = conv.messages.find((msg) => msg.id === rest[3])
      if (!message) return sendJson(res, 404, { error: '消息不存在' })
      const callId = url.searchParams.get('callId') || ''
      const block = (message.blocks || []).find((item) => item && item.type === 'tool' && item.id === callId)
      if (!block) return sendJson(res, 404, { error: '工具调用不存在' })
      return sendJson(res, 200, { tool: block.tool, input: block.input ?? null, result: block.result ?? null })
    }
    if (rest.length === 7 && rest[2] === 'messages' && rest[4] === 'versions' && rest[6] === 'activate' && req.method === 'POST') {
      const message = conv.messages.find((msg) => msg.id === rest[3] && msg.role === 'assistant')
      if (!message) return sendJson(res, 404, { error: '回答不存在' })
      const versions = Array.isArray(message.versions) ? message.versions : []
      const index = versions.findIndex((version) => version.id === rest[5])
      if (index < 0) return sendJson(res, 404, { error: '版本不存在或已被清理' })
      const current = versionSnapshot(message)
      const selected = versions[index]
      restoreVersion(message, selected)
      const remaining = versions.filter((_, itemIndex) => itemIndex !== index)
      remaining.splice(Math.min(index, remaining.length), 0, current)
      message.versions = remaining.slice(0, 30)
      store.touch(conv)
      return sendJson(res, 200, { ok: true, messageId: message.id })
    }
    if (rest.length === 3 && rest[2] === 'fork' && req.method === 'POST') {
      const body = await readJsonBody(req)
      const messageId = typeof body.messageId === 'string' ? body.messageId : ''
      if (!messageId) return sendJson(res, 400, { error: '缺少要分叉的消息' })
      try {
        const copy = store.fork(owner, conv.id, messageId)
        if (!copy) return sendJson(res, 404, { error: '要分叉的消息不存在' })
        return sendJson(res, 201, { conversation: convSummary(copy) })
      } catch (error) {
        return sendJson(res, error.status || 400, { error: error.message || '分叉失败' })
      }
    }
    if (rest.length === 3 && rest[2] === 'share' && req.method === 'POST') {
      const body = await readJsonBody(req)
      try {
        const project = conv.projectId ? projects.get(conv.projectId) : null
        const created = shares.create({
          conversation: conv,
          owner,
          expiresInDays: body.expiresInDays,
          includeTools: body.includeTools === true,
          includeThinking: body.includeThinking === true,
          messageIds: Array.isArray(body.messageIds) ? body.messageIds : [],
          allowSensitive: body.allowSensitive === true,
          redactSensitive: body.redactSensitive === true,
          password: typeof body.password === 'string' ? body.password : '',
        })
        audit.add('share.create', `创建只读分享：${String(conv.title || '').slice(0, 80)}`, { conversationId: conv.id, shareId: created.share.id, expiresAt: created.share.expiresAt })
        const base = publicBaseUrl(req)
        return sendJson(res, 201, {
          share: created.share,
          token: created.token,
          url: `${base}/s/${created.token}`,
        })
      } catch (error) {
        return sendJson(res, error.status || 400, { error: error.message || '创建分享失败', sensitive: Number(error.sensitive) || 0 })
      }
    }
    if (rest.length === 3 && rest[2] === 'chat' && req.method === 'POST') {
      return handleChat(req, res, owner, rest[1])
    }
    if (rest.length === 3 && rest[2] === 'stop' && req.method === 'POST') {
      const run = activeRuns.get(conv.id)
      if (run?.kill) run.kill()
      return sendJson(res, 200, { ok: true })
    }
    if (rest.length === 3 && rest[2] === 'open-codex' && req.method === 'POST') {
      const threadId = safeCodexId(conv.codexThreadId)
      if (!threadId) return sendJson(res, 409, { error: '这个 Codex 对话还没有创建会话，请先发送一条消息' })
      if (process.platform !== 'darwin') return sendJson(res, 501, { error: '当前系统不支持直接打开 Codex 桌面端' })
      const deepLink = `codex://threads/${threadId}`
      try {
        const child = spawn('open', [deepLink], { detached: true, stdio: 'ignore' })
        child.on('error', () => {})
        child.unref()
      } catch (error) {
        return sendJson(res, 500, { error: `无法打开 Codex：${error.message}` })
      }
      return sendJson(res, 200, { ok: true, deepLink })
    }
    if (rest.length === 3 && rest[2] === 'approval' && req.method === 'POST') {
      const body = await readJsonBody(req)
      const requestId = typeof body.requestId === 'string' ? body.requestId : ''
      const decision = typeof body.decision === 'string' ? body.decision : ''
      if (!requestId || !['allow', 'allow-always', 'allow-full', 'reject'].includes(decision)) {
        return sendJson(res, 400, { error: '授权参数不完整' })
      }
      const interaction = pendingInteractions.get(requestId)
      if (interaction && interaction.run.convId !== conv.id) {
        return sendJson(res, 403, { error: '授权不属于当前对话' })
      }
      const codex = conv.mode === 'codex' || conv.engine === 'codex'
      if (!codex && !NATIVE_ENABLED) return sendJson(res, 409, { error: '当前模式不支持授权' })
      const allowAlways = decision === 'allow-always' || decision === 'allow-full'
      try {
        if (codex) {
          const run = activeRuns.get(conv.id)
          if (!run?.answerApproval || !run.answerApproval(requestId, decision)) {
            throw new Error('授权已失效，请重新发起')
          }
        } else {
          await nativeBridge.answerApproval(requestId, decision)
        }
        markInteractionResolved(requestId)
        audit.add('approval.decision', `授权决定：${decision}`, { conversationId: conv.id, requestId })
        if (allowAlways && !codex) {
          conv.permission = 'danger-full-access'
          store.touch(conv)
          const run = activeRuns.get(conv.id)
          if (run) run.send({ t: 'permission', permission: conv.permission })
        }
        return sendJson(res, 200, { ok: true, permission: conv.permission })
      } catch (error) {
        if (/失效|不存在|not.*pending|unknown|过期/i.test(error.message || '')) {
          markInteractionResolved(requestId, { broadcast: false })
        }
        return sendJson(res, 409, { error: error.message || '授权已失效' })
      }
    }
    if (rest.length === 3 && rest[2] === 'attach' && req.method === 'GET') {
      const run = activeRuns.get(conv.id)
      if (!run) return sendJson(res, 409, { error: '当前没有正在生成的回复' })
      securityHeaders(res)
      res.writeHead(200, {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
        Connection: 'keep-alive',
      })
      if (res.socket) res.socket.setNoDelay(true)
      run.subscribe(res, { reset: true })
      return
    }
    if (rest.length === 3 && rest[2] === 'files' && req.method === 'GET') {
      const root = conversationRoot(conv)
      return sendJson(res, 200, { files: root ? scanWorkspace(root) : [] })
    }
    if (rest.length === 4 && rest[2] === 'files' && rest[3] === 'raw' && req.method === 'GET') {
      return serveConversationFile(req, res, conv, url)
    }
    if (rest.length === 4 && rest[2] === 'files' && rest[3] === 'delete' && req.method === 'POST') {
      const body = await readJsonBody(req)
      const root = conversationRoot(conv)
      if (!root) return sendJson(res, 404, { error: '对话没有工作区' })
      let file
      try {
        file = resolveWorkspaceFile(root, String(body.path || ''))
      } catch (error) {
        return sendJson(res, 400, { error: error.message })
      }
      try {
        fs.rmSync(file.absolute, { force: true })
      } catch (error) {
        return sendJson(res, 500, { error: `删除失败：${error.message}` })
      }
      return sendJson(res, 200, { ok: true })
    }
    if (rest.length === 3 && rest[2] === 'upload' && req.method === 'POST') {
      const declared = Number(req.headers['content-length'])
      if (Number.isFinite(declared) && declared > MAX_UPLOAD) {
        return sendJson(res, 413, { error: '单个文件不能超过 25MB' })
      }
      const name = sanitizeUploadName(url.searchParams.get('name'))
      const directory = await ensureUploadWorkspace(conv)
      const destination = uploadDestination(directory, name)
      const { target } = await readUploadTo(req, destination.target)
      const stat = fs.statSync(target)
      const relative = path.relative(directory, target).split(path.sep).join('/')
      return sendJson(res, 201, {
        file: {
          path: relative,
          name: path.basename(target),
          size: stat.size,
          mtime: stat.mtimeMs,
          kind: fileKind(target),
        },
      })
    }
    if (rest.length === 3 && rest[2] === 'answer' && req.method === 'POST') {
      const codex = conv.mode === 'codex' || conv.engine === 'codex'
      if (!codex && conv.mode !== 'native') {
        return sendJson(res, 409, { error: '这个对话不是原生模式，无法回答问题' })
      }
      const body = await readJsonBody(req)
      const requestId = typeof body.requestId === 'string' ? body.requestId : ''
      const answers = Array.isArray(body.answers) ? body.answers : null
      if (!requestId || !answers) return sendJson(res, 400, { error: '回答参数不完整' })
      const interaction = pendingInteractions.get(requestId)
      if (interaction && interaction.run.convId !== conv.id) {
        return sendJson(res, 403, { error: '问题不属于当前对话' })
      }
      try {
        let result
        if (codex) {
          const run = activeRuns.get(conv.id)
          if (!run?.answerQuestion || !run.answerQuestion(requestId, answers)) {
            throw new Error('问题已失效，请重新发起')
          }
          result = { ok: true }
        } else {
          result = await nativeBridge.answerQuestion(requestId, answers)
        }
        markInteractionResolved(requestId)
        return sendJson(res, 200, { ok: true, result })
      } catch (error) {
        if (/失效|不存在|not.*pending|unknown|过期/i.test(error.message || '')) {
          markInteractionResolved(requestId, { broadcast: false })
        }
        return sendJson(res, 409, { error: error.message || '问题已失效，请重新发起' })
      }
    }
    return sendJson(res, 404, { error: '未知接口' })
  }

  return sendJson(res, 404, { error: '未知接口' })
}

const requestHandler = async (req, res) => {
  securityHeaders(res)
  try {
    let url
    try {
      url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
    } catch {
      return sendJson(res, 400, { error: '请求地址无效' })
    }
    if (url.pathname.startsWith('/api/')) {
      const ua = String(req.headers['user-agent'] || '').slice(0, 200)
      const device = crypto.createHash('sha256').update(`${ua}|${req.socket.remoteAddress || ''}`).digest('hex').slice(0, 10)
      return await requestContext.run({ actor: 'owner', device, ip: req.socket.remoteAddress || '' }, () => handleApi(req, res, url))
    }
    if (req.method === 'GET' || req.method === 'HEAD') {
      if (url.pathname === '/css/bundle.css') return serveCssBundle(req, res)
      if (url.pathname === '/c' || url.pathname.startsWith('/c/')) {
        return serveStatic(req, res, '/index.html')
      }
      if (url.pathname === '/s' || url.pathname.startsWith('/s/')) {
        res.setHeader('X-Robots-Tag', 'noindex, nofollow')
        res.setHeader('Cache-Control', 'no-store')
        return serveStatic(req, res, '/share.html')
      }
      return serveStatic(req, res, url.pathname)
    }
    return sendJson(res, 405, { error: '不支持的方法' })
  } catch (err) {
    if (res.headersSent) {
      console.error('[server] stream error:', err)
      try {
        res.end()
      } catch {}
      return
    }
    const status = err.status || 500
    if (status >= 500) console.error('[server]', err)
    return sendJson(res, status, { error: err.message || '服务器内部错误' })
  }
}

const tlsCert = String(config.tlsCert || '').trim()
const tlsKey = String(config.tlsKey || '').trim()
let tlsOptions = null
if (tlsCert && tlsKey) {
  try {
    tlsOptions = { cert: fs.readFileSync(tlsCert), key: fs.readFileSync(tlsKey) }
  } catch (error) {
    console.error(`[server] TLS 证书读取失败，退回 HTTP：${error.message}`)
  }
}
const server = tlsOptions ? https.createServer(tlsOptions, requestHandler) : http.createServer(requestHandler)

server.on('error', (err) => {
  console.error('[server] 监听失败：', err.message)
  process.exit(1)
})

// One process per data directory. Two servers would each keep a full copy of
// conversations.json in memory and silently overwrite each other on save.
const LOCK_PATH = path.join(DATA_DIR, 'server.lock')
function acquireInstanceLock() {
  try {
    if (fs.existsSync(LOCK_PATH)) {
      const raw = fs.readFileSync(LOCK_PATH, 'utf8')
      const info = JSON.parse(raw)
      const pid = Number(info.pid) || 0
      if (pid && pid !== process.pid) {
        let alive = false
        try {
          process.kill(pid, 0)
          alive = true
        } catch {}
        if (alive) {
          console.error(`[server] 已有一个实例在运行（pid ${pid}），为避免会话数据互相覆盖，本次启动退出。`)
          return false
        }
      }
    }
    fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.writeFileSync(LOCK_PATH, JSON.stringify({ pid: process.pid, startedAt: Date.now(), port: config.port }), { mode: 0o600 })
    return true
  } catch (error) {
    // A lock problem must not prevent a single legitimate instance from booting.
    console.error(`[server] 单实例锁检查失败，继续启动：${error.message}`)
    return true
  }
}

function releaseInstanceLock() {
  try {
    if (!fs.existsSync(LOCK_PATH)) return
    const info = JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8'))
    if (Number(info.pid) === process.pid) fs.rmSync(LOCK_PATH, { force: true })
  } catch {}
}

if (!acquireInstanceLock()) process.exit(1)
process.on('exit', releaseInstanceLock)

server.keepAliveTimeout = 65_000
server.headersTimeout = 70_000

server.listen(Number(config.port), config.host, () => {
  const lines = []
  lines.push('')
  lines.push('  DSH Chat 已启动')
  lines.push('  ─────────────────────────────────────────────')
  const scheme = tlsOptions ? 'https' : 'http'
  lines.push(`  本机访问   ${scheme}://127.0.0.1:${config.port}`)
  for (const ip of lanAddresses()) lines.push(`  内网访问   ${scheme}://${ip}:${config.port}`)
  lines.push(`  模型       ${MODEL}`)
  if (AUTH_ENABLED) lines.push('  访问码     见 config.json（已设置，不在日志中打印）')
  if (!tlsOptions) {
    lines.push('  安全提示   当前为明文 HTTP，内网可用但不要直接暴露到公网；需要 HTTPS 请配置 tlsCert/tlsKey')
  }
  lines.push(`  会话数据   ${store.data.conversations.length} 个会话`)
  lines.push(`  长期记忆   ${memory.data.items.length} 条（${memory.settings.enabled ? '已启用' : '已停用'}）`)
  if (!patchInfo.mirrored) {
    lines.push('  注意       未从桌面配置读取到模型，将使用 headless 默认模型')
  }
  lines.push('')
  console.log(lines.join('\n'))
  if (NATIVE_ENABLED) {
    void nativeBridge.available().then((ok) => {
      console.log(
        ok
          ? '  原生桥接   已连接（网页与桌面版共享同一份会话列表）'
          : '  原生桥接   未连接（headless 兜底；安装并重启桌面版后自动连接）',
      )
    })
  }
  if (codexAvailable()) {
    const providerInfo = ensureCodexHttpProvider()
    if (providerInfo.changed) {
      console.log('  Codex 配置 已注册 HTTPS provider（重启 Codex 桌面端后生效）')
    }
    void codexBridge.warm().then((ok) => {
      const catalog = codexBridge.currentModels()
      console.log(
        ok
          ? `  Codex 桥接 已预热（${catalog.models.length} 个模型 · ${catalog.defaultModel || '默认'}）`
          : '  Codex 桥接 预热失败（发送消息时会重试）',
      )
    })
  }
})

async function shutdown(signal) {
  console.log(`\n[server] 收到 ${signal}，正在关闭…`)
  for (const run of activeRuns.values()) {
    try {
      run.kill?.()
    } catch {}
  }
  codexBridge.shutdown()
  await Promise.all([store.flush().catch(() => {}), memory.flush().catch(() => {}), projects.flush().catch(() => {}), shares.flush().catch(() => {}), library.flush().catch(() => {}), audit.flush().catch(() => {})])
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 3000).unref()
}

process.on('unhandledRejection', (error) => {
  console.error('[server] 未处理的 Promise 拒绝（已记录，不退出）：', error?.message || error)
})

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
