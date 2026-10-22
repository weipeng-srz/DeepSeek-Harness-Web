import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.resolve(here, '..')
export const PUBLIC_DIR = path.join(ROOT, 'public')
export const DATA_DIR = path.join(ROOT, 'data')
export const WORKSPACE_ROOT = path.join(DATA_DIR, 'workspaces')
export const SHARED_WORKSPACE = path.join(DATA_DIR, 'workspace')
export const CONFIG_PATH = path.join(ROOT, 'config.json')
const SECRET_PATH = path.join(DATA_DIR, '.secret')

fs.mkdirSync(WORKSPACE_ROOT, { recursive: true })
fs.mkdirSync(SHARED_WORKSPACE, { recursive: true })

/** Readable access code without ambiguous characters. */
function makeAccessCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const pick = () => alphabet[crypto.randomInt(alphabet.length)]
  return `${pick()}${pick()}${pick()}${pick()}-${pick()}${pick()}${pick()}${pick()}`
}

function defaultConfig() {
  return {
    host: '0.0.0.0',
    port: 8787,
    accessCode: makeAccessCode(),
    title: 'DSH Chat',
    singleUser: true,
    maxRunMinutes: 30,
    nativeEnabled: true,
    nativePort: 47821,
    nativeWorkspaceTitle: 'DSH Chat',
    codexPrewarm: false,
    dshHome: '~/.dsh',
    desktopProfile: 'desktop',
    appBinary: '/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness',
    // Optional public origin used in copy/share links, e.g. https://chat.example.com.
    // Empty means: use the request host, or the first LAN address for localhost.
    publicBaseUrl: '',
    // Optional TLS. Set both to an absolute cert/key path to serve HTTPS.
    tlsCert: '',
    tlsKey: '',
    // Outbound notifications. iMessage is the only channel for now and is
    // driven through osascript, so it only works on macOS with Messages
    // signed in. Empty channels keep the feature off.
    notify: {
      enabled: false,
      channels: [],
      quietHours: [],
      mergeWindowSec: 60,
      minIntervalSec: 5,
      maxPerHour: 20,
      baseUrl: '',
    },
  }
}

function readConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    const cfg = defaultConfig()
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + '\n', { mode: 0o600 })
    return cfg
  }
  let parsed = {}
  try {
    parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
  } catch (err) {
    throw new Error(`config.json 不是合法 JSON: ${err.message}`)
  }
  const base = defaultConfig()
  const merged = { ...base, ...parsed }
  if (!merged.accessCode || String(merged.accessCode).trim().length < 8) {
    merged.accessCode = makeAccessCode()
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2) + '\n', { mode: 0o600 })
  }
  return merged
}

export const config = readConfig()

/** Persist the merged config after a runtime settings change. */
export function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 })
    return true
  } catch (err) {
    console.error(`[config] 写入失败：${err.message}`)
    return false
  }
}

export const DSH_HOME = path.resolve(
  config.dshHome.replace(/^~(?=$|\/)/, os.homedir()),
)
export const DESKTOP_PATCH = path.join(DSH_HOME, 'profiles', config.desktopProfile, 'cordis.patch.yml')
export const DSH_BIN = path.join(
  '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/dsh/lib/bin.js',
)
export const GENERATED_PATCH = path.join(DATA_DIR, 'headless-mork.patch.yml')

if (!fs.existsSync(SECRET_PATH)) {
  fs.writeFileSync(SECRET_PATH, crypto.randomBytes(32).toString('hex'), { mode: 0o600 })
}
export const SECRET = fs.readFileSync(SECRET_PATH, 'utf8').trim()

function readModelSelection() {
  try {
    const src = fs.readFileSync(DESKTOP_PATCH, 'utf8')
    const block = src.match(/- id: agent-default-model[\s\S]*?(?=\n- id:|\n- insert:|$)/)
    if (block) {
      const provider = block[0].match(/provider:\s*([^\s#]+)/)
      const model = block[0].match(/model:\s*([^\s#]+)/)
      return {
        provider: provider ? provider[1].trim() : 'deepseek-official',
        model: model ? model[1].trim() : 'deepseek-flash',
      }
    }
  } catch {}
  return { provider: 'deepseek-official', model: 'deepseek-flash' }
}

const selection = readModelSelection()
export const PROVIDER = selection.provider
export const MODEL = selection.model

export const NATIVE_ENABLED = config.nativeEnabled !== false
export const NATIVE_PORT = Number(process.env.DSH_CHAT_BRIDGE_PORT) || Number(config.nativePort) || 47821
export const NATIVE_TOKEN_FILE =
  process.env.DSH_CHAT_BRIDGE_TOKEN_FILE || path.join(DSH_HOME, 'chat-bridge.token')
export const NATIVE_WORKSPACE_TITLE = config.nativeWorkspaceTitle || 'DSH Chat'

export const ACCESS_CODE = String(config.accessCode).trim()
export const AUTH_ENABLED = ACCESS_CODE.length > 0
