/* Push notifications for finished runs and pending approvals.
 *
 * The only channel for now is iMessage: macOS drives Messages.app through
 * AppleScript, so the server must run on the Mac that is signed in to
 * iMessage. Sends are fire-and-forget (no delivery receipt); failures are
 * logged and never block a run.
 *
 * Self-test:
 *   node server/notify.mjs --to "+8613800000000" --text "hello" --dry-run
 */

import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const APPLESCRIPT = `on run argv
  set targetHandle to item 1 of argv
  set bodyText to item 2 of argv
  tell application "Messages"
    set targetService to 1st service whose service type = iMessage
    set targetBuddy to buddy targetHandle of targetService
    send bodyText to targetBuddy
  end tell
  return "sent"
end run`

export const NOTIFY_EVENTS = ['done', 'error', 'approval', 'question']

const KIND_TITLES = {
  done: '✅ DSH Chat · 已完成',
  error: '⚠️ DSH Chat · 运行失败',
  approval: '⏸ DSH Chat · 需要授权',
  question: '❓ DSH Chat · 需要你确认',
}

const MAX_TEXT = 1200

function clamp(text, limit) {
  const clean = String(text || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return clean.length > limit ? `${clean.slice(0, limit - 1)}…` : clean
}

function parseClock(value) {
  // Already normalized (minutes since midnight) — keep re-normalization stable
  // when settings are persisted back to config.json and read again.
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < 1440) {
    return value
  }
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

function humanDuration(ms) {
  const seconds = Math.round(Number(ms) / 1000)
  if (!Number.isFinite(seconds) || seconds <= 0) return ''
  if (seconds < 60) return `${seconds} 秒`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} 分 ${seconds % 60} 秒`
  return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分`
}

export function normalizeNotify(raw = {}) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const channels = (Array.isArray(src.channels) ? src.channels : [])
    .filter((channel) => channel && typeof channel === 'object')
    .map((channel) => {
      const type = String(channel.type || 'imessage').toLowerCase()
      const events = Array.isArray(channel.events)
        ? [...new Set(channel.events.filter((event) => NOTIFY_EVENTS.includes(event)))]
        : [...NOTIFY_EVENTS]
      return {
        type,
        to: String(channel.to || '').trim(),
        events: events.length ? events : [...NOTIFY_EVENTS],
        enabled: channel.enabled !== false,
      }
    })
    .filter((channel) => channel.to)

  const quiet = Array.isArray(src.quietHours) ? src.quietHours : []
  const start = parseClock(quiet[0])
  const end = parseClock(quiet[1])

  const clampInt = (value, min, max, fallback) => {
    const number = Number(value)
    if (!Number.isFinite(number)) return fallback
    return Math.min(max, Math.max(min, Math.round(number)))
  }

  return {
    enabled: src.enabled === true && channels.length > 0,
    channels,
    quietHours: start !== null && end !== null && start !== end ? [start, end] : [],
    mergeWindowSec: clampInt(src.mergeWindowSec, 0, 600, 60),
    minIntervalSec: clampInt(src.minIntervalSec, 0, 120, 5),
    maxPerHour: clampInt(src.maxPerHour, 1, 120, 20),
  }
}

function formatMessage(kind, payload = {}) {
  const lines = [KIND_TITLES[kind] || 'DSH Chat']
  const title = clamp(payload.title || '未命名会话', 64)
  if (title) lines.push(`会话：${title}`)

  if (kind === 'done') {
    const meta = []
    if (payload.model) meta.push(String(payload.model))
    const duration = humanDuration(payload.durationMs)
    if (duration) meta.push(`耗时 ${duration}`)
    if (meta.length) lines.push(meta.join(' · '))
    const body = clamp(payload.text, 140)
    if (body) lines.push('', body)
  } else if (kind === 'error') {
    const reason = clamp(payload.error || payload.text, 160)
    if (reason) lines.push('', reason)
  } else if (kind === 'approval') {
    if (payload.toolName) lines.push(`工具：${clamp(payload.toolName, 48)}`)
    const reason = clamp(payload.reason, 160)
    if (reason) lines.push('', reason)
  } else if (kind === 'question') {
    const first = Array.isArray(payload.questions) ? payload.questions[0] : null
    const count = Array.isArray(payload.questions) ? payload.questions.length : 0
    if (count > 1) lines.push(`共 ${count} 个问题`)
    const ask = first ? clamp(first.header || first.question || '', 120) : ''
    if (ask) lines.push('', ask)
  }

  if (payload.url) lines.push('', String(payload.url))
  return lines.join('\n')
}

