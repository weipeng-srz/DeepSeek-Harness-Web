/**
 * DSH Chat bridge — native session server inside the DeepSeek Harness host.
 *
 * It listens on loopback only, authenticates with a token file, and speaks a
 * small JSON-RPC dialect:
 *   initialize, session/prompt, session/resume, session/wait,
 *   session/working-directory/get|set,
 *   chat/attachWorkspace, chat/abort, chat/ping.
 *
 * Sessions are created through the host's own Agent registry with the Desktop
 * agent preset mounted, so they get the same tools, prompts and model route as
 * a session started in the app, and they are registered in the Desktop
 * workspace index. No subprocess, no second store.
 */
import net from 'node:net'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { StringDecoder } from 'node:string_decoder'

export const name = 'dsh-chat-bridge'

const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const TOKEN_FILE = path.join(DSH_HOME, 'chat-bridge.token')
const LOG_FILE = path.join(DSH_HOME, 'chat-bridge.log')
const MAX_LOG_BYTES = 512 * 1024
const MAX_TRACKED = 500

function log(...parts) {
  try {
    const line = `${new Date().toISOString()} ${parts.join(' ')}\n`
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > MAX_LOG_BYTES) fs.writeFileSync(LOG_FILE, '')
    fs.appendFileSync(LOG_FILE, line)
  } catch {}
}

function ensureToken() {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const existing = fs.readFileSync(TOKEN_FILE, 'utf8').trim()
      if (existing.length >= 16) return existing
    }
    const token = crypto.randomBytes(32).toString('hex')
    fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true })
    fs.writeFileSync(TOKEN_FILE, token, { mode: 0o600 })
    return token
  } catch (error) {
    log('token: failed to persist', String(error))
    return crypto.randomBytes(32).toString('hex')
  }
}

