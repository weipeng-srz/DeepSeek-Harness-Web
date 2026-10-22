#!/bin/bash
# Install DSH Chat as a per-user launchd service (starts at login, restarts on crash).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# Fail before changing launchd when no supported runtime can start the app.
RUNTIME_NODE="$("$ROOT/start.sh" --check-runtime)"
LABEL="com.dshchat.server"
TARGET="$HOME/Library/LaunchAgents/$LABEL.plist"
mkdir -p "$HOME/Library/LaunchAgents"
"$RUNTIME_NODE" --input-type=module - "$ROOT/deploy/$LABEL.plist.template" "$TARGET" "$ROOT" "$RUNTIME_NODE" <<'JS'
import fs from 'node:fs'
const [template, target, root, runtime] = process.argv.slice(2)
const escape = value => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char])
const plist = fs.readFileSync(template, 'utf8')
  .replaceAll('__ROOT__', escape(root))
  .replace('<key>PATH</key>', `<key>NODE_BIN</key>\n    <string>${escape(runtime)}</string>\n    <key>PATH</key>`)
fs.writeFileSync(target, plist, { mode: 0o600 })
JS
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$TARGET"
launchctl kickstart -k "gui/$(id -u)/$LABEL"
echo "已安装并启动：$TARGET"
echo "查看状态：launchctl print gui/$(id -u)/$LABEL | head -20"
