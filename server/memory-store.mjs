import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { DATA_DIR } from './config.mjs'
import {
  MEMORY_ITEMS_MAX,
  MEMORY_TEXT_MAX,
  buildMemoryPromptBlock,
  cleanMemoryText,
  extractMemoryCandidates,
  isSensitiveMemory,
  normalizeMemoryText,
} from './memory.mjs'

const MEMORY_PATH = path.join(DATA_DIR, 'memory.json')
const SOURCES = new Set(['manual', 'auto', 'import'])

function memoryError(message, status = 400) {
  const error = new Error(message)
  error.status = status
  return error
}

function sanitizeStoredItem(raw, owner) {
  if (!raw || typeof raw !== 'object') return null
  const text = cleanMemoryText(raw.text)
  if (!text || [...text].length > MEMORY_TEXT_MAX) return null
  if (isSensitiveMemory(text)) return null
  const createdAt = Number(raw.createdAt) || Date.now()
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 80) : `mem_${crypto.randomBytes(8).toString('hex')}`,
    owner: typeof raw.owner === 'string' && raw.owner ? raw.owner : owner,
    text,
    source: SOURCES.has(raw.source) ? raw.source : 'manual',
    conversationId: typeof raw.conversationId === 'string' ? raw.conversationId : null,
    createdAt,
    updatedAt: Number(raw.updatedAt) || createdAt,
    pinned: Boolean(raw.pinned),
    disabled: Boolean(raw.disabled),
  }
}

