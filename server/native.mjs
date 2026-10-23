import net from 'node:net'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import {
  MODEL,
  NATIVE_ENABLED,
  NATIVE_PORT,
  NATIVE_TOKEN_FILE,
  NATIVE_WORKSPACE_TITLE,
  PROVIDER,
  SHARED_WORKSPACE,
  config,
} from './config.mjs'

const RUN_TIMEOUT_MS = Math.max(1, Number(config.maxRunMinutes) || 30) * 60_000

function parseArguments(raw) {
  if (raw === '' || raw === undefined || raw === null) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

function resultText(blocks) {
  if (!Array.isArray(blocks)) return ''
  return blocks
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('')
}

function addUsage(total, usage) {
  if (!usage || typeof usage !== 'object') return total
  const next = total || {}
  for (const key of ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'totalTokens']) {
    if (Number.isFinite(usage[key])) next[key] = (next[key] || 0) + usage[key]
  }
  return next
}

/**
 * Long-lived JSON-RPC connection to the bridge mounted inside the Desktop
 * DeepSeek Harness host. Sessions are native: created by the host, shown in the
 * Desktop sidebar, and executed with its configured model and agent preset.
 */
export class NativeBridge {
  constructor() {
    this.port = NATIVE_PORT
    this.tokenFile = NATIVE_TOKEN_FILE
    this.sharedRoot = fs.realpathSync(SHARED_WORKSPACE)
    this.socket = null
    this.initialized = false
    this.connecting = null
    this.pending = new Map()
    this.runs = new Map()
    this.seq = 0
    this.buffer = ''
    this.lastFailureAt = 0
  }

  async available() {
    return this.ensure()
  }

  async ensure() {
    if (!NATIVE_ENABLED) return false
    if (this.socket && !this.socket.destroyed && this.initialized) return true
    if (this.connecting) return this.connecting
    if (Date.now() - this.lastFailureAt < 6000) return false
    this.connecting = this.connect().finally(() => {
      this.connecting = null
    })
    return this.connecting
  }

  connect() {
    return new Promise((resolve) => {
      let settled = false
      const finish = (ok) => {
        if (settled) return
        settled = true
        if (!ok) this.lastFailureAt = Date.now()
        resolve(ok)
      }
      if (!fs.existsSync(this.tokenFile)) return finish(false)
      let token
      try {
        token = fs.readFileSync(this.tokenFile, 'utf8').trim()
      } catch {
        return finish(false)
      }
      if (!token) return finish(false)

      const socket = net.createConnection({ host: '127.0.0.1', port: this.port })
      socket.setEncoding('utf8')
      socket.setNoDelay(true)
      socket.setKeepAlive(true, 15_000)
      this.socket = socket
      this.buffer = ''
      this.initialized = false
      socket.write(`DSH-CHAT ${token}\n`)

      const timer = setTimeout(() => {
        if (!this.initialized) {
          socket.destroy()
          finish(false)
        }
      }, 5000)

      socket.on('data', (chunk) => this.onData(chunk))
      socket.on('error', () => {})
      socket.on('close', () => {
        clearTimeout(timer)
        if (this.socket === socket) {
          this.socket = null
          this.initialized = false
        }
        for (const [id, entry] of this.pending) {
          clearTimeout(entry.timer)
          entry.reject(new Error('native bridge disconnected'))
          this.pending.delete(id)
        }
        for (const run of [...this.runs.values()]) {
          run.fail('与桌面版的连接已断开')
        }
        finish(false)
      })

      socket.on('connect', async () => {
        try {
          const info = await this.call(
            'initialize',
            { cwd: this.sharedRoot, provider: PROVIDER, model: MODEL },
            20000,
          )
          this.initialized = true
          clearTimeout(timer)
          console.log(`[native] 已连接桌面版桥接：preset=${info?.preset ?? '?'} model=${MODEL}`)
          finish(true)
        } catch (error) {
          console.error('[native] 初始化失败：', error.message)
          socket.destroy()
          finish(false)
        }
      })
    })
  }

  onData(chunk) {
    this.buffer += chunk
    let index
    while ((index = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, index)
      this.buffer = this.buffer.slice(index + 1)
      if (!line.trim()) continue
      let message
      try {
        message = JSON.parse(line)
      } catch {
        continue
      }
      if (message.id !== undefined && !message.method) {
        const entry = this.pending.get(message.id)
        if (!entry) continue
        clearTimeout(entry.timer)
        this.pending.delete(message.id)
        if (message.error) entry.reject(new Error(message.error.message || 'native bridge error'))
        else entry.resolve(message.result)
        continue
      }
      if (typeof message.method === 'string') this.onNotification(message.method, message.params || {})
    }
  }

