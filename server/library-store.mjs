import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { DATA_DIR } from './config.mjs'

const STORE_PATH = path.join(DATA_DIR, 'library.json')
const MAX_BOOKMARKS = 500
const MAX_PROMPTS = 200

const now = () => Date.now()

function cleanBookmark(item) {
  if (!item || typeof item !== 'object') return null
  const conversationId = String(item.conversationId || '').slice(0, 80)
  const messageId = String(item.messageId || '').slice(0, 80)
  if (!conversationId || !messageId) return null
  return {
    conversationId,
    messageId,
    title: String(item.title || '对话').slice(0, 120),
    text: String(item.text || '').slice(0, 280),
    at: Number(item.at) || now(),
  }
}

function cleanPrompt(item) {
  if (!item || typeof item !== 'object') return null
  const name = String(item.name || '').trim().slice(0, 60)
  const text = String(item.text || '').trim().slice(0, 8000)
  if (!name || !text) return null
  return {
    id: String(item.id || 'p_' + crypto.randomBytes(5).toString('hex')).slice(0, 80),
    name,
    text,
  }
}

export class LibraryStore {
  constructor() {
    this.data = { version: 1, owners: {} }
    this.saveTimer = null
    this.writing = null
    this.load()
  }

  load() {
    try {
      if (fs.existsSync(STORE_PATH)) {
        const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'))
        if (parsed && parsed.owners && typeof parsed.owners === 'object') this.data = parsed
      }
    } catch (error) {
      const backup = `${STORE_PATH}.corrupt-${Date.now()}`
      try {
        fs.copyFileSync(STORE_PATH, backup)
      } catch {}
      console.error(`[library] 读取失败，已备份到 ${backup}:`, error.message)
    }
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
    const run = async () => {
      const payload = JSON.stringify(this.data)
      const tmp = `${STORE_PATH}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`
      try {
        await fs.promises.mkdir(path.dirname(STORE_PATH), { recursive: true })
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

  removeConversation(owner, conversationId) {
    const entry = this.data.owners[owner]
    if (!entry) return 0
    const before = Array.isArray(entry.bookmarks) ? entry.bookmarks.length : 0
    entry.bookmarks = (entry.bookmarks || []).filter((item) => item.conversationId !== conversationId)
    const removed = before - entry.bookmarks.length
    if (removed) this.scheduleSave()
    return removed
  }

  get(owner) {
    const entry = this.data.owners[owner]
    if (!entry) return { bookmarks: [], prompts: [], updatedAt: 0 }
    return {
      bookmarks: Array.isArray(entry.bookmarks) ? entry.bookmarks : [],
      prompts: Array.isArray(entry.prompts) ? entry.prompts : [],
      updatedAt: Number(entry.updatedAt) || 0,
    }
  }

  put(owner, input = {}) {
    const bookmarks = Array.isArray(input.bookmarks)
      ? input.bookmarks.map(cleanBookmark).filter(Boolean).slice(0, MAX_BOOKMARKS)
      : []
    const prompts = Array.isArray(input.prompts)
      ? input.prompts.map(cleanPrompt).filter(Boolean).slice(0, MAX_PROMPTS)
      : []
    this.data.owners[owner] = { bookmarks, prompts, updatedAt: now() }
    this.scheduleSave()
    return this.get(owner)
  }

  export(owner) {
    return this.get(owner)
  }

  import(owner, payload) {
    if (!payload || typeof payload !== 'object') return { imported: 0 }
    const before = this.get(owner)
    const bookmarks = [...before.bookmarks]
    const prompts = [...before.prompts]
    for (const item of Array.isArray(payload.bookmarks) ? payload.bookmarks : []) {
      const clean = cleanBookmark(item)
      if (!clean) continue
      if (!bookmarks.some((entry) => entry.conversationId === clean.conversationId && entry.messageId === clean.messageId)) {
        bookmarks.push(clean)
      }
    }
    for (const item of Array.isArray(payload.prompts) ? payload.prompts : []) {
      const clean = cleanPrompt(item)
      if (!clean) continue
      if (!prompts.some((entry) => entry.id === clean.id || entry.name === clean.name)) prompts.push(clean)
    }
    this.put(owner, { bookmarks, prompts })
    return { imported: bookmarks.length - before.bookmarks.length + prompts.length - before.prompts.length }
  }
}
