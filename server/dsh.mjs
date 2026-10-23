import { spawn } from 'node:child_process'
import readline from 'node:readline'
import { config, DSH_BIN, DSH_HOME, GENERATED_PATCH } from './config.mjs'

const MAX_STDERR = 32 * 1024
const MAX_JSON_LINE = 4 * 1024 * 1024

export function permissionMode(permission) {
  return ['read-only', 'workspace-write', 'danger-full-access'].includes(permission)
    ? permission
    : 'workspace-write'
}

function stripAnsi(value) {
  return value.replace(/\u001b\[[0-9;]*m/g, '')
}

/**
 * Run one headless DSH task. The child speaks newline-delimited JSON on stdout;
 * every parsed event is forwarded to `onEvent`.
 */
export function startDshRun({
  prompt,
  sessionId = null,
  cwd,
  permission = 'workspace-write',
  modelPatch = null,
  timeoutMs = Math.max(1, Number(config.maxRunMinutes) || 30) * 60_000,
  onEvent = () => {},
}) {
  const args = [
    DSH_BIN,
    '--profile',
    'headless',
    '--patch',
    GENERATED_PATCH,
  ]
  // Per-run model override: the headless CLI installs the agent-default-model
  // selection at startup, so a second patch layer switches the model for this
  // run only — mirroring what the native bridge applies per session.
  if (modelPatch) args.push('--patch', modelPatch)
  args.push('--json')
  if (sessionId) args.push('--session-id', sessionId)
  args.push('-')

  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    DSH_HOME,
    NO_COLOR: '1',
    TERM: 'dumb',
    // Headless reads the same permission preset the UI shows. Without this
    // the child always inherited workspace-write, so a read-only
    // conversation could still write files.
    DSH_PERMISSION_MODE: permissionMode(permission),
  }
  // The child should not inherit a browser-injected Vite/Electron dev flag.
  delete env.ELECTRON_RUN_AS_NODE_WAS_SET

  const child = spawn(config.appBinary, args, {
    cwd,
    env,
    detached: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  let stderr = ''
  let sawSession = false
  let finalText = ''
  let killed = false
  let timedOut = false
  let spawnError = null
  let settled = false

  const startedAt = Date.now()

  child.on('error', (err) => {
    spawnError = err
    // ENOENT can emit 'error' without a following 'close'.
    setTimeout(() => finishOnce(-1, null), 800).unref?.()
  })

  const stderrRl = readline.createInterface({ input: child.stderr })
  stderrRl.on('line', (line) => {
    stderr += stripAnsi(line) + '\n'
    if (stderr.length > MAX_STDERR) stderr = stderr.slice(-MAX_STDERR)
  })

  const stdoutRl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity })
  stdoutRl.on('line', (line) => {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{')) {
      if (trimmed) stderr += `${trimmed}\n`
      return
    }
    if (trimmed.length > MAX_JSON_LINE) return
    let event
    try {
      event = JSON.parse(trimmed)
    } catch {
      return
    }
    if (event && typeof event === 'object') {
      if (event.type === 'session') sawSession = true
      if (event.type === 'final' && typeof event.text === 'string') finalText = event.text
      try {
        onEvent(event)
      } catch {
        /* a consumer error must not break the stream */
      }
    }
  })

  try {
    child.stdin.on('error', () => {})
    child.stdin.end(prompt)
  } catch {
    /* spawn failed; handled by the error event */
  }

  let killTimer = null
  const timer = setTimeout(() => {
    timedOut = true
    kill()
  }, timeoutMs)
  if (timer.unref) timer.unref()

  function kill() {
    if (settled || killed) return
    killed = true
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      try {
        child.kill('SIGTERM')
      } catch {}
    }
    killTimer = setTimeout(() => {
      try {
        process.kill(-child.pid, 'SIGKILL')
      } catch {
        try {
          child.kill('SIGKILL')
        } catch {}
      }
    }, 2500)
    if (killTimer.unref) killTimer.unref()
  }

  let finishOnce = () => {}

  const done = new Promise((resolve) => {
    const finish = (code, signal) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (killTimer) clearTimeout(killTimer)
      stdoutRl.close()
      stderrRl.close()
      resolve({
        code,
        signal,
        stderr: stderr.trim(),
        sawSession,
        finalText,
        killed,
        timedOut,
        spawnError,
        durationMs: Date.now() - startedAt,
      })
    }
    finishOnce = finish
    child.on('close', (code, signal) => finish(code, signal))
  })

  return {
    pid: child.pid,
    kill,
    done,
    get running() {
      return !settled
    },
  }
}
