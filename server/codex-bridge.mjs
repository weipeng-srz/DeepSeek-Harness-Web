import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import readline from 'node:readline'
import { resolveCodexBinary, readCodexDefaults } from './codex.mjs'
import { DATA_DIR, config } from './config.mjs'

const RUN_TIMEOUT_MS = Math.max(1, Number(config.maxRunMinutes) || 30) * 60_000
const CALL_TIMEOUT_MS = 30_000
const INIT_TIMEOUT_MS = 20_000
const MODEL_CACHE_MS = 10 * 60_000
const MODEL_CACHE_FILE = path.join(DATA_DIR, 'codex-models.json')

const EFFORT_LABELS = {
  minimal: '极低',
  low: '低',
  medium: '中',
  high: '高',
  xhigh: '很高',
  max: '最高',
  ultra: 'Ultra',
}

const FALLBACK_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'ultra']

function effortLabel(value) {
  const key = String(value || '').toLowerCase()
  return EFFORT_LABELS[key] || String(value || '')
}

function safeId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9._-]{1,96}$/.test(value) ? value : null
}

function normalizeModel(raw) {
  if (!raw || typeof raw !== 'object') return null
  const id = safeId(raw.model) || safeId(raw.id)
  if (!id) return null
  const efforts = []
  if (Array.isArray(raw.efforts)) {
    for (const option of raw.efforts) {
      const value = safeId(option?.value)
      if (!value || efforts.some((item) => item.value === value)) continue
      efforts.push({
        value,
        label: String(option.label || effortLabel(value)),
        description: typeof option.description === 'string' ? option.description : '',
      })
    }
  } else {
    for (const option of raw.supportedReasoningEfforts || []) {
      const value = safeId(option?.reasoningEffort)
      if (!value || efforts.some((item) => item.value === value)) continue
      efforts.push({
        value,
        label: effortLabel(value),
        description: typeof option.description === 'string' ? option.description : '',
      })
    }
  }
  return {
    id,
    name: String(raw.displayName || raw.name || id),
    description: String(raw.description || ''),
    defaultEffort: safeId(raw.defaultReasoningEffort) || efforts[0]?.value || 'medium',
    default: raw.isDefault === true,
    hidden: raw.hidden === true,
    efforts,
  }
}

function readModelCache() {
  try {
    const parsed = JSON.parse(fs.readFileSync(MODEL_CACHE_FILE, 'utf8'))
    if (!parsed || !Array.isArray(parsed.models) || !parsed.models.length) return null
    return {
      models: parsed.models.map(normalizeModel).filter(Boolean),
      defaultModel: safeId(parsed.defaultModel),
      updatedAt: Number(parsed.updatedAt) || 0,
    }
  } catch {
    return null
  }
}

function writeModelCache(value) {
  try {
    fs.writeFileSync(MODEL_CACHE_FILE, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 })
  } catch {}
}

function fallbackCatalog(defaults) {
  const id = defaults.model || 'gpt-6.1-sol'
  return {
    models: [
      {
        id,
        name: id,
        description: 'Codex Desktop 默认模型',
        defaultEffort: defaults.effort || 'medium',
        default: true,
        hidden: false,
        efforts: FALLBACK_EFFORTS.map((value) => ({
          value,
          label: effortLabel(value),
          description: '',
        })),
      },
    ],
    defaultModel: id,
    source: 'fallback',
    updatedAt: 0,
  }
}

/**
 * One long-lived `codex app-server` shared by every web conversation.
 *
 * The native Codex client keeps its app-server warm for the lifetime of the
 * window. Spawning a fresh process for every message costs seconds and makes
 * the first turn pay for transport setup (including WebSocket fallback), so the
 * web bridge does the same warm-process multiplexing.
 */
export class CodexBridge {
  constructor() {
    this.child = null
    this.buffer = ''
    this.nextId = 1
    this.pending = new Map()
    this.runs = new Set()
    this.runsByThread = new Map()
    this.loadedThreads = new Map()
    this.serverRequests = new Map()
    this.startPromise = null
    this.stderrTail = ''
    this.lastError = ''
    this.closed = false
    this.seq = 0
    this.defaults = readCodexDefaults()
    this.provider = 'openai'
    this.modelCache = readModelCache()
    this.modelsPromise = null
  }

