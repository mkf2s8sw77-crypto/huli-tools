#!/usr/bin/env bash
set -euo pipefail

readonly REPO_URL="https://github.com/THU-MAIC/OpenMAIC.git"
readonly COMPARE_BASE="https://github.com/THU-MAIC/OpenMAIC/compare"
readonly BASE_SHA="c56929510ceba5122572da7916ba3174177649ed"

current_sha="$(git ls-remote "$REPO_URL" refs/heads/main | awk 'NR == 1 { print $1 }')"
if [[ -z "$current_sha" ]]; then
  echo "无法读取 OpenMAIC main，请检查网络后重试。" >&2
  exit 1
fi

if [[ "$current_sha" == "$BASE_SHA" ]]; then
  echo "OpenMAIC 上游未变化：$BASE_SHA"
  exit 0
fi

echo "OpenMAIC 上游有更新：$BASE_SHA -> $current_sha"
echo "仅评估协议、Prompt、JSON 修复、模型适配、生成质量和安全修复："
echo "$COMPARE_BASE/$BASE_SHA...$current_sha"
