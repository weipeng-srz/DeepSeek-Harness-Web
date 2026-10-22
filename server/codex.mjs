import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const APP_CODEX = '/Applications/Codex.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex'

let cachedBinary = null
let cachedAt = 0

/**
 * Locate the Codex binary used by Codex Desktop / the Codex CLI.
 * The web never runs `codex exec`; it only launches `codex app-server`.
 */
export function resolveCodexBinary() {
  const now = Date.now()
  if (cachedBinary && now - cachedAt < 30_000) return cachedBinary
  cachedAt = now
  const candidates = [
    process.env.CODEX_BIN,
    APP_CODEX,
    path.join(
      os.homedir(),
      'Applications/Codex.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex',
    ),
    '/opt/homebrew/bin/codex',
    '/usr/local/bin/codex',
  ].filter(Boolean)
  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isFile()) {
        cachedBinary = candidate
        return candidate
      }
    } catch {}
  }
  try {
    const found = spawnSync('which', ['codex'], { encoding: 'utf8' })
    const binary = found.status === 0 ? found.stdout.trim() : ''
    if (binary) {
      cachedBinary = binary
      return binary
    }
  } catch {}
  cachedBinary = ''
  return ''
}

export function codexAvailable() {
  return Boolean(resolveCodexBinary())
}

/**
 * Read the desktop Codex defaults (model + reasoning effort) without pulling in
 * a TOML dependency. Only top-level scalar keys are needed here; section-local
 * keys such as `model_providers.*` are ignored.
 */
export function readCodexDefaults() {
  const home = process.env.CODEX_HOME || path.join(os.homedir(), '.codex')
  const file = path.join(home, 'config.toml')
  const defaults = { model: '', effort: '', provider: 'openai', home }
  let text = ''
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch {
    return defaults
  }
  let section = ''
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    if (line.startsWith('[')) {
      section = line.replace(/^\[+|\]+$/g, '').trim()
      continue
    }
    if (section) continue
    const match = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/)
    if (!match) continue
    const key = match[1]
    let value = match[2].trim()
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)
    else if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1)
    else continue
    if (key === 'model') defaults.model = value
    else if (key === 'model_reasoning_effort') defaults.effort = value
    else if (key === 'model_provider') defaults.provider = value
  }
  return defaults
}

const HTTP_PROVIDER_NAME = 'openai_https'
const HTTP_PROVIDER_SECTION = `[model_providers.${HTTP_PROVIDER_NAME}]
name = "OpenAI (HTTPS)"
base_url = "https://chatgpt.com/backend-api/codex"
wire_api = "responses"
requires_openai_auth = true
supports_websockets = false
stream_idle_timeout_ms = 180000
request_max_retries = 1
stream_max_retries = 1
`

/**
 * Codex Desktop needs the same provider definition to resume a thread created
 * by the web bridge. The section is additive and does not change the desktop's
 * default `model_provider`.
 */
export function ensureCodexHttpProvider() {
  const home = process.env.CODEX_HOME || path.join(os.homedir(), '.codex')
  const file = path.join(home, 'config.toml')
  let text = ''
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch (error) {
    return { ok: false, changed: false, error: error.message, file }
  }
  if (new RegExp(`^\\[model_providers\\.${HTTP_PROVIDER_NAME}\\]`, 'm').test(text)) {
    return { ok: true, changed: false, file }
  }
  try {
    const backup = `${file}.dsh-backup`
    if (!fs.existsSync(backup)) fs.copyFileSync(file, backup)
    const prefix = text && !text.endsWith('\n') ? '\n' : ''
    fs.appendFileSync(file, `${prefix}\n${HTTP_PROVIDER_SECTION}`)
    return { ok: true, changed: true, file }
  } catch (error) {
    return { ok: false, changed: false, error: error.message, file }
  }
}
