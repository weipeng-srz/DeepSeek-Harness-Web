import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { DATA_DIR, WORKSPACE_ROOT } from './config.mjs'

const STORE_PATH = path.join(DATA_DIR, 'conversations.json')
const MAX_CONVERSATIONS = 300
const DEFAULT_PERMISSION = 'workspace-write'
const PERMISSION_VALUES = new Set(['read-only', 'workspace-write', 'danger-full-access'])
export const UNDO_WINDOW_MS = 8000

const now = () => Date.now()
const messageId = () => 'm_' + crypto.randomBytes(8).toString('hex')

function stripMarkdown(value) {
  return String(value || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^[\s]*[-*+]\s+/gm, ' ')
    .replace(/[#>*_~|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function snippetAround(text, query, radius = 42) {
  const clean = stripMarkdown(text)
  if (!clean) return ''
  const at = clean.toLowerCase().indexOf(query.toLowerCase())
  if (at < 0) return clean.slice(0, radius * 2)
  const start = Math.max(0, at - radius)
  const end = Math.min(clean.length, at + query.length + radius)
  return `${start > 0 ? '…' : ''}${clean.slice(start, end)}${end < clean.length ? '…' : ''}`
}

export class ConversationStore {
  constructor() {
    this.data = { version: 1, conversations: [] }
    this.saveTimer = null
    this.writing = null
    this.purgeTimer = null
    this.load()
    this.schedulePurge()
  }

  load() {
    try {
      if (fs.existsSync(STORE_PATH)) {
        const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'))
        if (parsed && Array.isArray(parsed.conversations)) this.data = parsed
      }
    } catch (err) {
      const backup = `${STORE_PATH}.corrupt-${Date.now()}`
      try {
        fs.copyFileSync(STORE_PATH, backup)
      } catch {}
      console.error(`[store] 读取会话数据失败，已备份到 ${backup}:`, err.message)
    }
    let changed = false
    for (const conv of this.data.conversations) {
      if (conv.engine !== 'codex') conv.engine = 'dsr'
      if (!PERMISSION_VALUES.has(conv.permission)) {
        conv.permission = DEFAULT_PERMISSION
        changed = true
      }
      if (conv.pinned) conv.pinned = true
      else if ('pinned' in conv) {
        delete conv.pinned
        changed = true
      }
      if (conv.archivedAt) conv.archivedAt = Number(conv.archivedAt) || Date.now()
      if (conv.deletedAt && Date.now() - conv.deletedAt > UNDO_WINDOW_MS) {
        conv.__purge = true
      }
      for (const msg of conv.messages || []) {
        if (msg.status === 'running') {
          msg.status = 'interrupted'
          msg.error = msg.error || '服务重启，生成被中断'
          changed = true
        }
        if (!Array.isArray(msg.attachments)) delete msg.attachments
      }
    }
    const purged = this.data.conversations.filter((conv) => conv.__purge)
    if (purged.length) {
      this.data.conversations = this.data.conversations.filter((conv) => !conv.__purge)
      for (const conv of purged) this.removeWorkspace(conv)
      changed = true
    }
    if (changed) this.scheduleSave()
  }

  scheduleSave() {
    if (this.saveTimer) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      void this.flush()
    }, 150)
    if (this.saveTimer.unref) this.saveTimer.unref()
  }

  async flush() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    // Serialize flushes. A single shared `.tmp` path plus two overlapping
    // flushes causes the second rename to fail with ENOENT, so each write
    // gets its own temp name and all writes run through one promise chain.
    const run = async () => {
      const payload = JSON.stringify(this.data)
      const tmp = `${STORE_PATH}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`
      try {
        await fs.promises.writeFile(tmp, payload, { encoding: 'utf8', mode: 0o600 })
        await fs.promises.rename(tmp, STORE_PATH)
      } catch (error) {
        try {
          await fs.promises.rm(tmp, { force: true })
        } catch {}
        throw error
      }
    }
    const previous = this.writing || Promise.resolve()
    this.writing = previous.catch(() => {}).then(run)
    const current = this.writing
    await current.finally(() => {
      if (this.writing === current) this.writing = null
    })
  }

  setOwner(owner) {
    let changed = false
    for (const conv of this.data.conversations) {
      if (conv.owner !== owner) {
        conv.owner = owner
        changed = true
      }
    }
    if (changed) this.scheduleSave()
    return changed
  }

  schedulePurge() {
    if (this.purgeTimer) clearInterval(this.purgeTimer)
    this.purgeTimer = setInterval(() => this.purgeExpired(), 2000)
    if (this.purgeTimer.unref) this.purgeTimer.unref()
  }

  purgeExpired() {
    const expired = this.data.conversations.filter(
      (conv) => conv.deletedAt && Date.now() - conv.deletedAt > UNDO_WINDOW_MS,
    )
    if (!expired.length) return false
    this.data.conversations = this.data.conversations.filter((conv) => !expired.includes(conv))
    for (const conv of expired) this.removeWorkspace(conv)
    this.scheduleSave()
    return true
  }

  create(owner, options = {}) {
    const id = crypto.randomUUID()
    const engine = options.engine === 'codex' ? 'codex' : 'dsr'
    const conv = {
      id,
      owner,
      title: '新对话',
      pinned: false,
      engine,
      permission: PERMISSION_VALUES.has(options.permission) ? options.permission : DEFAULT_PERMISSION,
      createdAt: now(),
      updatedAt: now(),
      dshSessionId: null,
      codexThreadId: null,
      codexModel: null,
      codexEffort: null,
      workspace: path.join(WORKSPACE_ROOT, id),
      messages: [],
    }
    this.data.conversations.unshift(conv)
    this.prune()
    this.scheduleSave()
    return conv
  }

  prune() {
    const list = this.data.conversations
    if (list.length <= MAX_CONVERSATIONS) return
    const excess = list.splice(MAX_CONVERSATIONS)
    for (const conv of excess) this.removeWorkspace(conv)
  }

  removeWorkspace(conv) {
    if (!conv.workspace) return
    const resolved = path.resolve(conv.workspace)
    const roots = [
      path.resolve(WORKSPACE_ROOT) + path.sep,
      path.resolve(DATA_DIR, 'workspace', 'chats') + path.sep,
    ]
    if (!roots.some((root) => resolved.startsWith(root))) return
    try {
      fs.rmSync(resolved, { recursive: true, force: true })
    } catch {}
  }

  list(owner, options = {}) {
    const query = typeof options.query === 'string' ? options.query.trim() : ''
    const limit = Math.min(Math.max(Number(options.limit) || 60, 1), 100)
    const offset = Math.max(Number(options.offset) || 0, 0)
    const lower = query.toLowerCase()
    const wantArchived = Boolean(options.archived)
    const active = this.data.conversations.filter(
      (conv) =>
        conv.owner === owner &&
        !conv.deletedAt &&
        (wantArchived ? Boolean(conv.archivedAt) : !conv.archivedAt),
    )

    let matches = active
    if (query) {
      matches = []
      for (const conv of active) {
        const title = String(conv.title || '')
        let score = 0
        let snippet = ''
        if (title.toLowerCase().includes(lower)) {
          score += 4
          // The title is already rendered and highlighted in the row; do not
          // repeat it as the snippet. Only a body hit earns a context line.
        }
        for (const msg of conv.messages || []) {
          if (!msg.text) continue
          if (String(msg.text).toLowerCase().includes(lower)) {
            score += msg.role === 'user' ? 2 : 1
            if (!snippet) snippet = snippetAround(msg.text, query)
          }
        }
        if (score > 0) {
          conv.__score = score
          conv.__snippet = snippet
          matches.push(conv)
        }
      }
      matches.sort((a, b) => b.__score - a.__score || b.updatedAt - a.updatedAt)
    } else {
      matches.sort((a, b) => {
        const pin = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))
        if (pin) return pin
        return b.updatedAt - a.updatedAt
      })
    }

    const total = matches.length
    const slice = matches.slice(offset, offset + limit)
    const items = slice.map((conv) => {
      const item = {
        id: conv.id,
        title: conv.title,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
        engine: conv.engine === 'codex' ? 'codex' : 'dsr',
        permission: conv.permission || DEFAULT_PERMISSION,
        messageCount: conv.messages.length,
        preview: previewOf(conv),
        pinned: Boolean(conv.pinned),
        archived: Boolean(conv.archivedAt),
      }
      if (query) item.snippet = conv.__snippet || ''
      return item
    })
    for (const conv of matches) {
      delete conv.__score
      delete conv.__snippet
    }
    return {
      items,
      total,
      hasMore: offset + items.length < total,
      nextOffset: offset + items.length,
    }
  }

  get(id) {
    return this.data.conversations.find((conv) => conv.id === id) || null
  }

  remove(id) {
    const index = this.data.conversations.findIndex((conv) => conv.id === id)
    if (index < 0) return false
    const [conv] = this.data.conversations.splice(index, 1)
    this.removeWorkspace(conv)
    this.scheduleSave()
    return true
  }

  softRemove(id) {
    const conv = this.get(id)
    if (!conv) return null
    conv.deletedAt = now()
    this.scheduleSave()
    return conv
  }

  restore(id) {
    const conv = this.get(id)
    if (!conv || !conv.deletedAt) return null
    if (Date.now() - conv.deletedAt > UNDO_WINDOW_MS) return null
    delete conv.deletedAt
    conv.updatedAt = now()
    this.scheduleSave()
    return conv
  }

  archive(id, archived = true) {
    const conv = this.get(id)
    if (!conv) return null
    if (archived) conv.archivedAt = now()
    else delete conv.archivedAt
    this.scheduleSave()
    return conv
  }

  duplicate(owner, id) {
    const source = this.get(id)
    if (!source || source.owner !== owner || source.deletedAt) return null
    const copy = this.create(owner, { engine: source.engine, permission: source.permission })
    copy.title = `${source.title || '新对话'} 副本`
    copy.pinned = false
    copy.messages = (source.messages || []).map((msg) => {
      const cloned = JSON.parse(JSON.stringify(msg))
      cloned.id = messageId()
      if (cloned.blocks) {
        for (const block of cloned.blocks) {
          if (block && typeof block === 'object' && block.type === 'tool') block.id = messageId()
        }
      }
      cloned.status = cloned.status === 'running' ? 'interrupted' : cloned.status
      return cloned
    })
    const sourceRoot = source.workspace
    const targetRoot = path.join(WORKSPACE_ROOT, copy.id)
    try {
      if (sourceRoot && fs.existsSync(sourceRoot)) {
        fs.cpSync(sourceRoot, targetRoot, { recursive: true, force: false })
        copy.workspace = targetRoot
      }
    } catch {}
    this.scheduleSave()
    return copy
  }

  import(owner, payload) {
    const list = Array.isArray(payload?.conversations) ? payload.conversations : []
    if (!list.length) return { imported: 0 }
    let imported = 0
    for (const raw of list.slice(0, 100)) {
      if (!raw || typeof raw !== 'object') continue
      const conv = this.create(owner, {
        engine: raw.engine === 'codex' ? 'codex' : 'dsr',
        permission: raw.permission,
      })
      conv.title = `[导入] ${String(raw.title || '对话').slice(0, 50)}`
      conv.createdAt = Number(raw.createdAt) || Date.now()
      conv.updatedAt = Number(raw.updatedAt) || Date.now()
      conv.messages = (Array.isArray(raw.messages) ? raw.messages : []).slice(-400).map((msg) => {
        const cloned = {
          id: messageId(),
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          text: String(msg.text || '').slice(0, 200_000),
          createdAt: Number(msg.createdAt) || Date.now(),
        }
        if (Array.isArray(msg.blocks)) {
          cloned.blocks = msg.blocks.slice(0, 200).map((block) => {
            if (!block || typeof block !== 'object') return null
            if (block.type === 'text') return { type: 'text', text: String(block.text || '') }
            if (block.type === 'thinking') return { type: 'thinking', text: String(block.text || '') }
            if (block.type === 'tool') {
              return {
                type: 'tool',
                id: messageId(),
                tool: String(block.tool || 'tool'),
                input: block.input ?? null,
                status: block.status || 'completed',
                result: typeof block.result === 'string' ? block.result.slice(0, 20_000) : block.result,
              }
            }
            return null
          }).filter(Boolean)
        }
        if (msg.role === 'assistant') {
          cloned.status = msg.status === 'error' ? 'error' : 'done'
          cloned.durationMs = Number(msg.durationMs) || null
          cloned.usage = msg.usage || null
          cloned.model = msg.model || null
          cloned.completedAt = Number(msg.completedAt) || null
        }
        return cloned
      })
      imported += 1
    }
    this.scheduleSave()
    return { imported }
  }

  backup(owner) {
    const conversations = this.data.conversations.filter(
      (conv) => conv.owner === owner && !conv.deletedAt,
    )
    return {
      version: 1,
      exportedAt: Date.now(),
      count: conversations.length,
      conversations: JSON.parse(JSON.stringify(conversations)),
    }
  }

  touch(conv) {
    conv.updatedAt = now()
    const index = this.data.conversations.indexOf(conv)
    if (index > 0) {
      this.data.conversations.splice(index, 1)
      this.data.conversations.unshift(conv)
    }
    this.scheduleSave()
  }

  titleFrom(text) {
    const cleaned = String(text).replace(/\s+/g, ' ').trim()
    if (!cleaned) return '新对话'
    const chars = [...cleaned]
    return chars.length > 26 ? chars.slice(0, 26).join('') + '…' : cleaned
  }
}

function previewOf(conv) {
  for (let i = conv.messages.length - 1; i >= 0; i -= 1) {
    const msg = conv.messages[i]
    if (msg.role === 'assistant' && msg.text) return stripMarkdown(msg.text).slice(0, 96)
    if (msg.role === 'user' && msg.text) return stripMarkdown(msg.text).slice(0, 96)
  }
  return ''
}