  call(method, params, timeoutMs = 30000) {
    if (!this.socket || this.socket.destroyed) return Promise.reject(new Error('native bridge is not connected'))
    const id = ++this.seq
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`native bridge timeout: ${method}`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      try {
        this.socket.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
      } catch (error) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(error)
      }
    })
  }

  onNotification(method, params) {
    if (method === 'session.event') {
      const run = this.runs.get(params.sessionId)
      if (process.env.DSH_CHAT_NATIVE_DEBUG) {
        console.log('[native:event]', params.sessionId, params.event?.type, 'tracked=' + Boolean(run))
      }
      if (!run) return
      this.project(run, params.event)
      return
    }
    if (method === 'session.status') {
      const run = this.runs.get(params.sessionId)
      if (run) run.emit({ type: 'status', phase: 'agent_status', status: params.status })
      return
    }
    if (method === 'session.delta') {
      const run = this.runs.get(params.sessionId)
      if (run) run.emit({ type: 'delta', kind: params.kind, text: params.text })
      return
    }
    if (method === 'chat/approval') {
      const run = this.runs.get(params.sessionId)
      if (run) {
        run.emit({
          type: 'approval',
          requestId: params.requestId,
          callId: params.callId ?? null,
          toolName: params.toolName,
          reason: params.reason ?? null,
          displayReason: params.displayReason ?? null,
        })
      }
      return
    }
    if (method === 'chat/approvalCancelled') {
      const run = this.runs.get(params.sessionId)
      if (run) run.emit({ type: 'approval_cancelled', requestId: params.requestId })
      return
    }
    if (method === 'chat/question') {
      const run = this.runs.get(params.sessionId)
      if (run) {
        run.emit({
          type: 'question',
          requestId: params.requestId,
          callId: params.callId ?? null,
          questions: params.questions,
        })
      }
      return
    }
    if (method === 'chat/agentError') {
      const run = this.runs.get(params.sessionId)
      if (run) {
        run.error = params.message
        run.emit({ type: 'error', message: params.message })
        if (!run.errorTimer) {
          run.errorTimer = setTimeout(() => {
            if (!run.finished) run.finish('error', params.message)
          }, 8000)
        }
      }
    }
  }

  project(run, event) {
    if (!event || typeof event !== 'object') return
    switch (event.type) {
      case 'turn/start':
        run.emit({ type: 'status', phase: 'turn_start', turn: event.data?.turn })
        return
      case 'step/start':
        run.emit({ type: 'status', phase: 'step_start', turn: event.data?.turn, step: event.data?.step })
        return
      case 'assistant/message': {
        const message = event.data?.message
        if (Array.isArray(message?.content)) {
          for (const block of message.content) {
            if (block?.type === 'reasoning' && typeof block.text === 'string' && block.text) {
              run.emit({ type: 'thinking', text: block.text })
            } else if (block?.type === 'text' && typeof block.text === 'string' && block.text) {
              run.emit({ type: 'text', text: block.text })
            }
          }
        }
        if (event.data?.usage) run.stepUsage = addUsage(run.stepUsage, event.data.usage)
        return
      }
      case 'step/end': {
        const usage = run.stepUsage
        run.usage = addUsage(run.usage, usage)
        run.stepUsage = null
        run.emit({
          type: 'status',
          phase: 'step_end',
          turn: event.data?.turn,
          step: event.data?.step,
          usage: usage || null,
        })
        return
      }
      case 'turn/end': {
        const reason = event.data?.reason
        run.emit({ type: 'status', phase: 'turn_end', turn: event.data?.turn, reason })
        const kind = reason?.kind
        if (kind === 'aborted') run.finish('stopped')
        else if (kind === 'error') run.finish('error', reason?.error?.message || '生成失败')
        else run.finish('done')
        return
      }
      case 'tool/call':
        run.emit({
          type: 'tool_call',
          callId: event.data?.callId,
          tool: event.data?.name,
          input: parseArguments(event.data?.arguments),
        })
        return
      case 'tool/result': {
        if (event.surfaceOp !== 'append') return
        const message = event.data?.message
        run.emit({
          type: 'tool_result',
          callId: message?.toolCallId,
          status: message?.isError === true ? 'error' : 'completed',
          result: resultText(message?.content),
        })
        return
      }
      default:
        return
    }
  }

  startRun({
    sessionId,
    prompt,
    cwd,
    isResume,
    permission = 'workspace-write',
    title = NATIVE_WORKSPACE_TITLE,
    onEvent,
  }) {
    const startedAt = Date.now()
    let resolveDone
    const run = {
      sessionId,
      onEvent,
      finished: false,
      stepUsage: null,
      error: null,
      timedOut: false,
      timer: null,
      errorTimer: null,
      emit: (event) => {
        if (run.finished) return
        try {
          onEvent(event)
        } catch {}
      },
      finish: (status, error) => {
        if (run.finished) return
        if (process.env.DSH_CHAT_NATIVE_DEBUG) {
          console.log('[native:finish]', sessionId, status, error || '', Date.now() - startedAt)
        }
        run.finished = true
        clearTimeout(run.timer)
        if (run.errorTimer) clearTimeout(run.errorTimer)
        this.runs.delete(sessionId)
        void this.call('chat/endRun', { sessionId }, 3000).catch(() => {})
        resolveDone({
          status,
          error: error || run.error || null,
          durationMs: Date.now() - startedAt,
          usage: run.usage || null,
          timedOut: run.timedOut,
        })
      },
      fail: (message) => {
        run.emit({ type: 'error', message })
        run.finish('error', message)
      },
    }

    const done = new Promise((resolve) => {
      resolveDone = resolve
    })

    run.timer = setTimeout(() => {
      run.timedOut = true
      void this.abort(sessionId)
      setTimeout(() => run.finish('error', '生成超时，已停止'), 5000)
    }, RUN_TIMEOUT_MS)

    this.runs.set(sessionId, run)

    void (async () => {
      try {
        if (!(await this.ensure())) throw new Error('桌面版桥接尚不可用')
        await this.call('chat/beginRun', { sessionId }, 5000).catch(() => {})

        if (process.env.DSH_CHAT_NATIVE_DEBUG) console.log('[native:kick] resume=' + isResume)
        if (isResume) {
          try {
            await this.call('session/resume', { sessionId }, 12000)
          } catch (error) {
            if (!/already open|already resumed/i.test(error.message)) throw error
          }
        } else {
          await this.call('session/working-directory/get', { sessionId }, 12000)
        }

        await this.call(
          'chat/attachWorkspace',
          { sessionId, path: this.sharedRoot, title },
          12000,
        )
        if (process.env.DSH_CHAT_NATIVE_DEBUG) console.log('[native:kick] attached; setting cwd')
        await this.call('session/working-directory/set', { sessionId, path: cwd }, 12000)
        if (process.env.DSH_CHAT_NATIVE_DEBUG) console.log('[native:kick] prompting')
        if (run.finished) return
        await this.call(
          'session/prompt',
          {
            sessionId,
            permission,
            contentBlocks: [{ type: 'text', text: prompt }],
          },
          30000,
        )
      } catch (error) {
        run.fail(error.message || '原生会话启动失败')
      }
    })()

    return {
      done,
      kill: () => this.abort(sessionId),
      get running() {
        return !run.finished
      },
    }
  }

  async answerQuestion(requestId, answers) {
    return this.call('chat/answerQuestion', { requestId, answers }, 10000)
  }

  async answerApproval(requestId, decision) {
    return this.call('chat/answerApproval', { requestId, decision }, 10000)
  }

  async setPermission(sessionId, permission) {
    if (!(await this.ensure())) return { ok: false, reason: 'bridge-unavailable' }
    return this.call('chat/setPermission', { sessionId, permission }, 10000)
  }

  async permissionCatalog() {
    if (!(await this.ensure())) return null
    try {
      return await this.call('chat/permissionCatalog', {}, 8000)
    } catch (error) {
      console.warn('[native] 读取权限目录失败：', error.message)
      return null
    }
  }

  /**
   * The Desktop model-selector catalog (provider groups + reasoning efforts +
   * default selection), live from the host's LLM registry. null when the
   * bridge is unavailable so callers can fall back to the static patch parse.
   */
  async listModels() {
    if (!(await this.ensure())) return null
    try {
      return await this.call('chat/listModels', {}, 15000)
    } catch (error) {
      console.warn('[native] 读取模型目录失败：', error.message)
      return null
    }
  }

  /**
   * Install a Session-local model selection (validated host-side through
   * llm.resolveCallConfig). Takes effect from the session's next request.
   */
  async setModel(sessionId, selection) {
    if (!sessionId || !selection?.provider || !selection?.model) {
      return { ok: false, reason: 'invalid-selection' }
    }
    if (!(await this.ensure())) return { ok: false, reason: 'bridge-unavailable' }
    return this.call(
      'chat/setModel',
      {
        sessionId,
        provider: selection.provider,
        model: selection.model,
        ...(selection.reasoningEffort ? { reasoningEffort: selection.reasoningEffort } : {}),
      },
      10000,
    )
  }

  async abort(sessionId) {
    if (!this.socket || this.socket.destroyed) return { ok: false }
    try {
      return await this.call('chat/abort', { sessionId }, 6000)
    } catch {
      return { ok: false }
    }
  }

  async archiveSession(sessionId) {
    if (!sessionId) return
    try {
      if (await this.ensure()) await this.call('chat/archiveSession', { sessionId }, 8000)
    } catch (error) {
      console.warn('[native] 归档会话失败：', error.message)
    }
  }
}

export const nativeBridge = new NativeBridge()
