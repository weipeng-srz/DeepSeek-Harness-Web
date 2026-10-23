import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { DATA_DIR } from './config.mjs'

const STORE_PATH = path.join(DATA_DIR, 'audit.json')
const MAX_ENTRIES = 500

export class AuditLog {
  constructor(context = null) {
    this.context = typeof context === 'function' ? context : null
    this.data = { version: 1, entries: [] }
    this.saveTimer = null
    this.writing = null
    this.load()
  }

  load() {
    const quarantine = (reason) => {
      const backup = `${STORE_PATH}.corrupt-${new Date().toISOString().replace(/[:.]/g, '-')}`
      try {
        fs.copyFileSync(STORE_PATH, backup)
        console.error(`[audit] ${reason}；原文件已备份到 ${backup}`)
      } catch (error) {
        console.error(`[audit] ${reason}；备份失败：${error.message}`)
      }
    }
    try {
      if (fs.existsSync(STORE_PATH)) {
        const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'))
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Array.isArray(parsed.entries)) {
          this.data = parsed
        } else {
          quarantine('审计文件结构异常，已按空日志启动')
        }
      }
    } catch (error) {
      quarantine(`读取失败：${error.message}`)
    }
    const usable = (Array.isArray(this.data.entries) ? this.data.entries : [])
      .filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
    if (usable.length !== this.data.entries.length) {
      this.data.entries = usable
      quarantine('跳过损坏的审计记录')
      this.scheduleSave()
    }
  }

  scheduleSave() {
    if (this.saveTimer) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      void this.flush().catch((error) => console.error('[store] 审计数据后台写入失败:', error.message))
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
    try {
      const ctx = this.context?.()
      if (ctx) {
        entry.actor = ctx.actor || 'owner'
        entry.device = ctx.device || ''
      }
    } catch {}
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
