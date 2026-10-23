import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { DATA_DIR, SECRET } from './config.mjs'

const STORE_PATH = path.join(DATA_DIR, 'shares.json')
const MAX_SHARES = 100
const MAX_SNAPSHOT_BYTES = 5 * 1024 * 1024
const MAX_SNAPSHOT_MESSAGES = 1000
const MAX_SHARE_DAYS = 365

const now = () => Date.now()
const shareId = () => 'sh_' + crypto.randomBytes(6).toString('hex')
const token = () => crypto.randomBytes(24).toString('base64url')

function hashToken(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex')
}

const TOKEN_KEY = crypto.createHash('sha256').update(`dsh-share:${SECRET}`).digest()

function encryptToken(value) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', TOKEN_KEY, iv)
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()])
  return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`
}

function decryptToken(payload) {
  try {
    const [iv, tag, data] = String(payload || '').split('.')
    if (!iv || !tag || !data) return ''
    const decipher = crypto.createDecipheriv('aes-256-gcm', TOKEN_KEY, Buffer.from(iv, 'base64url'))
    decipher.setAuthTag(Buffer.from(tag, 'base64url'))
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8')
  } catch {
    return ''
  }
}

function redactText(value) {
  return String(value || '')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[已脱敏邮箱]')
    .replace(/\b1[3-9]\d{9}\b/g, '[已脱敏手机号]')
    .replace(/\b\d{17}[\dXx]\b/g, '[已脱敏证件号]')
    .replace(/\b(sk-[A-Za-z0-9_-]{12,}|AKIA[0-9A-Z]{16})\b/g, '[已脱敏密钥]')
}

function redactMessages(messages) {
  for (const msg of messages) {
    msg.text = redactText(msg.text)
    for (const block of msg.blocks || []) {
      if (block.type === 'text' || block.type === 'thinking') block.text = redactText(block.text)
      if (block.type === 'tool') {
        if (typeof block.result === 'string') block.result = redactText(block.result)
        try {
          const serialized = JSON.stringify(block.input ?? null)
          block.input = JSON.parse(redactText(serialized))
        } catch {}
      }
    }
  }
}

function countSensitive(messages) {
  const text = (messages || [])
    .map((msg) => [
      msg.text || '',
      ...(msg.blocks || []).map((block) => {
        if (block.type === 'text' || block.type === 'thinking') return block.text || ''
        if (block.type === 'tool') return `${JSON.stringify(block.input ?? null)} ${typeof block.result === 'string' ? block.result : ''}`
        return ''
      }),
    ].join('\n'))
    .join('\n')
  return (
    (text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) || []).length +
    (text.match(/\b1[3-9]\d{9}\b/g) || []).length +
    (text.match(/\b\d{17}[\dXx]\b/g) || []).length +
    (text.match(/\b(sk-[A-Za-z0-9_-]{12,}|AKIA[0-9A-Z]{16})\b/g) || []).length
  )
}

function cleanText(value, max = 200_000) {
  return String(value ?? '').replace(/\u0000/g, '').slice(0, max)
}

export class ShareStore {
  constructor() {
    this.data = { version: 1, shares: [] }
    this.saveTimer = null
    this.viewTimer = null
    this.writing = null
    this.load()
    this.prune()
  }

  load() {
    const quarantine = (reason) => {
      const backup = `${STORE_PATH}.corrupt-${new Date().toISOString().replace(/[:.]/g, '-')}`
      try {
        fs.copyFileSync(STORE_PATH, backup)
        console.error(`[shares] ${reason}；原文件已备份到 ${backup}`)
      } catch (error) {
        console.error(`[shares] ${reason}；备份失败：${error.message}`)
      }
    }
    try {
      if (fs.existsSync(STORE_PATH)) {
        const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'))
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Array.isArray(parsed.shares)) {
          this.data = parsed
        } else {
          quarantine('分享文件结构异常，已按空库启动')
        }
      }
    } catch (error) {
      quarantine(`读取失败：${error.message}`)
    }
    const usable = []
    let dropped = 0
    for (const share of Array.isArray(this.data.shares) ? this.data.shares : []) {
      if (!share || typeof share !== 'object' || Array.isArray(share)) {
        dropped += 1
        continue
      }
      if (typeof share.tokenHash !== 'string' && typeof share.token === 'string') {
        share.tokenHash = hashToken(share.token)
        share.tokenEnc = encryptToken(share.token)
        delete share.token
      }
      if (!share.tokenEnc && typeof share.token === 'string') {
        share.tokenEnc = encryptToken(share.token)
        delete share.token
      }
      if (typeof share.tokenHash !== 'string') {
        dropped += 1
        continue
      }
      usable.push(share)
    }
    if (usable.length !== this.data.shares.length) {
      this.data.shares = usable
      this.scheduleSave()
    }
    if (dropped) quarantine(`跳过 ${dropped} 条损坏分享记录`)
  }

  scheduleViewSave() {
    if (this.viewTimer) return
    this.viewTimer = setTimeout(() => {
      this.viewTimer = null
      this.scheduleSave()
    }, 60_000)
    if (this.viewTimer.unref) this.viewTimer.unref()
  }

  scheduleSave() {
    if (this.saveTimer) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      void this.flush().catch((error) => console.error('[store] 分享数据后台写入失败:', error.message))
    }, 150)
    if (this.saveTimer.unref) this.saveTimer.unref()
  }

  async flush() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    if (this.viewTimer) {
      clearTimeout(this.viewTimer)
      this.viewTimer = null
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

  prune() {
    const cutoff = now() - 30 * 86_400_000
    const before = this.data.shares.length
    this.data.shares = this.data.shares.filter((share) => {
      const expired = share.expiresAt && share.expiresAt <= now()
      const old = (share.revokedAt || share.expiresAt || share.createdAt || 0) < cutoff
      return !(share.revokedAt && old) && !(expired && old)
    })
    if (this.data.shares.length !== before) this.scheduleSave()
  }

  buildSnapshot(conversation, { includeTools = false, includeThinking = false, messageIds = [], redactSensitive = false } = {}) {
    const selected = new Set(Array.isArray(messageIds) ? messageIds.filter((id) => typeof id === 'string') : [])
    const onlySelected = selected.size > 0
    const source = []
    if (onlySelected) {
      // Share exactly what the user selected, in conversation order. The
      // client preselects the question for a per-answer share; the server
      // must not silently add an unchecked question back.
      for (const msg of conversation.messages || []) {
        if (selected.has(msg.id) && !source.includes(msg)) source.push(msg)
      }
    } else {
      source.push(...(conversation.messages || []))
    }
    const messages = []
    for (const msg of source) {
      if (msg.internal) continue
      if (msg.role !== 'user' && msg.role !== 'assistant') continue
      let blocks = null
      if (Array.isArray(msg.blocks) && msg.blocks.length) {
        blocks = []
        for (const block of msg.blocks) {
          if (!block || typeof block !== 'object') continue
          if (block.type === 'thinking' && !includeThinking) continue
          if (block.type === 'tool' && !includeTools) continue
          if (block.type === 'text') blocks.push({ type: 'text', text: cleanText(block.text) })
          else if (block.type === 'thinking') blocks.push({ type: 'thinking', text: cleanText(block.text) })
          else if (block.type === 'tool') {
            blocks.push({
              type: 'tool',
              tool: cleanText(block.tool, 80),
              input: block.input === undefined ? null : block.input,
              status: cleanText(block.status, 30),
              result: block.result === undefined ? null : cleanText(
                typeof block.result === 'string' ? block.result : JSON.stringify(block.result),
                120_000,
              ),
            })
          }
        }
      }
      const attachments = Array.isArray(msg.attachments)
        ? msg.attachments.map((file) => ({ name: cleanText(file.name, 160), size: Number(file.size) || 0, kind: cleanText(file.kind, 30) }))
        : []
      messages.push({
        role: msg.role,
        text: cleanText(msg.text || ''),
        createdAt: Number(msg.createdAt) || 0,
        ...(blocks && blocks.length ? { blocks } : {}),
        ...(attachments.length ? { attachments } : {}),
      })
      if (messages.length >= MAX_SNAPSHOT_MESSAGES) {
        if (source.length > MAX_SNAPSHOT_MESSAGES) {
          throw Object.assign(new Error(`分享最多 ${MAX_SNAPSHOT_MESSAGES} 条消息；更长的对话请用「导出」生成文件`), { status: 413 })
        }
        break
      }
    }
    if (!messages.length) {
      throw Object.assign(new Error('这段对话还没有可分享的内容'), { status: 400 })
    }
    const snapshot = {
      title: redactSensitive ? redactText(cleanText(conversation.title || '未命名对话', 120)) : cleanText(conversation.title || '未命名对话', 120),
      createdAt: Number(conversation.createdAt) || now(),
      messages,
      engine: conversation.engine === 'codex' ? 'codex' : 'dsr',
      projectName: null,
    }
    const bytes = Buffer.byteLength(JSON.stringify(snapshot))
    if (bytes > MAX_SNAPSHOT_BYTES) {
      throw Object.assign(new Error(`这段对话快照约 ${(bytes / 1024 / 1024).toFixed(1)}MB，超过 ${MAX_SNAPSHOT_BYTES / 1024 / 1024}MB 分享上限；请导出文件后发送`), { status: 413 })
    }
    return snapshot
  }

  create({ conversation, owner, expiresInDays = 7, includeTools = false, includeThinking = false, messageIds = [], allowSensitive = false, redactSensitive = false, password = '' }) {
    this.prune()
    // Only links that can still be opened should count against the quota.
    // Revoked links used to occupy it for 30 days, so after ~100 created links
    // sharing was blocked even after revoking every one of them — with an error
    // telling the user to do exactly what they had already done.
    const live = this.data.shares.filter((item) => !item.revokedAt && !(item.expiresAt && item.expiresAt <= now()))
    if (live.length >= MAX_SHARES) {
      throw Object.assign(new Error(`有效分享链接最多 ${MAX_SHARES} 个，请先撤销或等待过期后再创建`), { status: 409 })
    }
    const snapshot = this.buildSnapshot(conversation, { includeTools, includeThinking, messageIds, redactSensitive })
    if (redactSensitive) redactMessages(snapshot.messages)
    const sensitive = redactSensitive ? 0 : countSensitive(snapshot.messages)
    if (sensitive && !allowSensitive) {
      throw Object.assign(new Error(`快照里有 ${sensitive} 处可能的手机号/邮箱/证件/密钥。确认要分享请再次确认。`), { status: 409, sensitive })
    }
    const raw = token()
    const pass = String(password || '')
    if (pass && (pass.length < 6 || pass.length > 64)) {
      throw Object.assign(new Error('分享口令需要 6–64 个字符'), { status: 400 })
    }
    const passwordSalt = pass ? crypto.randomBytes(16).toString('base64url') : ''
    const passwordHash = pass ? crypto.scryptSync(pass, passwordSalt, 32).toString('base64url') : ''
    // `-5` used to collapse to 0, which means "never expires": a UI that sent a
    // negative value silently produced a permanent public link.
    if (expiresInDays !== undefined && expiresInDays !== null && expiresInDays !== '') {
      const requested = Number(expiresInDays)
      // 0 is the documented "长期/永久" choice; only nonsense is rejected.
      if (!Number.isFinite(requested) || requested < 0 || requested > MAX_SHARE_DAYS) {
        throw Object.assign(new Error(`有效期需要在 0–${MAX_SHARE_DAYS} 天之间（0 表示长期有效）`), { status: 400 })
      }
    }
    const days = Math.min(Math.max(Number(expiresInDays) || 0, 0), MAX_SHARE_DAYS)
    const share = {
      id: shareId(),
      tokenHash: hashToken(raw),
      tokenEnc: encryptToken(raw),
      owner,
      conversationId: conversation.id,
      createdAt: now(),
      expiresAt: days > 0 ? now() + days * 86_400_000 : null,
      revokedAt: null,
      includeTools: Boolean(includeTools),
      includeThinking: Boolean(includeThinking),
      redactSensitive: Boolean(redactSensitive),
      passwordSalt,
      passwordHash,
      messageIds: Array.isArray(messageIds) ? messageIds.filter((id) => typeof id === 'string').slice(0, 500) : [],
      viewCount: 0,
      lastViewedAt: null,
      snapshot,
    }
    this.data.shares.unshift(share)
    this.scheduleSave()
    const { tokenHash, tokenEnc: _tokenEnc, passwordHash: _passwordHash, passwordSalt: _passwordSalt, snapshot: _snapshot, ...meta } = share
    return { share: { ...meta, messageCount: snapshot.messages.length, hasPassword: Boolean(pass) }, token: raw, snapshot }
  }

  refresh(owner, id, conversation, { allowSensitive = false } = {}) {
    const share = this.data.shares.find((item) => item.id === id && item.owner === owner)
    if (!share || share.revokedAt) return null
    if (!Array.isArray(share.messageIds)) {
      throw Object.assign(new Error('这是旧版分享，无法确认原来选中了哪些消息；请撤销后重新生成'), { status: 409 })
    }
    const snapshot = this.buildSnapshot(conversation, {
      includeTools: share.includeTools,
      includeThinking: share.includeThinking,
      messageIds: share.messageIds || [],
      redactSensitive: share.redactSensitive === true,
    })
    if (share.redactSensitive) redactMessages(snapshot.messages)
    const sensitive = share.redactSensitive ? 0 : countSensitive(snapshot.messages)
    if (sensitive && !allowSensitive) {
      throw Object.assign(new Error(`更新后的快照有 ${sensitive} 处可能的手机号/邮箱/证件/密钥。确认要更新请再次确认。`), { status: 409, sensitive })
    }
    share.snapshot = snapshot
    share.updatedAt = now()
    this.scheduleSave()
    return { share: { ...share, token: decryptToken(share.tokenEnc) }, snapshot }
  }

  list(owner) {
    this.prune()
    return this.data.shares
      .filter((share) => share.owner === owner)
      .map(({ tokenHash, tokenEnc, passwordHash, passwordSalt, snapshot, token, ...meta }) => ({
        ...meta,
        token: token || decryptToken(tokenEnc),
        messageCount: Array.isArray(snapshot?.messages) ? snapshot.messages.length : 0,
        title: snapshot?.title || '未命名对话',
        expired: Boolean(meta.expiresAt && meta.expiresAt <= now()),
      }))
  }

  revoke(owner, id) {
    const share = this.data.shares.find((item) => item.id === id && item.owner === owner)
    if (!share) return null
    share.revokedAt = now()
    share.snapshot = { title: share.snapshot?.title || '未命名对话', messages: [] }
    this.scheduleSave()
    return share
  }

  revokeByConversation(owner, conversationId) {
    let count = 0
    for (const share of this.data.shares) {
      if (share.owner !== owner || share.conversationId !== conversationId || share.revokedAt) continue
      share.revokedAt = now()
      share.snapshot = { title: share.snapshot?.title || '未命名对话', messages: [] }
      count += 1
    }
    if (count) this.scheduleSave()
    return count
  }

  revokeAllForConversation(conversationId) {
    let count = 0
    for (const share of this.data.shares) {
      if (share.conversationId !== conversationId || share.revokedAt) continue
      share.revokedAt = now()
      share.snapshot = { title: share.snapshot?.title || '未命名对话', messages: [] }
      count += 1
    }
    if (count) this.scheduleSave()
    return count
  }

  async findPublic(rawToken, password = '') {
    const hash = hashToken(rawToken)
    const share = this.data.shares.find((item) => item.tokenHash === hash)
    if (!share) return { error: 'notfound' }
    if (share.revokedAt) return { error: 'revoked' }
    if (share.expiresAt && share.expiresAt <= now()) return { error: 'expired' }
    if (share.passwordHash) {
      const supplied = String(password || '')
      let ok = false
      try {
        const candidate = await new Promise((resolve, reject) => {
          crypto.scrypt(supplied, share.passwordSalt, 32, (error, derived) => {
            if (error) reject(error)
            else resolve(derived)
          })
        })
        const expected = Buffer.from(share.passwordHash, 'base64url')
        ok = candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected)
      } catch {}
      if (!ok) return { error: 'password' }
    }
    share.viewCount += 1
    share.lastViewedAt = now()
    // A public page view must not rewrite multi-megabyte snapshots. Counters
    // are flushed at most once a minute, and on shutdown.
    this.scheduleViewSave()
    return {
      share: {
        title: share.snapshot.title,
        createdAt: share.snapshot.createdAt,
        sharedAt: share.createdAt,
        updatedAt: share.updatedAt || share.createdAt,
        expiresAt: share.expiresAt,
        includeTools: share.includeTools,
        includeThinking: share.includeThinking,
        messages: share.snapshot.messages,
      },
    }
  }

  counts(owner) {
    const list = this.list(owner)
    return {
      total: list.length,
      active: list.filter((share) => !share.expired && !share.revokedAt).length,
      expired: list.filter((share) => share.expired).length,
      views: list.reduce((sum, share) => sum + (share.viewCount || 0), 0),
    }
  }
}