export function apply(ctx, config = {}) {
  const host = config.host || '127.0.0.1'
  const port = Number(config.port) || 47821
  const requestedPreset = typeof config.preset === 'string' && config.preset ? config.preset : undefined
  const token = ensureToken()

  let socket = null
  let authed = false
  let clientBuffer = ''
  const decoder = new StringDecoder('utf8')

  const init = { ready: false, cwd: process.cwd(), provider: 'deepseek-official', model: 'deepseek-flash', presetId: undefined }
  const handles = new Map()
  const tracked = new Set()
  const pendingQuestions = new Map()
  const pendingApprovals = new Map()
  const permissionBySession = new Map()
  const handledApprovalRequests = new WeakSet()
  const APPROVAL_CANCELLED = Symbol('approval-cancelled')
  const webRuns = new Set()
  const watchedAgents = new WeakSet()
  const seenFrames = new Set()
  const QUESTION_CANCELLED = Symbol('question-cancelled')

  function send(payload) {
    if (!socket || socket.destroyed || !authed) return
    try {
      socket.write(JSON.stringify(payload) + '\n')
    } catch {}
  }

  function notify(method, params) {
    send({ jsonrpc: '2.0', method, params })
  }

  function reply(id, result) {
    send({ jsonrpc: '2.0', id, result })
  }

  function replyError(id, code, message) {
    send({ jsonrpc: '2.0', id, error: { code, message } })
  }

  function applyPermissionToAgent(agent, permission) {
    if (!agent || typeof permission !== 'string' || !permission) return false
    const presets = ctx.get('permissionPresets')
    if (presets?.set) {
      try {
        presets.set(agent.session, permission)
        log('permission:', agent.session.id, permission)
        return true
      } catch (error) {
        log('permission: preset switch failed', String(error?.message || error))
      }
    }
    // Fallback for older profiles without the permission-presets service. The
    // sandbox stays at the composition default, but approvals still follow the
    // selected level.
    const approval = ctx.get('approval')
    if (approval?.setPolicy) {
      try {
        approval.setPolicy(agent, permission === 'danger-full-access' ? 'never' : 'ask')
        log('permission: approval fallback', agent.session.id, permission)
        return true
      } catch (error) {
        log('permission: approval fallback failed', String(error?.message || error))
      }
    }
    return false
  }

  function applyPermission(sessionId, permission) {
    if (typeof sessionId !== 'string' || !sessionId) return false
    if (typeof permission !== 'string' || !permission) return false
    permissionBySession.set(sessionId, permission)
    const agent = ctx.get('agents')?.get(sessionId)
    return agent ? applyPermissionToAgent(agent, permission) : false
  }

  ctx.on('session/event', (session, event) => {
    const sessionId = String(session.id)
    if (!tracked.has(sessionId)) return
    notify('session.event', { sessionId, event })
  })

  ctx.on('agent/status', ({ agent, status }) => {
    const sessionId = String(agent.session.id)
    if (!tracked.has(sessionId)) return
    notify('session.status', { sessionId, status })
  })

  ctx.on('agent/error', ({ agent, error }) => {
    const sessionId = String(agent.session.id)
    if (!tracked.has(sessionId)) return
    notify('chat/agentError', { sessionId, message: String(error?.message || error) })
  })

  ctx.on('session/created', (session) => {
    if (session.header.parentSession === undefined) return
    const childSessionId = String(session.id)
    const parentSessionId = String(session.header.parentSession)
    if (!tracked.has(parentSessionId)) return
    notify('subagent.started', { parentSessionId, childSessionId })
  })

  function cancelQuestion(requestId) {
    const entry = pendingQuestions.get(requestId)
    if (!entry) return false
    pendingQuestions.delete(requestId)
    entry.settle(QUESTION_CANCELLED)
    return true
  }

  function cancelAllQuestions() {
    for (const requestId of [...pendingQuestions.keys()]) cancelQuestion(requestId)
  }

  function cancelAllApprovals() {
    for (const requestId of [...pendingApprovals.keys()]) cancelApproval(requestId)
  }

  function cancelQuestionsForSession(sessionId) {
    for (const [requestId, entry] of pendingQuestions) {
      if (entry.sessionId === sessionId) cancelQuestion(requestId)
    }
  }

  function cancelApproval(requestId) {
    const entry = pendingApprovals.get(requestId)
    if (!entry) return false
    pendingApprovals.delete(requestId)
    entry.settle(APPROVAL_CANCELLED)
    if (socket && !socket.destroyed) {
      notify('chat/approvalCancelled', { requestId })
    }
    return true
  }

  function cancelApprovalsForSession(sessionId) {
    for (const [requestId, entry] of pendingApprovals) {
      if (entry.sessionId === sessionId) cancelApproval(requestId)
    }
  }

  ctx.on('user-questions/request', async (request, next) => {
    const agent = request?.agent
    const sessionId = String(agent?.session?.id ?? agent?.id ?? '')
    if (
      !sessionId ||
      !tracked.has(sessionId) ||
      !webRuns.has(sessionId) ||
      !socket ||
      socket.destroyed ||
      !authed ||
      !Array.isArray(request.questions) ||
      request.questions.length === 0
    ) {
      return next()
    }
    const requestId = crypto.randomUUID()
    let settle
    const promise = new Promise((resolve) => {
      settle = resolve
    })
    const entry = { settle, sessionId, signal: request.signal, onAbort: null }
    pendingQuestions.set(requestId, entry)
    entry.onAbort = () => cancelQuestion(requestId)
    if (request.signal) {
      if (request.signal.aborted) cancelQuestion(requestId)
      else request.signal.addEventListener('abort', entry.onAbort, { once: true })
    }
    notify('chat/question', {
      sessionId,
      requestId,
      callId: request.wait?.callId ?? null,
      questions: request.questions,
    })
    let result = QUESTION_CANCELLED
    try {
      result = await promise
    } finally {
      if (request.signal && entry.onAbort) {
        request.signal.removeEventListener('abort', entry.onAbort)
      }
    }
    return result === QUESTION_CANCELLED ? next() : result
  }, { prepend: true })

  async function handleApprovalRequest(request, next) {
    const agent = request?.agent
    const sessionId = String(agent?.session?.id ?? agent?.id ?? '')
    if (
      !sessionId ||
      !tracked.has(sessionId) ||
      !webRuns.has(sessionId) ||
      !socket ||
      socket.destroyed ||
      !authed ||
      typeof request?.toolName !== 'string' ||
      !request.toolName
    ) {
      return next()
    }
    if (handledApprovalRequests.has(request)) return next()
    handledApprovalRequests.add(request)

    const requestId = crypto.randomUUID()
    let settle
    const promise = new Promise((resolve) => {
      settle = resolve
    })
    const entry = { settle, sessionId, signal: request.signal, onAbort: null }
    pendingApprovals.set(requestId, entry)
    entry.onAbort = () => cancelApproval(requestId)
    if (request.signal) {
      if (request.signal.aborted) cancelApproval(requestId)
      else request.signal.addEventListener('abort', entry.onAbort, { once: true })
    }

    log('approval: request', sessionId, request.toolName)
    notify('chat/approval', {
      sessionId,
      requestId,
      callId: request.callId ?? null,
      toolName: request.toolName,
      reason: request.reason ?? null,
      displayReason: request.displayReason ?? null,
    })

    let result = APPROVAL_CANCELLED
    try {
      result = await promise
    } finally {
      if (request.signal && entry.onAbort) {
        request.signal.removeEventListener('abort', entry.onAbort)
      }
    }
    if (result === APPROVAL_CANCELLED) return 'cancelled'
    return result
  }

  ctx.on('approval/request', (request, next) => handleApprovalRequest(request, next), {
    prepend: true,
  })

  function onAssistantFrame(frame) {
    if (!frame || frame.type !== 'chunk') return
    const attemptId = String(frame.attemptId || '')
    const cut = attemptId.lastIndexOf(':')
    if (cut <= 0) return
    const sessionId = attemptId.slice(0, cut)
    if (!tracked.has(sessionId) || !webRuns.has(sessionId)) return
    const key = `${attemptId}:${frame.revision}`
    if (seenFrames.has(key)) return
    seenFrames.add(key)
    if (seenFrames.size > 8000) seenFrames.clear()
    const chunk = frame.chunk
    if (!chunk) return
    if (chunk.type === 'text-delta' && typeof chunk.text === 'string' && chunk.text) {
      notify('session.delta', { sessionId, kind: 'text', text: chunk.text })
    } else if (chunk.type === 'reasoning-delta' && typeof chunk.text === 'string' && chunk.text) {
      notify('session.delta', { sessionId, kind: 'thinking', text: chunk.text })
    }
  }

  function watchAgent(agent, sessionId) {
    if (!agent || watchedAgents.has(agent)) return
    watchedAgents.add(agent)
    agent.ctx.on('agent/assistant-stream', ({ frame }) => onAssistantFrame(frame))
    agent.ctx.on('approval/request', (request, next) => handleApprovalRequest(request, next), {
      prepend: true,
    })
  }

  ctx.on('agent/assistant-stream', ({ frame }) => onAssistantFrame(frame))

  function track(sessionId) {
    if (typeof sessionId !== 'string' || !sessionId) return
    if (tracked.size > MAX_TRACKED) tracked.clear()
    tracked.add(sessionId)
  }

  async function ensureAgent(sessionId, resume) {
    const agents = ctx.get('agents')
    if (!agents) throw new Error('agent registry is unavailable')
    const existing = agents.get(sessionId)
    if (existing) {
      tracked.add(sessionId)
      watchAgent(existing, sessionId)
      return existing
    }

    let presetId = init.presetId
    let setup
    const presets = ctx.get('agentPresets')
    if (presets) {
      const resolved = await presets.resolve(requestedPreset ?? init.presetId)
      presetId = resolved.id
      setup = async (agentCtx, agent) => {
        await presets.mount(agentCtx, presetId)
        agent.session.append('agent-preset/selected', { agentPreset: presetId })
      }
    } else {
      log('preset: registry unavailable; creating a bare agent')
    }

    const options = {
      ...(resume ? { resumeSessionId: sessionId } : { sessionId }),
      agentOptions: {
        provider: init.provider,
        model: init.model,
        ...(init.reasoningEffort === undefined ? {} : { reasoningEffort: init.reasoningEffort }),
      },
      ...(resume
        ? {}
        : { meta: { cwd: init.cwd, ...(presetId === undefined ? {} : { agentPreset: presetId }) } }),
      ...(setup === undefined ? {} : { setup }),
    }

    const handle = resume ? await agents.resume(options) : await agents.create(options)
    handles.set(sessionId, handle)
    tracked.add(sessionId)
    watchAgent(handle.agent, sessionId)
    log('session:', resume ? 'resumed' : 'created', sessionId, 'preset=' + String(presetId))
    return handle.agent
  }

  async function handleInitialize(params) {
    if (!params || typeof params.cwd !== 'string' || !params.cwd.startsWith('/')) {
      throw new Error('initialize requires an absolute cwd')
    }
    const provider = String(params.provider || '')
    const model = String(params.model || '')
    if (!provider || !model) throw new Error('initialize requires provider and model')
    await ctx.get('loader')?.await()
    const llm = ctx.get('llm')
    if (!llm) throw new Error('llm registry is unavailable')
    await llm.resolveCallConfig({
      provider,
      model,
      ...(params.reasoningEffort ? { reasoningEffort: params.reasoningEffort } : {}),
      ...(Number.isSafeInteger(params.maxTokens) && params.maxTokens > 0 ? { maxTokens: params.maxTokens } : {}),
    })
    fs.mkdirSync(params.cwd, { recursive: true })
    init.cwd = path.resolve(params.cwd)
    init.provider = provider
    init.model = model
    init.reasoningEffort = params.reasoningEffort
    init.ready = true
    const presets = ctx.get('agentPresets')
    if (presets) {
      try {
        init.presetId = (await presets.resolve(requestedPreset ?? params.preset)).id
      } catch (error) {
        init.presetId = undefined
        log('preset: resolve failed', String(error?.message || error))
      }
    }
    log('initialize:', init.cwd, provider, model, 'preset=' + String(init.presetId))
    return {
      serverInfo: { name: 'dsh-chat-native-bridge', version: '1.0.0' },
      preset: init.presetId,
      cwd: init.cwd,
    }
  }

  async function attachWorkspace(params) {
    const registry = ctx.get('workspaceRegistry')
    if (!registry) throw new Error('desktop workspace registry is unavailable')
    const sessionId = params?.sessionId
    const workspacePath = params?.path
    if (typeof sessionId !== 'string' || !sessionId) throw new Error('attachWorkspace requires sessionId')
    if (typeof workspacePath !== 'string' || !workspacePath.startsWith('/')) {
      throw new Error('attachWorkspace requires an absolute path')
    }
    fs.mkdirSync(workspacePath, { recursive: true })
    const workspace = await registry.create(workspacePath, params.title || undefined)
    let lastError
    for (let attempt = 0; attempt < 25; attempt += 1) {
      try {
        await workspace.attachSession(sessionId)
        log('workspace: attached', sessionId, 'to', workspacePath)
        return { workspaceId: String(workspace.id), path: workspacePath, title: workspace.title }
      } catch (error) {
        lastError = error
        if (!/not found|cannot attach|no cwd|does not resolve|not a directory/i.test(String(error?.message))) break
        await new Promise((resolve) => setTimeout(resolve, 120))
      }
    }
    throw lastError || new Error('could not attach session to workspace')
  }

  async function dispatch(method, params) {
    const agents = ctx.get('agents')
    switch (method) {
      case 'initialize':
        return await handleInitialize(params)
      case 'session/resume': {
        if (!init.ready) throw new Error('bridge is not initialized')
        const sessionId = params?.sessionId
        if (typeof sessionId !== 'string' || !sessionId) throw new Error('session/resume requires sessionId')
        const existing = agents?.get(sessionId)
        if (existing) {
          track(sessionId)
          return { resumed: true }
        }
        await ensureAgent(sessionId, true)
        return {}
      }
      case 'session/prompt': {
        if (!init.ready) throw new Error('bridge is not initialized')
        const sessionId = params?.sessionId
        if (typeof sessionId !== 'string' || !sessionId) throw new Error('session/prompt requires sessionId')
        const blocks = Array.isArray(params?.contentBlocks) ? params.contentBlocks : null
        if (!blocks || blocks.length === 0) throw new Error('session/prompt requires contentBlocks')
        const agent = await ensureAgent(sessionId, false)
        track(sessionId)
        const requestedPermission =
          typeof params?.permission === 'string' && params.permission
            ? params.permission
            : permissionBySession.get(sessionId) || 'workspace-write'
        applyPermission(sessionId, requestedPermission)
        agent.followup({ content: blocks, source: { kind: 'user' } })
        return { accepted: true }
      }
      case 'session/wait': {
        const sessionId = params?.sessionId
        if (typeof sessionId !== 'string' || !sessionId) throw new Error('session/wait requires sessionId')
        const agent = agents?.get(sessionId)
        if (!agent) throw new Error(`unknown session: ${sessionId}`)
        await agent.whenIdle()
        return {}
      }
      case 'session/working-directory/get': {
        const sessionId = params?.sessionId
        if (typeof sessionId !== 'string' || !sessionId) throw new Error('working-directory get requires sessionId')
        const agent = await ensureAgent(sessionId, false)
        return { cwd: await ctx.get('workingDirectory').ensure(agent) }
      }
      case 'session/working-directory/set': {
        const sessionId = params?.sessionId
        if (typeof sessionId !== 'string' || !sessionId) throw new Error('working-directory set requires sessionId')
        if (typeof params?.path !== 'string') throw new Error('working-directory set requires path')
        const agent = await ensureAgent(sessionId, false)
        return { cwd: await ctx.get('workingDirectory').set(agent, params.path) }
      }
      case 'chat/attachWorkspace':
        return await attachWorkspace(params || {})
      case 'chat/beginRun': {
        const sessionId = params?.sessionId
        if (typeof sessionId !== 'string' || !sessionId) throw new Error('beginRun requires sessionId')
        webRuns.add(sessionId)
        return { ok: true }
      }
      case 'chat/endRun': {
        const sessionId = params?.sessionId
        if (typeof sessionId === 'string') {
          webRuns.delete(sessionId)
          cancelQuestionsForSession(sessionId)
          cancelApprovalsForSession(sessionId)
        }
        return { ok: true }
      }
      case 'chat/answerQuestion': {
        const requestId = params?.requestId
        const answers = params?.answers
        if (typeof requestId !== 'string' || !Array.isArray(answers)) {
          throw new Error('answerQuestion requires requestId and answers')
        }
        const entry = pendingQuestions.get(requestId)
        if (!entry) throw new Error('question is no longer pending')
        pendingQuestions.delete(requestId)
        entry.settle({ answers })
        return { ok: true }
      }
      case 'chat/answerApproval': {
        const requestId = params?.requestId
        const decision = params?.decision
        const allowAlways = decision === 'allow-always' || decision === 'allow-full'
        const allow =
          allowAlways ||
          decision === 'allow' ||
          decision === 'allow-once' ||
          decision === 'allowed-once'
        const reject = decision === 'reject' || decision === 'deny' || decision === 'rejected'
        if (typeof requestId !== 'string' || (!allow && !reject)) {
          throw new Error('answerApproval requires requestId and an allow/reject decision')
        }
        const entry = pendingApprovals.get(requestId)
        if (!entry) throw new Error('approval is no longer pending')
        pendingApprovals.delete(requestId)
        entry.settle(allow ? 'allowed-once' : 'rejected')
        if (allowAlways) applyPermission(entry.sessionId, 'danger-full-access')
        return { ok: true, permission: allowAlways ? 'danger-full-access' : undefined }
      }
      case 'chat/setPermission': {
        const sessionId = params?.sessionId
        const permission = params?.permission
        if (typeof sessionId !== 'string' || !sessionId) throw new Error('setPermission requires sessionId')
        if (typeof permission !== 'string' || !permission) throw new Error('setPermission requires permission')
        const applied = applyPermission(sessionId, permission)
        return { ok: true, applied }
      }
      case 'chat/permissionCatalog': {
        const presets = ctx.get('permissionPresets')
        if (presets?.catalog) {
          try {
            return presets.catalog()
          } catch (error) {
            log('permission: catalog failed', String(error?.message || error))
          }
        }
        return {
          options: [
            {
              value: 'workspace-write',
              name: 'workspace-write',
              description: 'Write inside the workspace; wider retries require approval.',
            },
            {
              value: 'danger-full-access',
              name: 'danger-full-access',
              description: 'Full file access without approval prompts.',
            },
          ],
          defaultOptions: ['workspace-write', 'danger-full-access'].map((value) => ({ value, name: value })),
          defaultPreset: 'workspace-write',
        }
      }
      case 'chat/archiveSession': {
        const sessionId = params?.sessionId
        if (typeof sessionId !== 'string' || !sessionId) throw new Error('archiveSession requires sessionId')
        const registry = ctx.get('workspaceRegistry')
        if (!registry) throw new Error('desktop workspace registry is unavailable')
        await registry.archiveSession(sessionId, { stopActivity: true })
        return { ok: true }
      }
      case 'chat/abort': {
        const sessionId = params?.sessionId
        const handle = handles.get(sessionId)
        const agent = handle?.agent ?? agents?.get(sessionId)
        if (!agent) return { ok: false, reason: 'not-running' }
        if (agent.status === 'running') agent.cancel({ kind: 'user' })
        return { ok: true }
      }
      case 'chat/ping':
        return { ok: true, pid: process.pid, port, preset: init.presetId }
      case 'shutdown':
        throw Object.assign(new Error('shutdown is disabled by the chat bridge'), { code: -32601 })
      default:
        throw Object.assign(new Error(`unknown method: ${method}`), { code: -32601 })
    }
  }

  async function handleLine(line) {
    let message
    try {
      message = JSON.parse(line)
    } catch {
      return
    }
    if (!message || message.id === undefined || typeof message.method !== 'string') return
    if (message.method === 'chat/ping' || message.method === 'chat/attachWorkspace' || message.method === 'chat/abort') {
      try {
        reply(message.id, await dispatch(message.method, message.params || {}))
      } catch (error) {
        replyError(message.id, Number(error?.code) || -32000, String(error?.message || error))
      }
      return
    }
    try {
      const result = await dispatch(message.method, message.params || {})
      reply(message.id, result)
    } catch (error) {
      const code = Number(error?.code)
      replyError(message.id, Number.isFinite(code) ? code : -32000, String(error?.message || error))
    }
  }

  const server = net.createServer((connection) => {
    if (socket && !socket.destroyed) {
      connection.destroy()
      return
    }
    socket = connection
    authed = false
    clientBuffer = ''
    connection.setNoDelay(true)
    log('client: connected')
    connection.on('data', (chunk) => {
      clientBuffer += decoder.write(chunk)
      if (!authed) {
        const index = clientBuffer.indexOf('\n')
        if (index < 0) return
        const preamble = clientBuffer.slice(0, index).trim()
        clientBuffer = clientBuffer.slice(index + 1)
        if (preamble !== `DSH-CHAT ${token}`) {
          log('client: rejected bad token')
          connection.destroy()
          return
        }
        authed = true
        log('client: authenticated')
      }
      let newline
      while ((newline = clientBuffer.indexOf('\n')) >= 0) {
        const line = clientBuffer.slice(0, newline)
        clientBuffer = clientBuffer.slice(newline + 1)
        if (line.trim()) void handleLine(line)
      }
    })
    connection.on('close', () => {
      if (socket === connection) {
        socket = null
        authed = false
        webRuns.clear()
        permissionBySession.clear()
        cancelAllQuestions()
        cancelAllApprovals()
      }
      log('client: disconnected')
    })
    connection.on('error', (error) => log('client: error', String(error?.message || error)))
  })

  server.on('error', (error) => log('server: error', String(error?.message || error)))

  try {
    server.listen(port, host, () => log(`bridge: listening on ${host}:${port}`))
  } catch (error) {
    log('server: listen failed', String(error))
  }

  ctx.provide('chatBridge', { host, port, tokenFile: TOKEN_FILE })

  ctx.effect(() => () => {
    webRuns.clear()
    permissionBySession.clear()
    cancelAllQuestions()
    cancelAllApprovals()
    try {
      server.close()
    } catch {}
    try {
      socket?.destroy()
    } catch {}
    for (const handle of handles.values()) {
      try {
        handle.dispose()
      } catch {}
    }
    handles.clear()
  }, 'chat-bridge')
}
