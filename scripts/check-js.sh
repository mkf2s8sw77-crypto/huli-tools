#!/bin/bash
set -euo pipefail

# 递归检查 miniprogram/**/*.js 和 cloudfunctions/**/*.js 的语法
# 排除 node_modules

ERRORS=0

for dir in miniprogram cloudfunctions; do
  if [ ! -d "$dir" ]; then
    echo "跳过: 目录 $dir 不存在"
    continue
  fi

  while IFS= read -r -d '' file; do
    if node --check "$file" 2>/dev/null; then
      echo "OK   $file"
    else
      echo "FAIL $file"
      ERRORS=$((ERRORS + 1))
    fi
  done < <(find "$dir" -type f -name "*.js" -not -path "*/node_modules/*" -print0)
done

if [ "$ERRORS" -gt 0 ]; then
  echo ""
  echo "发现 $ERRORS 个语法错误"
  exit 1
else
  echo ""
  echo "所有 JS 文件语法检查通过"
  exit 0
fi
