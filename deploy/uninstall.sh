#!/bin/bash
set -euo pipefail
LABEL="com.dshchat.server"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/$LABEL.plist"
echo "已停止并移除 DSH Chat 服务"
