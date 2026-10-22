import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { DATA_DIR, WORKSPACE_ROOT, SHARED_WORKSPACE } from './config.mjs'

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

  assertCapacity(additional = 1) {
    if (this.data.conversations.length + additional > MAX_CONVERSATIONS) {
      throw Object.assign(new Error(`会话已达到 ${MAX_CONVERSATIONS} 个上限，请先导出备份并删除不需要的会话，等待撤销期结束后重试。`), { status: 409 })
    }
  }

  create(owner, options = {}) {
    this.assertCapacity()
    const conv = this.makeConversation(owner, options)
    this.data.conversations.unshift(conv)
    this.scheduleSave()
    return conv
  }

  makeConversation(owner, options = {}) {
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
    return conv
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
    this.assertCapacity()
    const copy = this.makeConversation(owner, { engine: source.engine, permission: source.permission })
    copy.codexModel = source.codexModel || null
    copy.codexEffort = source.codexEffort || null
    if (source.mode) copy.mode = source.mode
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
    const sourceRoot = source.mode === 'native' ? source.nativeCwd || source.workspace : source.workspace
    // Native and Codex runs use this same canonical directory on their next turn.
    const targetRoot = copy.mode === 'headless'
      ? path.join(WORKSPACE_ROOT, copy.id)
      : path.join(SHARED_WORKSPACE, 'chats', copy.id)
    copy.workspace = targetRoot
    if (copy.mode === 'native') copy.nativeCwd = targetRoot
    try {
      if (sourceRoot && fs.existsSync(sourceRoot)) {
        fs.cpSync(sourceRoot, targetRoot, { recursive: true, force: false, errorOnExist: true })
      }
    } catch {
      this.removeWorkspace(copy)
      throw Object.assign(new Error('创建副本失败，文件未能完整复制，请重试。'), { status: 500 })
    }
    this.data.conversations.unshift(copy)
    this.scheduleSave()
    return copy
  }

  import(owner, payload) {
    const invalid = (message) => Object.assign(new Error(message), { status: 400 })
    const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
    if (!isObject(payload) || !Array.isArray(payload.conversations)) throw invalid('备份格式不正确')
    if (payload.version !== undefined && payload.version !== 1) throw invalid('不支持这个备份版本')
    const list = payload.conversations
    if (!list.length) return { imported: 0 }
    this.assertCapacity(list.length)
    // Build the complete import in isolation. No schedule, insertion, or pruning
    // may happen until every conversation and message has been validated.
    const imported = list.map((raw, conversationIndex) => {
      const label = `第 ${conversationIndex + 1} 个会话`
      if (!isObject(raw) || (raw.messages !== undefined && !Array.isArray(raw.messages))) {
        throw invalid(`${label}格式不正确`)
      }
      const conv = this.makeConversation(owner, {
        engine: raw.engine === 'codex' ? 'codex' : 'dsr',
        permission: raw.permission,
      })
      conv.title = `[导入] ${String(raw.title || '对话').slice(0, 50)}`
      conv.createdAt = Number(raw.createdAt) || Date.now()
      conv.updatedAt = Number(raw.updatedAt) || Date.now()
      conv.pinned = raw.pinned === true
      if (Number(raw.archivedAt) > 0) conv.archivedAt = Number(raw.archivedAt)
      conv.codexModel = typeof raw.codexModel === 'string' ? raw.codexModel : null
      conv.codexEffort = typeof raw.codexEffort === 'string' ? raw.codexEffort : null
      conv.messages = (raw.messages || []).map((msg, messageIndex) => {
        if (!isObject(msg) || (msg.blocks !== undefined && !Array.isArray(msg.blocks))) {
          throw invalid(`${label}的第 ${messageIndex + 1} 条消息格式不正确`)
        }
        const cloned = {
          id: messageId(),
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          text: String(msg.text || ''),
          createdAt: Number(msg.createdAt) || Date.now(),
        }
        if (Array.isArray(msg.blocks)) {
          cloned.blocks = msg.blocks.map((block) => {
            if (!isObject(block)) throw invalid(`${label}的消息内容块格式不正确`)
            if (block.type === 'text') return { type: 'text', text: String(block.text || '') }
            if (block.type === 'thinking') return { type: 'thinking', text: String(block.text || '') }
            if (block.type === 'tool') {
              return {
                type: 'tool',
                id: messageId(),
                tool: String(block.tool || 'tool'),
                input: block.input ?? null,
                status: block.status || 'completed',
                result: block.result ?? null,
              }
            }
            return null
          }).filter(Boolean)
        }
        if (msg.role === 'assistant') {
          cloned.status = ['error', 'stopped', 'interrupted', 'done'].includes(msg.status)
            ? msg.status : msg.status === 'running' ? 'interrupted' : 'done'
          cloned.error = typeof msg.error === 'string' ? msg.error : null
          cloned.thinking = typeof msg.thinking === 'string' ? msg.thinking : ''
          cloned.durationMs = Number(msg.durationMs) || null
          cloned.usage = msg.usage || null
          cloned.model = msg.model || null
          cloned.completedAt = Number(msg.completedAt) || null
        }
        return cloned
      })
      return conv
    })
    this.data.conversations.unshift(...imported.reverse())
    this.scheduleSave()
    return { imported: imported.length }
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
