#!/bin/bash
# Remove the native bridge from the DeepSeek Harness Desktop profile.
# The web service keeps working in headless fallback after the Desktop restart.
set -euo pipefail
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
PROFILE="$DSH_HOME/profiles/desktop"
PATCH="$PROFILE/cordis.patch.yml"
DEST="$PROFILE/node_modules/dsh-chat-bridge"

if [ -f "$PATCH" ]; then
  cp "$PATCH" "$PATCH.bak-uninstall-$(date +%Y%m%d-%H%M%S)"
  python3 - "$PATCH" <<'PY'
import sys

path = sys.argv[1]
with open(path, 'r', encoding='utf-8') as fh:
    lines = fh.read().split('\n')

out = []
skip = 0
for line in lines:
    if line.strip() == '# DSH Chat native bridge (managed by dsh-chat)':
        continue
    if line.strip() == '- id: chat-bridge':
        # Drop the row and its name line, keeping unrelated rows intact.
        skip = 2
        continue
    if skip:
        skip -= 1
        if line.strip().startswith('name:'):
            continue
        out.append(line)
        continue
    out.append(line)

with open(path, 'w', encoding='utf-8') as fh:
    fh.write('\n'.join(out))
PY
fi

rm -rf "$DEST"
echo "已移除原生桥接。请完全退出并重新打开 DeepSeek Harness 桌面版。"
echo "网页端将回退到 headless 模式（历史对话仍保留在网页里）。"
