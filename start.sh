#!/bin/bash
# Start DSH Chat. Uses the Node.js bundled with the DeepSeek Harness desktop app
# when no system `node` is installed.
set -euo pipefail
cd "$(dirname "$0")"
umask 077
mkdir -p data
touch data/server.log 2>/dev/null || true
chmod 600 data/server.log 2>/dev/null || true

NODE_BIN="$(command -v node || true)"
if [ -z "${NODE_BIN}" ]; then
  for candidate in "$HOME"/.dsh/dsh-runtimes/*/dependencies/node/bin/node; do
    if [ -x "$candidate" ]; then
      NODE_BIN="$candidate"
      break
    fi
  done
fi

if [ -z "${NODE_BIN}" ]; then
  echo "未找到 Node.js（系统 PATH 和 DeepSeek Harness 内置运行时都没有）" >&2
  exit 1
fi

exec "$NODE_BIN" server/index.mjs
