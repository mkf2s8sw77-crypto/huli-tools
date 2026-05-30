#!/bin/bash
set -euo pipefail

# ──────────────────────────────────────────────────────────────
# check-admin-web-boundaries.sh — admin-web 前端边界检查
#
# 检查内容：
#   1. admin-web/src 中不得出现业务集合直连
#   2. admin-web/src 中不得出现敏感密钥/凭据标识
#   3. admin-web/src 中不得直接调用 corePoints 内部 action
#
# 本脚本不依赖 node_modules，仅扫描源码文本。
# ──────────────────────────────────────────────────────────────

ERRORS=0
ADMIN_WEB_SRC="admin-web/src"

if [ ! -d "$ADMIN_WEB_SRC" ]; then
  echo "⏭️  $ADMIN_WEB_SRC 目录不存在，跳过检查"
  exit 0
fi

# 选择搜索工具
if command -v rg &>/dev/null; then
  SEARCH="rg"
else
  echo "⚠️  未找到 rg (ripgrep)，将使用 grep"
  SEARCH="grep"
fi

do_search() {
  local pattern="$1"
  local path="$2"
  if [ "$SEARCH" = "rg" ]; then
    rg --no-heading --line-number "$pattern" "$path" 2>/dev/null || true
  else
    grep -rn "$pattern" "$path" 2>/dev/null || true
  fi
}

echo "═══════════════════════════════════════════════════════"
echo "  admin-web 边界检查"
echo "═══════════════════════════════════════════════════════"
echo ""

# ── 检查 1：业务集合直连 ─────────────────────────────────
echo "▶ 检查 1: admin-web/src 中是否直连业务集合"

SENSITIVE_COLLECTIONS='collection\(\s*["\x27](users|point_accounts|point_transactions|apps|app_usage_records|recharge_packages|payment_orders|admin_audit_logs|system_configs|app_ai_draw_tasks)["\x27]\s*\)'

HITS=$(do_search "$SENSITIVE_COLLECTIONS" "$ADMIN_WEB_SRC" || true)
if [ -n "$HITS" ]; then
  echo "  ❌ 发现直连业务集合:"
  echo "$HITS" | while IFS= read -r line; do echo "     $line"; done
  ERRORS=$((ERRORS + 1))
else
  echo "  ✅ 未发现"
fi
echo ""

# ── 检查 2：敏感标识 ─────────────────────────────────────
echo "▶ 检查 2: admin-web/src 中是否包含敏感密钥标识"

SENSITIVE_PATTERNS="INTERNAL_API_SECRET|WX_PAY_PRIVATE_KEY|WX_PAY_API_V3_KEY|WX_PAY_SERIAL_NO|private\.wx"

HITS=$(do_search "$SENSITIVE_PATTERNS" "$ADMIN_WEB_SRC" || true)
if [ -n "$HITS" ]; then
  echo "  ❌ 发现敏感标识:"
  echo "$HITS" | while IFS= read -r line; do echo "     $line"; done
  ERRORS=$((ERRORS + 1))
else
  echo "  ✅ 未发现"
fi
echo ""

# ── 检查 3：内部 action 直调 ──────────────────────────────
echo "▶ 检查 3: admin-web/src 中是否直接调用 corePoints/coreApp 内部 action"

INTERNAL_ACTIONS="freezePoints|settleFrozenPoints|releaseFrozenPoints|creditPoints|adminAdjustPoints|finishUsage|failUsage"

HITS=$(do_search "$INTERNAL_ACTIONS" "$ADMIN_WEB_SRC" || true)
if [ -n "$HITS" ]; then
  echo "  ❌ 发现调用内部 action:"
  echo "$HITS" | while IFS= read -r line; do echo "     $line"; done
  ERRORS=$((ERRORS + 1))
else
  echo "  ✅ 未发现"
fi
echo ""

# ── 检查 4：database() 直接调用 ───────────────────────────
echo "▶ 检查 4: admin-web/src 中是否存在 database() 直接调用"

HITS=$(do_search "\.database\(\)" "$ADMIN_WEB_SRC" || true)
if [ -n "$HITS" ]; then
  echo "  ❌ 发现 database() 直接调用:"
  echo "$HITS" | while IFS= read -r line; do echo "     $line"; done
  ERRORS=$((ERRORS + 1))
else
  echo "  ✅ 未发现"
fi
echo ""

# ── 汇总 ──────────────────────────────────────────────────
echo "═══════════════════════════════════════════════════════"
if [ "$ERRORS" -gt 0 ]; then
  echo "  ❌ 发现 $ERRORS 个边界违规，请修复后再提交"
  exit 1
else
  echo "  ✅ admin-web 边界检查全部通过"
  exit 0
fi
