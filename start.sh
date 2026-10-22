#!/bin/bash
# Start DSH Chat with a supported local Node.js runtime (22 or newer).
set -euo pipefail
cd "$(dirname "$0")"
umask 077

supports_runtime() {
  [ -x "$1" ] && "$1" -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' >/dev/null 2>&1
}

# An explicit override is authoritative; never silently use a different binary.
if [ -n "${NODE_BIN:-}" ]; then
  if ! supports_runtime "$NODE_BIN"; then
    echo "NODE_BIN 指定的运行时不可用或版本过低，请指定 Node.js 22 或更新版本。" >&2
    exit 1
  fi
else
  NODE_BIN=""
  path_node="$(command -v node || true)"
  for candidate in "$path_node" /opt/homebrew/bin/node /usr/local/bin/node \
    "${NVM_DIR:-$HOME/.nvm}"/versions/node/*/bin/node \
    "$HOME"/.dsh/dsh-runtimes/*/dependencies/node/bin/node; do
    if [ -n "$candidate" ] && supports_runtime "$candidate"; then
      NODE_BIN="$candidate"
      break
    fi
  done
  if [ -z "$NODE_BIN" ]; then
    echo "未找到 Node.js 22 或更新版本。请安装受支持版本，或用 NODE_BIN=/完整路径/node ./start.sh 指定；无需修改全局 Node 配置。" >&2
    exit 1
  fi
fi

if [ "${1:-}" = "--check-runtime" ]; then
  printf '%s\n' "$NODE_BIN"
  exit 0
fi

mkdir -p data
touch data/server.log 2>/dev/null || true
chmod 600 data/server.log 2>/dev/null || true
exec "$NODE_BIN" server/index.mjs