function dedupeLines(text) {
  const seen = new Set()
  return text
    .split('\n')
    .filter((line) => {
      const key = line.trim()
      if (!key) return true
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .join('\n')
}

function sendIMessage(handle, text) {
  return new Promise((resolve, reject) => {
    execFile(
      '/usr/bin/osascript',
      ['-e', APPLESCRIPT, handle, text],
      { timeout: 20_000, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          const detail = String(stderr || error.message || '')
            .trim()
            .split('\n')[0]
          reject(new Error(detail || 'osascript 执行失败'))
          return
        }
        resolve(String(stdout).trim())
      },
    )
  })
}

export class Notifier {
  constructor({ settings, log, dryRun = false } = {}) {
    this.log = log || ((message) => console.error(`[notify] ${message}`))
    this.dryRun = dryRun || process.env.DSH_NOTIFY_DRY_RUN === '1'
    this.buffers = new Map()
    this.queue = []
    this.timer = null
    this.sending = false
    this.lastSendAt = 0
    this.sentAt = []
    this.apply(settings)
  }

  apply(raw) {
    this.settings = normalizeNotify(raw)
    return this.settings
  }

  // Validate into a candidate first and only then commit it. Assigning before
  // the check meant a rejected PATCH still disabled the live notifier while
  // config.json (and the UI after a reload) kept saying notifications were on.
  update(raw) {
    const next = normalizeNotify(raw)
    if (raw?.enabled === true && !next.channels.some((channel) => channel.enabled)) {
      const error = new Error('启用通知前需要先填写接收号码')
      error.status = 400
      throw error
    }
    this.settings = next
    return next
  }

  status() {
    return {
      enabled: this.settings.enabled,
      channels: this.settings.channels.map((channel) => ({ ...channel })),
      quietHours: this.settings.quietHours,
      mergeWindowSec: this.settings.mergeWindowSec,
      minIntervalSec: this.settings.minIntervalSec,
      maxPerHour: this.settings.maxPerHour,
      pending: this.queue.length,
      dryRun: this.dryRun,
    }
  }

  emit(kind, payload = {}) {
    if (!this.settings.enabled || !NOTIFY_EVENTS.includes(kind)) return
    const channels = this.settings.channels.filter(
      (channel) => channel.enabled && channel.events.includes(kind),
    )
    if (!channels.length) return

    const text = formatMessage(kind, payload)
    if (!text) return

    // Approvals and questions block the run — send them right away.
    if (kind === 'approval' || kind === 'question') {
      this.enqueue(text)
      return
    }
    const key = `${kind}:${payload.conversationId || 'global'}`
    this.buffer(key, text)
  }

  buffer(key, text) {
    const entry = this.buffers.get(key) || { parts: [] }
    entry.parts.push(text)
    if (entry.parts.length > 3) entry.parts = entry.parts.slice(-3)
    clearTimeout(entry.timer)
    const delay = this.settings.mergeWindowSec * 1000
    entry.timer = setTimeout(() => {
      this.buffers.delete(key)
      const merged = dedupeLines(entry.parts.join('\n———\n'))
      this.enqueue(merged.length > MAX_TEXT ? merged.slice(-MAX_TEXT) : merged)
    }, delay)
    if (entry.timer.unref) entry.timer.unref()
    this.buffers.set(key, entry)
  }

  enqueue(text) {
    this.queue.push({ text, at: Date.now() })
    if (this.queue.length > 20) this.queue.splice(0, this.queue.length - 20)
    void this.pump()
  }

  schedule(delayMs) {
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      void this.pump()
    }, Math.max(0, delayMs))
    if (this.timer.unref) this.timer.unref()
  }

  quietUntil(now = Date.now()) {
    const [start, end] = this.settings.quietHours
    if (!Number.isInteger(start) || !Number.isInteger(end)) return 0
    const date = new Date(now)
    const minutes = date.getHours() * 60 + date.getMinutes()
    const inside = start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end
    if (!inside) return 0
    const until = new Date(now)
    until.setHours(Math.floor(end / 60), end % 60, 0, 0)
    if (until.getTime() <= now || (start > end && minutes >= start)) {
      until.setDate(until.getDate() + 1)
    }
    return until.getTime()
  }

  recentCount(now = Date.now()) {
    const cutoff = now - 3_600_000
    this.sentAt = this.sentAt.filter((at) => at > cutoff)
    return this.sentAt.length
  }

  async pump() {
    if (this.sending || !this.queue.length) return
    const now = Date.now()
    const quietEnd = this.quietUntil(now)
    if (quietEnd) {
      this.schedule(quietEnd - now)
      return
    }
    const wait = this.lastSendAt + this.settings.minIntervalSec * 1000 - now
    if (wait > 0) {
      this.schedule(wait)
      return
    }
    if (this.recentCount(now) >= this.settings.maxPerHour) {
      this.schedule(60_000)
      return
    }

    const item = this.queue.shift()
    this.sending = true
    this.lastSendAt = Date.now()
    try {
      await this.deliver(item.text)
      this.sentAt.push(Date.now())
    } catch (error) {
      this.log(`发送失败：${error.message}`)
    } finally {
      this.sending = false
      if (this.queue.length) this.schedule(0)
    }
  }

  async deliver(text) {
    const channels = this.settings.channels.filter(
      (channel) => channel.enabled && channel.type === 'imessage',
    )
    if (!channels.length) return
    for (const channel of channels) {
      if (this.dryRun) {
        this.log(`[dry-run] -> ${channel.to}\n${text}\n`)
        continue
      }
      await sendIMessage(channel.to, text)
      this.log(`已推送 -> ${channel.to}`)
    }
  }

  async test({ to, text } = {}) {
    const handle = String(to || this.settings.channels[0]?.to || '').trim()
    if (!handle) return { ok: false, error: '没有可用的接收号码' }
    const body = clamp(text || 'DSH Chat 测试消息，收到即代表 iMessage 通道可用。', 400)
    try {
      if (this.dryRun) {
        this.log(`[dry-run] -> ${handle}\n${body}`)
        return { ok: true, to: handle, dryRun: true }
      }
      await sendIMessage(handle, body)
      return { ok: true, to: handle }
    } catch (error) {
      return { ok: false, to: handle, error: error.message }
    }
  }
}

