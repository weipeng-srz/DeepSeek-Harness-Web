#!/bin/bash
# Install the native bridge into the DeepSeek Harness Desktop profile.
# It takes effect after the Desktop app is restarted; no web service restart is
# required. Safe to run repeatedly.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
PROFILE="$DSH_HOME/profiles/desktop"
PATCH="$PROFILE/cordis.patch.yml"
DEST="$PROFILE/node_modules/dsh-chat-bridge"

if [ ! -f "$PATCH" ]; then
  echo "找不到桌面版 profile：$PATCH" >&2
  exit 1
fi

mkdir -p "$DEST"
cp "$ROOT/bridge/index.js" "$ROOT/bridge/package.json" "$DEST/"

if ! grep -q 'chat-bridge' "$PATCH"; then
  cp "$PATCH" "$PATCH.bak-$(date +%Y%m%d-%H%M%S)"
  python3 - "$PATCH" <<'PY'
import sys

path = sys.argv[1]
with open(path, 'r', encoding='utf-8') as fh:
    text = fh.read()
if 'chat-bridge' in text:
    raise SystemExit(0)

lines = text.rstrip('\n').split('\n')
last = -1
for index, line in enumerate(lines):
    if line.startswith('- '):
        last = index

marker = '# DSH Chat native bridge (managed by dsh-chat)'
row = ['    - id: chat-bridge', '      name: "dsh-chat-bridge"']

if last >= 0 and lines[last].strip() == '- insert:':
    for offset, value in enumerate([marker, *row], start=1):
        lines.insert(last + offset, value)
else:
    lines += ['', marker, '- insert:', *row]

with open(path, 'w', encoding='utf-8') as fh:
    fh.write('\n'.join(lines) + '\n')
PY
fi

# Touch the patch file so the running Desktop host reloads the profile and
# picks up the new bridge code even when the bridge row already exists.
printf '\n# reload %s (dsh-chat bridge updated)\n' "$(date +%s)" >> "$PATCH"

echo "已安装原生桥接：$DEST"
echo "已更新 profile：$PATCH"
echo
echo "通常桌面版会热加载该 profile，立即生效；若没有生效，再完全退出并重新打开桌面版。"
echo "生效后网页端会自动切换为原生模式；关闭桌面版时新对话会回退到 headless。"
