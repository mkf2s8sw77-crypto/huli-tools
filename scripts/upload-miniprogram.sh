#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="${1:-}"
DESCRIPTION="${2:-huli-tools 小程序发布}"
CI_DIR="${TMPDIR:-/tmp}/huli-tools-miniprogram-ci"

if [[ -z "$VERSION" ]]; then
  echo "用法：bash scripts/upload-miniprogram.sh <版本号> [版本说明]" >&2
  exit 1
fi

if [[ -n "${NODE20_BIN:-}" ]]; then
  NODE_BIN="$NODE20_BIN"
elif [[ -x "/opt/homebrew/opt/node@20/bin/node" ]]; then
  NODE_BIN="/opt/homebrew/opt/node@20/bin/node"
elif [[ -x "/usr/local/opt/node@20/bin/node" ]]; then
  NODE_BIN="/usr/local/opt/node@20/bin/node"
else
  NODE_BIN="$(command -v node)"
fi

NODE_MAJOR="$($NODE_BIN -p 'process.versions.node.split(".")[0]')"
if (( NODE_MAJOR > 22 )); then
  echo "miniprogram-ci 与 Node.js $NODE_MAJOR 不兼容，请通过 NODE20_BIN 指定 Node.js 20。" >&2
  exit 1
fi

if [[ ! -d "$CI_DIR/node_modules/miniprogram-ci" ]]; then
  npm install --prefix "$CI_DIR" miniprogram-ci@latest --no-audit --no-fund
fi

MINIPROGRAM_CI_MODULE_DIR="$CI_DIR/node_modules/miniprogram-ci" \
  "$NODE_BIN" "$ROOT_DIR/scripts/upload-miniprogram.js" "$VERSION" "$DESCRIPTION"