export class MemoryStore {
  constructor({ filePath = MEMORY_PATH } = {}) {
    this.filePath = filePath
    this.data = {
      version: 1,
      updatedAt: 0,
      settings: { enabled: true, autoCapture: true },
      items: [],
    }
    this.saveTimer = null
    this.writing = null
    this.load()
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'))
        if (parsed && Array.isArray(parsed.items)) {
          this.data = {
            version: 1,
            updatedAt: Number(parsed.updatedAt) || 0,
            settings: {
              enabled: parsed.settings?.enabled !== false,
              autoCapture: parsed.settings?.autoCapture !== false,
            },
            items: parsed.items,
          }
        }
      }
    } catch (error) {
      const backup = `${this.filePath}.corrupt-${Date.now()}`
      try {
        fs.copyFileSync(this.filePath, backup)
      } catch {}
      console.error(`[memory] 读取记忆失败，已备份到 ${backup}:`, error.message)
    }

    let changed = false
    const seen = new Set()
    const items = []
    for (const raw of this.data.items) {
      const item = sanitizeStoredItem(raw, raw?.owner || '')
      if (!item) {
        changed = true
        continue
      }
      const key = `${item.owner}:${normalizeMemoryText(item.text)}`
      if (seen.has(key)) {
        changed = true
        continue
      }
      seen.add(key)
      items.push(item)
    }
    if (items.length > MEMORY_ITEMS_MAX) {
      items.length = MEMORY_ITEMS_MAX
      changed = true
    }
    if (changed || items.length !== this.data.items.length) {
      this.data.items = items
      this.scheduleSave()
    }
  }

  scheduleSave() {
    if (this.saveTimer) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      void this.flush()
    }, 120)
    if (this.saveTimer.unref) this.saveTimer.unref()
  }

  async flush() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    const run = async () => {
      const payload = JSON.stringify(this.data)
      const tmp = `${this.filePath}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`
      try {
        await fs.promises.mkdir(path.dirname(this.filePath), { recursive: true })
        await fs.promises.writeFile(tmp, payload, { encoding: 'utf8', mode: 0o600 })
        await fs.promises.rename(tmp, this.filePath)
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

  get settings() {
    return this.data.settings
  }

  setSettings(patch = {}) {
    let changed = false
    if (typeof patch.enabled === 'boolean' && patch.enabled !== this.data.settings.enabled) {
      this.data.settings.enabled = patch.enabled
      changed = true
    }
    if (typeof patch.autoCapture === 'boolean' && patch.autoCapture !== this.data.settings.autoCapture) {
      this.data.settings.autoCapture = patch.autoCapture
      changed = true
    }
    if (changed) {
      this.data.updatedAt = Date.now()
      this.scheduleSave()
    }
    return { ...this.data.settings }
  }

  list(owner) {
    return this.data.items
      .filter((item) => item.owner === owner)
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt)
  }

  count(owner) {
    return this.data.items.filter((item) => item.owner === owner).length
  }

  /**
   * Find an item that says the same thing, or the same thing plus/minus detail.
   * "我喜欢咖啡" and "我喜欢咖啡，不加糖" must not both occupy the prompt, so
   * the longer phrasing wins and the shorter one is retired in place.
   */
  findNearDuplicate(owner, text, exceptId = '', projectId = null) {
    const key = normalizeMemoryText(text)
    if (!key) return null
    const keyLength = [...key].length
    for (const item of this.data.items) {
      if (item.id === exceptId || item.owner !== owner) continue
      if ((item.projectId || null) !== (projectId || null)) continue
      const other = normalizeMemoryText(item.text)
      if (!other) continue
      if (other === key) return { item, relation: 'same' }
      if (keyLength > [...other].length && [...other].length >= 4 && key.startsWith(other)) {
        return { item, relation: 'longer' }
      }
      if (keyLength >= 4 && [...other].length > keyLength && other.startsWith(key)) {
        return { item, relation: 'shorter' }
      }
    }
    return null
  }

  validateText(owner, value) {
    const text = cleanMemoryText(value)
    if (!text) throw memoryError('记忆内容不能为空')
    const length = [...text].length
    if (length < 2) throw memoryError('记忆内容太短')
    if (length > MEMORY_TEXT_MAX) throw memoryError(`单条记忆最多 ${MEMORY_TEXT_MAX} 个字符`)
    if (isSensitiveMemory(text)) {
      throw memoryError('不要保存密码、密钥、验证码或证件号码')
    }
    return text
  }

  add(owner, value, options = {}) {
    const text = this.validateText(owner, value)
    const near = this.findNearDuplicate(owner, text, '', options.projectId || null)
    if (near) {
      // A longer phrasing of the same fact replaces the shorter one; this is
      // how "我喜欢咖啡" naturally grows into "我喜欢咖啡，不加糖".
      if (near.relation === 'longer') {
        near.item.text = text
        near.item.updatedAt = Date.now()
        this.data.updatedAt = near.item.updatedAt
        this.scheduleSave()
      }
      return { item: near.item, created: false }
    }

    const ownerCount = this.count(owner)
    if (ownerCount >= MEMORY_ITEMS_MAX) {
      const disposable = this.list(owner)
        .filter((item) => !item.pinned)
        .sort((a, b) => a.updatedAt - b.updatedAt)[0]
      if (!disposable) throw memoryError('记忆已满，请先删除一些内容', 409)
      this.data.items = this.data.items.filter((item) => item !== disposable)
    }

    const now = Date.now()
    const item = {
      id: `mem_${crypto.randomBytes(8).toString('hex')}`,
      owner,
      text,
      source: SOURCES.has(options.source) ? options.source : 'manual',
      conversationId: typeof options.conversationId === 'string' ? options.conversationId : null,
      projectId: typeof options.projectId === 'string' && options.projectId ? options.projectId : null,
      createdAt: now,
      updatedAt: now,
      pinned: false,
      disabled: false,
    }
    this.data.items.unshift(item)
    this.data.updatedAt = now
    this.scheduleSave()
    return { item, created: true }
  }

  update(owner, id, patch = {}) {
    const item = this.data.items.find((entry) => entry.id === id && entry.owner === owner)
    if (!item) throw memoryError('记忆不存在', 404)
    let changed = false
    if (typeof patch.text === 'string') {
      const text = this.validateText(owner, patch.text)
      if (text !== item.text) {
        const conflict = this.findNearDuplicate(owner, text, item.id, item.projectId || null)
        if (conflict) throw memoryError('已经有一条相似的记忆了', 409)
        item.text = text
        changed = true
      }
    }
    if (typeof patch.pinned === 'boolean' && patch.pinned !== item.pinned) {
      item.pinned = patch.pinned
      changed = true
    }
    if (typeof patch.disabled === 'boolean' && patch.disabled !== item.disabled) {
      item.disabled = patch.disabled
      changed = true
    }
    if (changed) {
      item.updatedAt = Date.now()
      this.data.updatedAt = item.updatedAt
      this.scheduleSave()
    }
    return item
  }

  remove(owner, id) {
    const index = this.data.items.findIndex((entry) => entry.id === id && entry.owner === owner)
    if (index < 0) return false
    this.data.items.splice(index, 1)
    this.data.updatedAt = Date.now()
    this.scheduleSave()
    return true
  }

  removeProject(owner, projectId) {
    const before = this.data.items.length
    this.data.items = this.data.items.filter(
      (item) => !(item.owner === owner && item.projectId === projectId),
    )
    const removed = before - this.data.items.length
    if (removed) {
      this.data.updatedAt = Date.now()
      this.scheduleSave()
    }
    return removed
  }

  removeConversation(owner, conversationId) {
    const before = this.data.items.length
    this.data.items = this.data.items.filter(
      (item) => !(item.owner === owner && item.conversationId === conversationId),
    )
    const removed = before - this.data.items.length
    if (removed) {
      this.data.updatedAt = Date.now()
      this.scheduleSave()
    }
    return removed
  }

  clear(owner) {
    const before = this.data.items.length
    this.data.items = this.data.items.filter((entry) => entry.owner !== owner)
    const removed = before - this.data.items.length
    if (removed) {
      this.data.updatedAt = Date.now()
      this.scheduleSave()
    }
    return removed
  }

  capture(owner, text, conversationId = null, projectId = null) {
    if (!this.data.settings.enabled || !this.data.settings.autoCapture) return []
    const candidates = extractMemoryCandidates(text)
    if (!candidates.length) return []
    const saved = []
    for (const candidate of candidates) {
      try {
        // add() already folds an exact or prefix duplicate into the existing
        // item, so only genuinely new facts are announced to the UI.
        const { item, created } = this.add(owner, candidate, {
          source: 'auto',
          conversationId,
          projectId,
        })
        if (created) saved.push(item)
      } catch {
        // A rejected candidate (credentials, size, full store) must never
        // break the chat that is already streaming.
      }
    }
    return saved
  }

  promptBlock(owner, projectId = null) {
    if (!this.data.settings.enabled) return ''
    return buildMemoryPromptBlock(
      this.list(owner).filter((item) =>
        !item.disabled && (!item.projectId || (projectId && item.projectId === projectId)),
      ),
    )
  }

  candidatesFor(owner, conversation) {
    const seen = new Set(this.list(owner).map((item) => normalizeMemoryText(item.text)))
    const candidates = []
    const messages = (conversation?.messages || []).filter(
      (message) => message.role === 'user' && !message.internal && typeof message.text === 'string',
    )
    for (let index = messages.length - 1; index >= 0 && candidates.length < 8; index -= 1) {
      const text = messages[index].text
      if ([...text].length > 800) continue
      for (const candidate of extractMemoryCandidates(text)) {
        const key = normalizeMemoryText(candidate)
        if (!key || seen.has(key)) continue
        seen.add(key)
        candidates.push(candidate)
        if (candidates.length >= 8) break
      }
    }
    return candidates
  }

  export(owner) {
    return {
      version: 1,
      exportedAt: Date.now(),
      settings: { ...this.data.settings },
      items: this.list(owner).map((item) => ({ ...item })),
    }
  }

  import(owner, payload, options = {}) {
    const list = Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : []
    let imported = 0
    let skipped = 0
    for (const raw of list.slice(0, MEMORY_ITEMS_MAX * 2)) {
      const text = cleanMemoryText(raw?.text)
      if (!text || isSensitiveMemory(text)) {
        skipped += 1
        continue
      }
      try {
        const { item, created } = this.add(owner, text, {
          source: raw?.source === 'auto' ? 'auto' : 'import',
          conversationId: raw?.conversationId,
        })
        if (!created) {
          skipped += 1
          continue
        }
        item.createdAt = Number(raw?.createdAt) || item.createdAt
        item.updatedAt = Number(raw?.updatedAt) || item.updatedAt
        item.pinned = Boolean(raw?.pinned)
        item.disabled = Boolean(raw?.disabled)
        const rawProjectId = typeof raw?.projectId === 'string' ? raw.projectId : ''
        item.projectId = rawProjectId ? (options.projectMap?.get(rawProjectId) || null) : null
        imported += 1
      } catch {
        skipped += 1
      }
    }
    if (imported) this.data.updatedAt = Date.now()
    this.scheduleSave()
    return { imported, skipped }
  }
}