  get ready() {
    return Boolean(this.child && this.child.exitCode === null && !this.startPromise)
  }

  get binary() {
    return resolveCodexBinary()
  }

  async ensureStarted() {
    if (this.closed) throw new Error('Codex 桥接已关闭')
    if (this.child && this.child.exitCode === null) return
    if (this.startPromise) return this.startPromise
    this.startPromise = this.spawn()
    try {
      await this.startPromise
    } finally {
      this.startPromise = null
    }
  }

  spawn() {
    const binary = this.binary
    if (!binary) return Promise.reject(new Error('本机未找到 Codex CLI，请安装 Codex 或设置 CODEX_BIN'))
    const args = ['app-server']
    const transport = String(process.env.DSH_CODEX_WS || 'https').toLowerCase()
    if (transport !== 'on' && transport !== 'true' && transport !== 'auto') {
      // The Responses WebSocket is not reachable on every network. Codex
      // retries it five times at 15s each before falling back to HTTPS, which
      // makes the first turn of a fresh thread look frozen for ~2 minutes.
      // A dedicated HTTPS-only provider starts the first token in seconds.
      this.provider = 'openai_https'
      args.push('-c', 'model_provider="openai_https"')
      args.push(
        '-c',
        'model_providers.openai_https={ name = "OpenAI (HTTPS)", base_url = "https://chatgpt.com/backend-api/codex", wire_api = "responses", requires_openai_auth = true, supports_websockets = false, stream_idle_timeout_ms = 180000, request_max_retries = 1, stream_max_retries = 1 }',
      )
    }
    const child = spawn(binary, args, {
      cwd: os.homedir(),
      env: {
        ...process.env,
        CODEX_HOME: process.env.CODEX_HOME || path.join(os.homedir(), '.codex'),
        NO_COLOR: '1',
        TERM: 'dumb',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    this.child = child
    this.buffer = ''
    this.stderrTail = ''
    this.lastError = ''

    const stdout = readline.createInterface({ input: child.stdout })
    stdout.on('line', (line) => {
      if (line.trim()) this.handleLine(line)
    })

    child.stderr.on('data', (chunk) => {
      this.stderrTail = (this.stderrTail + chunk.toString()).slice(-6000)
    })

    child.on('error', (error) => {
      this.lastError = `Codex app-server 启动失败：${error.message}`
      this.failAll(this.lastError)
    })

    child.on('close', (code, signal) => {
      stdout.close()
      const wasClosed = this.closed
      this.child = null
      if (!wasClosed) {
        const detail = this.stderrTail
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .at(-1)
        this.lastError = this.lastError || detail || `Codex app-server 退出（${signal || code || 0}）`
        this.failAll(this.lastError)
      }
    })

    return this.initialize().catch((error) => {
      try {
        child.kill('SIGTERM')
      } catch {}
      if (this.child === child) this.child = null
      throw error
    })
  }

  async initialize() {
    let timer
    try {
      await Promise.race([
        this.request(
          'initialize',
          {
            clientInfo: { name: 'dsh-chat', title: 'DSH Chat', version: '4.0.0' },
            capabilities: { experimentalApi: true, requestAttestation: false },
          },
          INIT_TIMEOUT_MS,
        ),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('Codex app-server 初始化超时')), INIT_TIMEOUT_MS + 1000)
        }),
      ])
    } finally {
      clearTimeout(timer)
    }
    this.send({ method: 'initialized' })
  }

  failAll(message) {
    for (const run of [...this.runs]) this.finishRun(run, 'error', message)
    for (const [id, entry] of this.pending) {
      clearTimeout(entry.timer)
      entry.reject(new Error(message))
      this.pending.delete(id)
    }
    this.runsByThread.clear()
    this.loadedThreads.clear()
    this.serverRequests.clear()
  }

  send(message) {
    const child = this.child
    if (!child || child.exitCode !== null || child.stdin.destroyed) return
    try {
      child.stdin.write(JSON.stringify(message) + '\n')
    } catch {}
  }

  request(method, params, timeout = CALL_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      if (!this.child || this.child.exitCode !== null) {
        reject(new Error(this.lastError || 'Codex app-server 未运行'))
        return
      }
      const id = this.nextId++
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Codex app-server ${method} 超时`))
      }, timeout)
      this.pending.set(id, { resolve, reject, timer, method })
      this.send({ id, method, params })
    })
  }

  handleLine(line) {
    let message
    try {
      message = JSON.parse(line)
    } catch {
      return
    }
    if (message.id !== undefined && message.method) {
      this.handleServerRequest(message)
      return
    }
    if (message.id !== undefined) {
      const entry = this.pending.get(message.id)
      if (!entry) return
      this.pending.delete(message.id)
      clearTimeout(entry.timer)
      if (message.error) entry.reject(new Error(message.error.message || 'Codex app-server error'))
      else entry.resolve(message.result)
      return
    }
    if (message.method) this.handleNotification(message)
  }

  runFor(params = {}) {
    const threadId =
      params.threadId ||
      params.thread?.id ||
      params.turn?.threadId ||
      params.item?.threadId ||
      null
    if (threadId && this.runsByThread.has(threadId)) return this.runsByThread.get(threadId)
    if (params.threadId) {
      for (const run of this.runs) if (run.threadId === params.threadId) return run
    }
    if (this.runs.size === 1) return [...this.runs][0]
    return null
  }

  handleServerRequest(message) {
    const id = message.id
    const key = String(id)
    const params = message.params || {}
    const run = this.runFor(params)
    if (!run) {
      this.respond(id, undefined, { code: -32601, message: `no active run for ${message.method}` })
      return
    }
    if (message.method === 'item/commandExecution/requestApproval') {
      run.serverRequests.set(key, { id, kind: 'command', params, method: message.method })
      run.emit({
        type: 'approval',
        requestId: key,
        callId: params.itemId || null,
        toolName: 'bash',
        reason: params.reason || params.command || '命令请求更高权限',
        displayReason: null,
      })
      return
    }
    if (message.method === 'item/fileChange/requestApproval') {
      run.serverRequests.set(key, { id, kind: 'file', params, method: message.method })
      run.emit({
        type: 'approval',
        requestId: key,
        callId: params.itemId || null,
        toolName: 'apply_patch',
        reason: params.reason || (params.grantRoot ? `请求写入 ${params.grantRoot}` : '文件修改请求授权'),
        displayReason: null,
      })
      return
    }
    if (message.method === 'item/permissions/requestApproval') {
      run.serverRequests.set(key, { id, kind: 'permissions', params, method: message.method })
      run.emit({
        type: 'approval',
        requestId: key,
        callId: params.itemId || null,
        toolName: 'permissions',
        reason: params.reason || `请求额外权限：${params.cwd || ''}`,
        displayReason: null,
      })
      return
    }
    if (message.method === 'item/tool/requestUserInput') {
      run.serverRequests.set(key, { id, kind: 'question', params, method: message.method })
      const questions = (params.questions || []).map((question) => ({
        id: question.id,
        header: question.header,
        question: question.question,
        options: (question.options || []).map((option) => ({
          label: option.label,
          description: option.description,
        })),
        multiSelect: false,
      }))
      run.emit({
        type: 'question',
        requestId: key,
        callId: params.itemId || null,
        questions,
      })
      return
    }
    if (message.method === 'mcpServer/elicitation/request') {
      const serverName = String(params.serverName || '')
      const messageText = String(params.message || '')
      const computerUse = /computer-use/i.test(serverName) || /Computer Use/i.test(messageText)
      if (!computerUse) {
        this.respond(id, { action: 'decline', content: null, _meta: null })
        return
      }
      run.serverRequests.set(key, { id, kind: 'elicitation', params, method: message.method })
      run.emit({
        type: 'approval',
        requestId: key,
        callId: params.turnId || params._meta?.tool_call_id || null,
        toolName: 'computer-use',
        reason: messageText || 'Computer Use 请求使用应用',
        displayReason: null,
      })
      return
    }
    if (message.method === 'execCommandApproval' || message.method === 'applyPatchApproval') {
      const legacy = message.method === 'execCommandApproval'
      run.serverRequests.set(key, {
        id,
        kind: legacy ? 'command' : 'file',
        legacy: true,
        params,
        method: message.method,
      })
      run.emit({
        type: 'approval',
        requestId: key,
        callId: params.callId || null,
        toolName: legacy ? 'bash' : 'apply_patch',
        reason: params.reason || (legacy ? (params.command || []).join(' ') : '文件修改请求授权'),
        displayReason: null,
      })
      return
    }
    this.respond(id, undefined, { code: -32601, message: `unsupported server request: ${message.method}` })
  }

  respond(id, result, error) {
    this.send(error ? { id, error } : { id, result })
  }

  handleNotification(message) {
    const params = message.params || {}
    const method = message.method
    if (method === 'thread/started') {
      const threadId = params.thread?.id
      if (!threadId) return
      this.loadedThreads.set(threadId, Date.now())
      const run = this.runsByThread.get(threadId) || this.runFor(params)
      if (run && !run.threadId) {
        run.threadId = threadId
        this.runsByThread.set(threadId, run)
        run.emit({ type: 'thread', threadId })
      }
      return
    }
    const run = this.runFor(params)
    if (!run) return

    if (method === 'item/agentMessage/delta') {
      if (params.delta) run.emit({ type: 'delta', kind: 'text', text: params.delta })
      return
    }
    if (method === 'item/reasoning/textDelta' || method === 'item/reasoning/summaryTextDelta') {
      if (params.delta) run.emit({ type: 'delta', kind: 'thinking', text: params.delta })
      return
    }
    if (method === 'item/reasoning/summaryPartAdded') {
      run.emit({ type: 'delta', kind: 'thinking', text: '\n\n' })
      return
    }
    if (method === 'item/started') {
      this.handleItem(run, params.item, 'started')
      return
    }
    if (method === 'item/completed') {
      this.handleItem(run, params.item, 'completed')
      return
    }
    if (method === 'turn/started') {
      run.turnId = params.turn?.id || run.turnId
      if (!run.turnStarted) {
        run.turnStarted = true
        run.emit({ type: 'status', phase: 'turn_start', turn: 1 })
      }
      return
    }
    if (method === 'turn/completed') {
      const turn = params.turn || {}
      for (const item of turn.items || []) this.handleItem(run, item, 'completed')
      run.emit({ type: 'status', phase: 'turn_end', usage: run.usage || null })
      if (turn.status === 'completed') this.finishRun(run, 'done')
      else if (turn.status === 'interrupted') this.finishRun(run, 'stopped')
      else this.finishRun(run, 'error', turn.error?.message || 'Codex 处理失败')
      return
    }
    if (method === 'thread/tokenUsage/updated') {
      const usage = this.usageOf(params.tokenUsage?.last || params.tokenUsage?.total)
      if (usage) {
        run.usage = usage
        run.emit({ type: 'usage', usage })
      }
      return
    }
    if (method === 'error') {
      const text = params.error?.message || params.message || ''
      if (!text) return
      if (params.willRetry !== false) {
        this.note(run, text)
      } else {
        run.lastError = text
        run.emit({ type: 'error', message: text })
      }
      return
    }
    if (method === 'warning') {
      const text = params.message || ''
      if (text) this.note(run, text)
      return
    }
  }

  note(run, message) {
    const text = String(message || '')
    if (!text) return
    // Transport fallback chatter is not actionable and used to surface as a
    // misleading "connection is slow" banner on every new conversation.
    if (/Falling back from WebSockets|Reconnecting|timed out|WebSocket/i.test(text)) return
    if (run.noted === text) return
    run.noted = text
    run.emit({ type: 'notice', text })
  }

  usageOf(value) {
    if (!value) return null
    return {
      inputTokens: Number(value.inputTokens) || 0,
      outputTokens: Number(value.outputTokens) || 0,
      cacheReadTokens: Number(value.cachedInputTokens) || 0,
      cacheWriteTokens: Number(value.cacheWriteInputTokens) || 0,
      totalTokens:
        Number(value.totalTokens) ||
        (Number(value.inputTokens) || 0) + (Number(value.outputTokens) || 0),
      steps: 1,
    }
  }

  toolNameOf(item) {
    if (!item || typeof item !== 'object') return 'tool'
    if (item.type === 'commandExecution') return 'bash'
    if (item.type === 'fileChange') return 'apply_patch'
    if (item.type === 'mcpToolCall') return `${item.server || 'mcp'}/${item.tool || 'tool'}`
    if (item.type === 'dynamicToolCall') return item.tool || 'tool'
    if (item.type === 'webSearch') return 'web_search'
    return item.type || 'tool'
  }

  toolInputOf(item) {
    if (!item || typeof item !== 'object') return null
    if (item.type === 'commandExecution') return { command: item.command, cwd: item.cwd }
    if (item.type === 'fileChange') return { changes: item.changes || [] }
    if (item.type === 'mcpToolCall') return item.arguments ?? null
    if (item.type === 'dynamicToolCall') return item.arguments ?? null
    if (item.type === 'webSearch') return { query: item.query || item.action?.query || '' }
    return null
  }

  emitToolStarted(run, item) {
    if (!item?.id || run.startedItems.has(item.id)) return
    if (!['commandExecution', 'fileChange', 'mcpToolCall', 'dynamicToolCall', 'webSearch'].includes(item.type)) return
    run.startedItems.add(item.id)
    run.emit({
      type: 'tool_call',
      callId: item.id,
      tool: this.toolNameOf(item),
      input: this.toolInputOf(item),
    })
    if (item.type === 'fileChange') {
      for (const change of item.changes || []) {
        if (change?.path) run.emit({ type: 'file', path: change.path })
      }
    }
  }

  emitToolCompleted(run, item) {
    if (!item?.id || run.completedItems.has(item.id)) return
    if (!['commandExecution', 'fileChange', 'mcpToolCall', 'dynamicToolCall', 'webSearch'].includes(item.type)) return
    run.completedItems.add(item.id)
    this.emitToolStarted(run, item)
    let status = 'completed'
    let result = ''
    if (item.type === 'commandExecution') {
      if (item.status === 'failed' || item.status === 'declined') status = 'failed'
      else if (Number(item.exitCode)) status = 'failed'
      result = item.aggregatedOutput || ''
    } else if (item.type === 'fileChange') {
      if (item.status === 'failed') status = 'failed'
      result = (item.changes || [])
        .map((change) => `${change.kind || 'change'} ${change.path || ''}`)
        .join('\n')
    } else if (item.type === 'mcpToolCall') {
      if (item.status === 'failed' || item.error) status = 'failed'
      result = item.result?.content
        ? JSON.stringify(item.result.content)
        : item.error
          ? JSON.stringify(item.error)
          : ''
    } else if (item.type === 'webSearch') {
      result = item.query || ''
    } else if (item.type === 'dynamicToolCall') {
      if (item.success === false) status = 'failed'
      result = item.contentItems ? JSON.stringify(item.contentItems) : ''
    }
    const text = String(result || '')
    run.emit({
      type: 'tool_result',
      callId: item.id,
      status,
      result: text.length > 12_000 ? `${text.slice(0, 12_000)}\n…（已截断）` : text,
    })
  }

  handleItem(run, item, phase) {
    if (!item || typeof item !== 'object') return
    if (item.type === 'agentMessage') {
      if (phase === 'completed' && !run.completedItems.has(item.id)) {
        run.completedItems.add(item.id)
        if (item.text) run.emit({ type: 'text', text: item.text })
      }
      return
    }
    if (item.type === 'reasoning') {
      if (phase === 'completed' && !run.completedItems.has(item.id)) {
        run.completedItems.add(item.id)
        const text = [...(item.content || []), ...(item.summary || [])].filter(Boolean).join('\n')
        if (text) run.emit({ type: 'thinking', text })
      }
      return
    }
    if (phase === 'started') this.emitToolStarted(run, item)
    else if (phase === 'completed') this.emitToolCompleted(run, item)
  }

  async resumeThread(run, threadId, options) {
    const sandbox = options.sandbox
    const payload = {
      threadId,
      cwd: options.cwd,
      approvalPolicy: options.approvalPolicy,
      sandbox,
      model: options.model || null,
      excludeTurns: true,
    }
    let resumed
    try {
      // New threads are pinned to the HTTPS provider. Older threads may have
      // been recorded with the default provider; if the pinned resume is
      // rejected, retry with the thread's own provider so context survives.
      resumed = await this.request(
        'thread/resume',
        { ...payload, modelProvider: this.provider },
        CALL_TIMEOUT_MS,
      )
    } catch (error) {
      resumed = await this.request('thread/resume', payload, CALL_TIMEOUT_MS)
    }
    const id = resumed?.thread?.id || threadId
    const isNew = run.threadId !== id
    this.loadedThreads.set(id, Date.now())
    run.threadId = id
    this.runsByThread.set(id, run)
    if (isNew) run.emit({ type: 'thread', threadId: id })
    return id
  }

  async startThread(run, options) {
    const started = await this.request('thread/start', {
      cwd: options.cwd,
      model: options.model || null,
      modelProvider: this.provider,
      approvalPolicy: options.approvalPolicy,
      sandbox: options.sandbox,
      ephemeral: options.ephemeral === true ? true : null,
    })
    const threadId = started?.thread?.id || started?.threadId
    if (!threadId) throw new Error('Codex app-server 未返回 thread id')
    const isNew = run.threadId !== threadId
    this.loadedThreads.set(threadId, Date.now())
    run.threadId = threadId
    this.runsByThread.set(threadId, run)
    if (isNew) run.emit({ type: 'thread', threadId })
    return threadId
  }

  async startTurn(run, options) {
    const payload = {
      threadId: run.threadId,
      input: [{ type: 'text', text: String(options.prompt), text_elements: [] }],
    }
    if (options.model) payload.model = options.model
    if (options.effort) payload.effort = options.effort
    payload.summary = 'auto'
    let result
    try {
      result = await this.request('turn/start', payload, 60_000)
    } catch (error) {
      if (/not loaded|thread not found|unknown thread/i.test(error.message) && options.resume) {
        await this.resumeThread(run, run.threadId, options)
        result = await this.request('turn/start', payload, 60_000)
      } else {
        throw error
      }
    }
    run.turnId = result?.turn?.id || run.turnId
    if (!run.turnStarted) {
      run.turnStarted = true
      run.emit({ type: 'status', phase: 'turn_start', turn: 1 })
    }
  }

  async execute(run, options) {
    await this.ensureStarted()
    if (run.stopping || run.finished) return
    if (run.threadId) {
      this.runsByThread.set(run.threadId, run)
    } else if (options.threadId) {
      run.threadId = options.threadId
      this.runsByThread.set(options.threadId, run)
      if (!this.loadedThreads.has(options.threadId)) {
        try {
          await this.resumeThread(run, options.threadId, options)
        } catch {
          run.emit({ type: 'notice', text: '原 Codex 会话不可用，已开始新会话。' })
          run.threadId = null
          this.runsByThread.delete(options.threadId)
          await this.startThread(run, options)
        }
      } else {
        run.emit({ type: 'thread', threadId: options.threadId })
      }
    } else {
      await this.startThread(run, options)
    }
    if (run.stopping || run.finished) return
    await this.startTurn(run, { ...options, resume: true })
  }

  startRun(options) {
    const {
      prompt,
      cwd,
      threadId = null,
      permission = 'workspace-write',
      model = null,
      effort = null,
      onEvent,
      timeoutMs = RUN_TIMEOUT_MS,
    } = options || {}

    const emit = (event) => {
      try {
        onEvent?.(event)
      } catch {}
    }
    try {
      fs.mkdirSync(cwd, { recursive: true })
    } catch (error) {
      emit({ type: 'error', message: `无法创建工作区：${error.message}` })
      return {
        done: Promise.resolve({ status: 'error', error: `无法创建工作区：${error.message}` }),
        kill: () => {},
        answerApproval: () => false,
        answerQuestion: () => false,
        get threadId() {
          return threadId
        },
      }
    }

    const sandbox = ['read-only', 'workspace-write', 'danger-full-access'].includes(permission)
      ? permission
      : 'workspace-write'
    const approvalPolicy = sandbox === 'danger-full-access' ? 'never' : 'on-request'
    const run = {
      id: ++this.seq,
      threadId: safeId(threadId) ? threadId : null,
      turnId: null,
      turnStarted: false,
      startedAt: Date.now(),
      usage: null,
      lastError: '',
      noted: '',
      finished: false,
      stopping: false,
      serverRequests: new Map(),
      startedItems: new Set(),
      completedItems: new Set(),
      emit,
    }
    run.requestKey = `codex-${run.id}`
    this.runs.add(run)
    if (run.threadId) this.runsByThread.set(run.threadId, run)

    run.done = new Promise((resolve) => {
      run.resolveDone = resolve
    })
    run.timer = setTimeout(() => {
      if (run.finished) return
      run.timedOut = true
      emit({ type: 'notice', text: 'Codex 运行超时，正在停止…' })
      this.killRun(run)
    }, timeoutMs)
    run.timer.unref?.()

    const optionsForRun = {
      prompt,
      cwd,
      threadId: run.threadId,
      model: safeId(model),
      effort: safeId(effort),
      sandbox,
      approvalPolicy,
      ephemeral: options.ephemeral === true,
    }
    this.execute(run, optionsForRun)
      .then(() => {})
      .catch((error) => {
        if (run.finished) return
        const message = error?.message || 'Codex app-server 初始化失败'
        run.lastError = message
        emit({ type: 'error', message })
        this.finishRun(run, 'error', message)
      })

    return {
      done: run.done,
      kill: () => this.killRun(run),
      answerApproval: (requestId, decision) => this.answerApproval(run, requestId, decision),
      answerQuestion: (requestId, answers) => this.answerQuestion(run, requestId, answers),
      get threadId() {
        return run.threadId
      },
    }
  }

  declinePending(run) {
    for (const [key, entry] of run.serverRequests) {
      run.serverRequests.delete(key)
      try {
        if (entry.kind === 'question') this.respond(entry.id, { answers: {} })
        else if (entry.kind === 'permissions') this.respond(entry.id, { permissions: {}, scope: 'turn' })
        else if (entry.kind === 'elicitation') this.respond(entry.id, { action: 'decline', content: null, _meta: null })
        else if (entry.legacy) this.respond(entry.id, { decision: 'denied' })
        else this.respond(entry.id, { decision: 'decline' })
      } catch {}
    }
  }

  finishRun(run, status, error) {
    if (run.finished) return
    run.finished = true
    clearTimeout(run.timer)
    this.declinePending(run)
    if (run.threadId && this.runsByThread.get(run.threadId) === run) this.runsByThread.delete(run.threadId)
    this.runs.delete(run)
    run.resolveDone?.({
      status,
      error: error || null,
      durationMs: Date.now() - run.startedAt,
      usage: run.usage,
      threadId: run.threadId,
      timedOut: Boolean(run.timedOut),
    })
  }

  killRun(run) {
    if (run.finished) return
    run.stopping = true
    if (run.threadId && run.turnId) {
      this.send({ id: this.nextId++, method: 'turn/interrupt', params: { threadId: run.threadId, turnId: run.turnId } })
    }
    this.declinePending(run)
    const timer = setTimeout(() => {
      if (!run.finished) this.finishRun(run, 'stopped')
    }, 5000)
    timer.unref?.()
  }

  answerApproval(run, requestId, decision) {
    const key = String(requestId)
    const entry = run.serverRequests.get(key)
    if (!entry || entry.kind === 'question') return false
    run.serverRequests.delete(key)
    const allow = decision === 'allow' || decision === 'allow-always' || decision === 'allow-full'
    const forSession = decision === 'allow-always' || decision === 'allow-full'
    if (entry.kind === 'permissions') {
      this.respond(entry.id, {
        permissions: allow ? entry.params.permissions || {} : {},
        scope: forSession ? 'session' : 'turn',
      })
      return true
    }
    if (entry.kind === 'elicitation') {
      this.respond(entry.id, {
        action: allow ? 'accept' : 'decline',
        content: null,
        _meta: forSession ? { persist: 'always' } : null,
      })
      return true
    }
    if (entry.legacy) {
      this.respond(entry.id, { decision: allow ? 'approved' : 'denied' })
      return true
    }
    this.respond(entry.id, { decision: allow ? (forSession ? 'acceptForSession' : 'accept') : 'decline' })
    return true
  }

  answerQuestion(run, requestId, answers) {
    const key = String(requestId)
    const entry = run.serverRequests.get(key)
    if (!entry || entry.kind !== 'question') return false
    run.serverRequests.delete(key)
    const payload = { answers: {} }
    for (const answer of Array.isArray(answers) ? answers : []) {
      if (!answer || typeof answer.id !== 'string') continue
      const values = []
      if (typeof answer.custom === 'string' && answer.custom.trim()) values.push(answer.custom.trim())
      if (Array.isArray(answer.selected)) {
        for (const selected of answer.selected) {
          if (typeof selected === 'string' && selected && !values.includes(selected)) values.push(selected)
        }
      }
      payload.answers[answer.id] = { answers: values }
    }
    this.respond(entry.id, payload)
    return true
  }

  async listModels({ force = false, timeout = 12_000 } = {}) {
    if (!force && this.modelCache && Date.now() - this.modelCache.updatedAt < MODEL_CACHE_MS) {
      return { ...this.modelCache, source: 'live' }
    }
    if (this.modelsPromise) return this.modelsPromise
    this.modelsPromise = (async () => {
      await this.ensureStarted()
      const result = await this.request('model/list', { limit: 100, includeHidden: false }, timeout)
      const models = (result?.data || []).map(normalizeModel).filter(Boolean)
      if (!models.length) throw new Error('Codex 未返回可用模型')
      const preferred = models.find((model) => model.default) || models[0]
      this.modelCache = {
        models,
        defaultModel: preferred.id,
        updatedAt: Date.now(),
      }
      writeModelCache(this.modelCache)
      return { ...this.modelCache, source: 'live' }
    })()
      .catch((error) => {
        if (this.modelCache) return { ...this.modelCache, source: 'cache', error: error.message }
        return { ...fallbackCatalog(this.defaults), source: 'fallback', error: error.message }
      })
      .finally(() => {
        this.modelsPromise = null
      })
    return this.modelsPromise
  }

  currentModels() {
    if (this.modelCache) return { ...this.modelCache, source: 'cache' }
    return fallbackCatalog(this.defaults)
  }

  async setThreadName(threadId, name) {
    const id = safeId(threadId)
    const title = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 120)
    if (!id || !title) return false
    try {
      await this.ensureStarted()
      await this.request('thread/name/set', { threadId: id, name: title }, 10_000)
      return true
    } catch {
      return false
    }
  }

  async prewarmTransport() {
    if (config.codexPrewarm === false) return false
    if (this.prewarmPromise) return this.prewarmPromise
    this.prewarmPromise = (async () => {
      await this.ensureStarted()
      const catalog = await this.listModels({ timeout: 15_000 }).catch(() => this.currentModels())
      const model = catalog.defaultModel || this.defaults.model
      if (!model) return false
      const run = this.startRun({
        prompt: 'Reply with exactly: ok',
        cwd: os.homedir(),
        permission: 'read-only',
        model,
        effort: 'low',
        ephemeral: true,
        timeoutMs: 150_000,
        onEvent: () => {},
      })
      await run.done
      return true
    })()
      .catch(() => false)
      .finally(() => {
        this.prewarmPromise = null
      })
    return this.prewarmPromise
  }

  async warm() {
    try {
      await this.ensureStarted()
      await this.listModels({ force: true }).catch(() => {})
      if (config.codexPrewarm === true) {
        void this.prewarmTransport().then((ok) => {
          if (ok) console.log('[codex] 传输已预热')
        })
      }
      return true
    } catch (error) {
      console.error('[codex] 预热失败：', error.message)
      return false
    }
  }

  shutdown() {
    this.closed = true
    for (const run of [...this.runs]) this.finishRun(run, 'stopped')
    const child = this.child
    if (!child) return
    this.child = null
    try {
      child.kill('SIGTERM')
    } catch {}
  }
}

export const codexBridge = new CodexBridge()
export { effortLabel, FALLBACK_EFFORTS }
