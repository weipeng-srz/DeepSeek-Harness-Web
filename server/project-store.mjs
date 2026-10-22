import path from 'node:path'
import crypto from 'node:crypto'
import fs from 'node:fs'
import { DATA_DIR } from './config.mjs'

const STORE_PATH = path.join(DATA_DIR, 'projects.json')
const MAX_PROJECTS = 100
const NAME_MAX = 40
const INSTRUCTIONS_MAX = 4000
const NOTES_MAX = 8000
const COLORS = new Set(['blue', 'violet', 'green', 'orange', 'pink', 'graphite'])

const now = () => Date.now()
const projectId = () => 'p_' + crypto.randomBytes(6).toString('hex')
const text = (value, max) => String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max)

function normalizeColor(value) {
  return COLORS.has(value) ? value : 'blue'
}

function normalizeEmoji(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return '📁'
  return [...raw].slice(0, 2).join('')
}

export class ProjectStore {
  constructor() {
    this.data = { version: 1, projects: [] }
    this.saveTimer = null
    this.writing = null
    this.load()
  }

  load() {
    try {
      if (fs.existsSync(STORE_PATH)) {
        const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'))
        if (parsed && Array.isArray(parsed.projects)) this.data = parsed
      }
    } catch (error) {
      const backup = `${STORE_PATH}.corrupt-${Date.now()}`
      try {
        fs.copyFileSync(STORE_PATH, backup)
      } catch {}
      console.error(`[projects] 读取失败，已备份到 ${backup}:`, error.message)
    }
    let changed = false
    for (const project of this.data.projects) {
      const clean = this.sanitize(project)
      for (const key of Object.keys(clean)) {
        if (project[key] !== clean[key]) {
          project[key] = clean[key]
          changed = true
        }
      }
      if (!project.id || !/^p_[a-f0-9]{12}$/.test(project.id)) {
        project.id = projectId()
        changed = true
      }
    }
    if (changed) this.scheduleSave()
  }

