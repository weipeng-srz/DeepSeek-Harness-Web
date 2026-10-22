import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { DATA_DIR, SECRET } from './config.mjs'

const STORE_PATH = path.join(DATA_DIR, 'shares.json')
const MAX_SHARES = 100
const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024
const MAX_SNAPSHOT_MESSAGES = 500
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
    try {
      if (fs.existsSync(STORE_PATH)) {
        const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'))
        if (parsed && Array.isArray(parsed.shares)) this.data = parsed
      }
    } catch (error) {
      const backup = `${STORE_PATH}.corrupt-${Date.now()}`
      try {
        fs.copyFileSync(STORE_PATH, backup)
      } catch {}
      console.error(`[shares] 读取失败，已备份到 ${backup}:`, error.message)
    }
    for (const share of this.data.shares) {
      if (typeof share.tokenHash !== 'string' && typeof share.token === 'string') {
        share.tokenHash = hashToken(share.token)
        share.tokenEnc = encryptToken(share.token)
        delete share.token
      }
      if (!share.tokenEnc && typeof share.token === 'string') {
        share.tokenEnc = encryptToken(share.token)
        delete share.token
      }
    }
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
      void this.flush()
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

  create({ conversation, owner, expiresInDays = 7, includeTools = false, includeThinking = false, messageIds = [] }) {
    this.prune()
    if (this.data.shares.length >= MAX_SHARES) {
      throw Object.assign(new Error(`分享链接最多 ${MAX_SHARES} 个，请先在设置里撤销不用的链接`), { status: 409 })
    }
    const selected = new Set(Array.isArray(messageIds) ? messageIds.filter((id) => typeof id === 'string') : [])
    const onlySelected = selected.size > 0
    const source = []
    if (onlySelected) {
      // Keep the question that produced the selected answer for context.
      for (let i = 0; i < (conversation.messages || []).length; i += 1) {
        const msg = conversation.messages[i]
        if (!selected.has(msg.id)) continue
        const prev = conversation.messages[i - 1]
        if (prev?.role === 'user' && !source.includes(prev)) source.push(prev)
        if (!source.includes(msg)) source.push(msg)
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
      title: cleanText(conversation.title || '未命名对话', 120),
      createdAt: Number(conversation.createdAt) || now(),
      messages,
      engine: conversation.engine === 'codex' ? 'codex' : 'dsr',
      projectName: null,
    }
    const bytes = Buffer.byteLength(JSON.stringify(snapshot))
    if (bytes > MAX_SNAPSHOT_BYTES) {
      throw Object.assign(new Error(`这段对话快照约 ${(bytes / 1024 / 1024).toFixed(1)}MB，超过 2MB 分享上限；请导出文件后发送`), { status: 413 })
    }
    const raw = token()
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
      viewCount: 0,
      lastViewedAt: null,
      snapshot,
    }
    this.data.shares.unshift(share)
    this.scheduleSave()
    const { tokenHash, tokenEnc: _tokenEnc, snapshot: _snapshot, ...meta } = share
    return { share: { ...meta, messageCount: snapshot.messages.length }, token: raw, snapshot }
  }

  list(owner) {
    this.prune()
    return this.data.shares
      .filter((share) => share.owner === owner)
      .map(({ tokenHash, tokenEnc, snapshot, token, ...meta }) => ({
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

  findPublic(rawToken) {
    const hash = hashToken(rawToken)
    const share = this.data.shares.find((item) => item.tokenHash === hash)
    if (!share) return { error: 'notfound' }
    if (share.revokedAt) return { error: 'revoked' }
    if (share.expiresAt && share.expiresAt <= now()) return { error: 'expired' }
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
      active: list.filter((share) => !share.expired).length,
      expired: list.filter((share) => share.expired).length,
      views: list.reduce((sum, share) => sum + (share.viewCount || 0), 0),
    }
  }
}