function parseArgs(argv) {
  const out = {}
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!arg.startsWith('--')) continue
    const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase())
    const next = argv[index + 1]
    if (next === undefined || next.startsWith('--')) {
      out[key] = true
    } else {
      out[key] = next
      index += 1
    }
  }
  return out
}

const CONFIG_PATH = process.env.DSH_CHAT_CONFIG
  ? path.resolve(process.env.DSH_CHAT_CONFIG)
  : fileURLToPath(new URL('../config.json', import.meta.url))

const USAGE = `用法：
  node server/notify.mjs --to "+8613800000000" --enable   # 写入配置并发送测试
  node server/notify.mjs --to "+8613800000000" --dry-run  # 只打印，不真正发送
  node server/notify.mjs --disable                        # 关闭推送`

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url
if (isMain) {
  const args = parseArgs(process.argv.slice(2))
  const to = String(args.to || process.env.DSH_NOTIFY_TO || '').trim()
  const writeConfig = Boolean(args.enable || args.disable)

  if (!to && !args.disable) {
    console.error(USAGE)
    process.exit(1)
  }

  if (writeConfig) {
    let raw
    try {
      raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
    } catch (error) {
      console.error(`读取 ${CONFIG_PATH} 失败：${error.message}`)
      process.exit(1)
    }
    const current = raw.notify && typeof raw.notify === 'object' ? raw.notify : {}
    const settings = args.disable
      ? normalizeNotify({ ...current, enabled: false })
      : normalizeNotify({
          ...current,
          enabled: true,
          channels: [
            {
              type: 'imessage',
              to,
              events: current.channels?.[0]?.events || NOTIFY_EVENTS,
            },
          ],
        })
    raw.notify = { ...current, ...settings }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(raw, null, 2) + '\n', { mode: 0o600 })
    console.log(`${args.disable ? '已关闭' : '已开启'} iMessage 推送，写入 ${CONFIG_PATH}`)
    if (!args.disable) console.log(`接收号码：${to}`)
    console.log('重启服务后生效：launchctl kickstart -k gui/$(id -u)/com.dshchat.server')
  }

  if (args.disable) process.exit(0)

  const notifier = new Notifier({
    settings: { enabled: true, channels: [{ type: 'imessage', to }] },
    dryRun: Boolean(args.dryRun),
  })
  const result = await notifier.test({ to, text: args.text })
  if (!result.ok) {
    console.error(`发送失败：${result.error}`)
    process.exit(1)
  }
  console.log(result.dryRun ? 'dry-run 完成（未真正发送）' : `已发送到 ${result.to}`)
}