  sanitize(input = {}) {
    const base = {
      name: text(input.name, NAME_MAX) || '未命名项目',
      emoji: normalizeEmoji(input.emoji),
      color: normalizeColor(input.color),
      instructions: text(input.instructions, INSTRUCTIONS_MAX),
      notes: text(input.notes, NOTES_MAX),
      pinned: input.pinned === true,
      memoryOff: input.memoryOff === true,
      defaultEngine: input.defaultEngine === 'codex' ? 'codex' : 'dsr',
      defaultPermission: ['read-only', 'workspace-write', 'danger-full-access'].includes(input.defaultPermission)
        ? input.defaultPermission
        : 'workspace-write',
      archivedAt: Number(input.archivedAt) > 0 ? Number(input.archivedAt) : null,
    }
    return base
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

  list() {
    return [...this.data.projects].sort((left, right) => {
      const pin = Number(Boolean(right.pinned)) - Number(Boolean(left.pinned))
      if (pin) return pin
      return (right.updatedAt || 0) - (left.updatedAt || 0)
    })
  }

  get(id) {
    return this.data.projects.find((project) => project.id === id) || null
  }

  create(input = {}) {
    if (this.data.projects.length >= MAX_PROJECTS) {
      throw Object.assign(new Error(`项目最多 ${MAX_PROJECTS} 个，请先归档或删除不用的项目`), { status: 409 })
    }
    if (!String(input?.name ?? '').trim()) {
      throw Object.assign(new Error('项目名称不能为空'), { status: 400 })
    }
    const clean = this.sanitize(input)
    const project = {
      id: projectId(),
      ...clean,
      createdAt: now(),
      updatedAt: now(),
    }
    this.data.projects.unshift(project)
    this.scheduleSave()
    return project
  }

  update(id, patch = {}) {
    const project = this.get(id)
    if (!project) return null
    if (patch.name !== undefined) {
      const name = text(patch.name, NAME_MAX)
      if (!name) throw Object.assign(new Error('项目名称不能为空'), { status: 400 })
      project.name = name
    }
    if (patch.emoji !== undefined) project.emoji = normalizeEmoji(patch.emoji)
    if (patch.color !== undefined) project.color = normalizeColor(patch.color)
    if (patch.instructions !== undefined) project.instructions = text(patch.instructions, INSTRUCTIONS_MAX)
    if (patch.notes !== undefined) project.notes = text(patch.notes, NOTES_MAX)
    if (patch.pinned !== undefined) project.pinned = patch.pinned === true
    if (patch.memoryOff !== undefined) project.memoryOff = patch.memoryOff === true
    if (patch.defaultEngine !== undefined) project.defaultEngine = patch.defaultEngine === 'codex' ? 'codex' : 'dsr'
    if (patch.defaultPermission !== undefined && ['read-only', 'workspace-write', 'danger-full-access'].includes(patch.defaultPermission)) {
      project.defaultPermission = patch.defaultPermission
    }
    if (patch.archived !== undefined) {
      project.archivedAt = patch.archived === true ? now() : null
    }
    project.updatedAt = now()
    this.scheduleSave()
    return project
  }

  fileRoot(id) {
    return path.join(DATA_DIR, 'projects', id, 'files')
  }

  listFiles(id) {
    const root = this.fileRoot(id)
    let entries = []
    try {
      entries = fs.readdirSync(root, { withFileTypes: true })
    } catch {
      return []
    }
    const out = []
    for (const entry of entries) {
      if (!entry.isFile() || entry.name.startsWith('.')) continue
      try {
        const stat = fs.statSync(path.join(root, entry.name))
        out.push({ name: entry.name, size: stat.size, mtime: stat.mtimeMs })
      } catch {}
    }
    return out.sort((left, right) => right.mtime - left.mtime)
  }

  remove(id) {
    const index = this.data.projects.findIndex((project) => project.id === id)
    if (index < 0) return null
    const [project] = this.data.projects.splice(index, 1)
    try {
      fs.rmSync(path.join(DATA_DIR, 'projects', id), { recursive: true, force: true })
    } catch {}
    this.scheduleSave()
    return project
  }

  export() {
    return {
      version: 1,
      exportedAt: now(),
      projects: JSON.parse(JSON.stringify(this.list())),
    }
  }

  import(payload) {
    const list = Array.isArray(payload?.projects) ? payload.projects : []
    if (!list.length) return { imported: 0, skipped: 0, map: new Map() }
    const seen = new Map()
    for (const project of this.data.projects) {
      if (project.importKey) seen.set(project.importKey, project.id)
    }
    const map = new Map()
    const imported = []
    let skipped = 0
    for (const raw of list) {
      if (!raw || typeof raw !== 'object') continue
      const clean = this.sanitize(raw)
      const signature = raw.id
        ? `id:${raw.id}`
        : `txt:${clean.name}|${clean.instructions.slice(0, 120)}|${clean.notes.slice(0, 120)}`
      if (seen.has(signature)) {
        if (typeof raw.id === 'string') map.set(raw.id, seen.get(signature))
        skipped += 1
        continue
      }
      const copy = {
        id: projectId(),
        ...clean,
        importKey: signature,
        createdAt: Number(raw.createdAt) || now(),
        updatedAt: Number(raw.updatedAt) || now(),
      }
      if (typeof raw.id === 'string') map.set(raw.id, copy.id)
      seen.set(signature, copy.id)
      imported.push(copy)
    }
    if (this.data.projects.length + imported.length > MAX_PROJECTS) {
      throw Object.assign(new Error(`项目数量超过上限（${MAX_PROJECTS}）`), { status: 409 })
    }
    this.data.projects.unshift(...imported.reverse())
    if (imported.length) this.scheduleSave()
    return { imported: imported.length, skipped, map }
  }
}
