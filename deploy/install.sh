#!/bin/bash
# Install DSH Chat as a per-user launchd service (starts at login, restarts on crash).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.dshchat.server"
TARGET="$HOME/Library/LaunchAgents/$LABEL.plist"
mkdir -p "$HOME/Library/LaunchAgents"
sed "s|__ROOT__|$ROOT|g" "$ROOT/deploy/$LABEL.plist.template" > "$TARGET"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$TARGET"
launchctl kickstart -k "gui/$(id -u)/$LABEL"
echo "已安装并启动：$TARGET"
echo "查看状态：launchctl print gui/$(id -u)/$LABEL | head -20"
