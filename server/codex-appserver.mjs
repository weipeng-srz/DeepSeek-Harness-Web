/**
 * Compatibility shim. The Codex integration now lives in codex-bridge.mjs,
 * which keeps one warm app-server process for all conversations.
 */
import { codexBridge } from './codex-bridge.mjs'

export function startCodexDesktopRun(options) {
  return codexBridge.startRun(options)
}
