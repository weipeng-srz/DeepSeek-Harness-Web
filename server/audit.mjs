import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { DATA_DIR } from './config.mjs'

const STORE_PATH = path.join(DATA_DIR, 'audit.json')
const MAX_ENTRIES = 500

export class AuditLog {
  constructor() {
    this.data = { version: 1, entries: [] }
    this.saveTimer = null
    this.writing = null
    this.load()
  }

  load() {
    try {
      if (fs.existsSync(STORE_PATH)) {
        const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'))
        if (parsed && Array.isArray(parsed.entries)) this.data = parsed
      }
    } catch (error) {
      console.error('[audit] 读取失败:', error.message)
    }
  }

  scheduleSave() {
    if (this.saveTimer) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      void this.flush()
    }, 200)
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

  add(type, summary, meta = {}) {
    const entry = {
      id: 'a_' + crypto.randomBytes(5).toString('hex'),
      at: Date.now(),
      type: String(type || 'event').slice(0, 40),
      summary: String(summary || '').slice(0, 300),
      meta: meta && typeof meta === 'object' ? JSON.parse(JSON.stringify(meta)) : {},
    }
    this.data.entries.unshift(entry)
    if (this.data.entries.length > MAX_ENTRIES) this.data.entries.length = MAX_ENTRIES
    this.scheduleSave()
    return entry
  }

  list(limit = 100) {
    const size = Math.min(Math.max(Number(limit) || 100, 1), 500)
    return this.data.entries.slice(0, size)
  }

  clear() {
    const removed = this.data.entries.length
    this.data.entries = []
    this.scheduleSave()
    return removed
  }
}
