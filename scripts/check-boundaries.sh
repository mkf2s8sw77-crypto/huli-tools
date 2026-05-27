#!/bin/bash
set -euo pipefail

# ──────────────────────────────────────────────────────────────
# check-boundaries.sh — 启发式边界检查
#
# 检查内容：
#   1. 客户端(miniprogram/)是否直接引用公共敏感集合
#   2. 客户端是否直接调用内部 action
#   3. 应用云函数(app_*)是否越权引用公共核心集合
#   4. 新增私有集合名是否不符合 app_<appKey>_ 前缀
#
# 依赖：rg (ripgrep)，无则 fallback 到 grep
# 限制：启发式文本匹配，非完整静态分析。
#   - 注释和字符串中的匹配可能产生误报
#   - 动态拼接的集合名无法检测
# ──────────────────────────────────────────────────────────────

ERRORS=0

# 选择搜索工具
if command -v rg &>/dev/null; then
  SEARCH="rg"
else
  echo "⚠️  未找到 rg (ripgrep)，将使用 grep（速度较慢）"
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
echo "  huli-tools 边界检查"
echo "═══════════════════════════════════════════════════════"
echo ""

# ── 检查 1：客户端是否直接引用公共集合 ────────────────────
echo "▶ 检查 1: 客户端(miniprogram/)是否直接引用公共敏感集合"

SENSITIVE_COLLECTIONS="users|point_accounts|point_transactions|apps|app_usage_records|recharge_packages|payment_orders|admin_audit_logs|system_configs"

if [ -d "miniprogram" ]; then
  HITS=$(do_search "\.collection\(['\"]($SENSITIVE_COLLECTIONS)['\"]\)" "miniprogram/" | grep -v "node_modules" || true)
  if [ -n "$HITS" ]; then
    echo "  ❌ 发现客户端直接引用公共集合:"
    echo "$HITS" | while IFS= read -r line; do echo "     $line"; done
    ERRORS=$((ERRORS + 1))
  else
    echo "  ✅ 未发现"
  fi
else
  echo "  ⏭️  miniprogram/ 目录不存在，跳过"
fi
echo ""

# ── 检查 2：客户端是否直接调用内部 action ─────────────────
echo "▶ 检查 2: 客户端(miniprogram/)是否直接调用内部 action"

INTERNAL_ACTIONS="freezePoints|settleFrozenPoints|releaseFrozenPoints|creditPoints|adminAdjustPoints|finishUsage|failUsage"

if [ -d "miniprogram" ]; then
  HITS=$(do_search "($INTERNAL_ACTIONS)" "miniprogram/" | grep -v "node_modules" || true)
  if [ -n "$HITS" ]; then
    echo "  ❌ 发现客户端调用内部 action:"
    echo "$HITS" | while IFS= read -r line; do echo "     $line"; done
    ERRORS=$((ERRORS + 1))
  else
    echo "  ✅ 未发现"
  fi
else
  echo "  ⏭️  miniprogram/ 目录不存在，跳过"
fi
echo ""

# ── 检查 3：应用云函数越权引用公共核心集合 ────────────────
echo "▶ 检查 3: 应用云函数(app_*)是否越权引用公共核心集合"

# app_* 应用云函数仅允许只读 app_usage_records 来校验当前 usageId。
# 其他公共集合必须通过 core* 公共云函数访问。
APP_FORBIDDEN_PUBLIC_COLLECTIONS="users|point_accounts|point_transactions|apps|recharge_packages|payment_orders|admin_audit_logs|system_configs"

# allowlist: 公共云函数(coreApp, corePoints, corePayment, coreUser, adminCore)
# 和 demo 函数(demoSum) 属于公共底座体系，允许操作公共集合。
# 只检查 app_* 目录下的云函数。

if [ -d "cloudfunctions" ]; then
  APP_DIRS=$(find cloudfunctions -maxdepth 1 -type d -name "app_*" 2>/dev/null || true)
  if [ -n "$APP_DIRS" ]; then
    local_errors=0
    for appdir in $APP_DIRS; do
      HITS=$(do_search "\.collection\(['\"]($APP_FORBIDDEN_PUBLIC_COLLECTIONS)['\"]\)" "$appdir/" | grep -v "node_modules" || true)
      if [ -n "$HITS" ]; then
        echo "  ❌ $appdir 越权引用公共核心集合:"
        echo "$HITS" | while IFS= read -r line; do echo "     $line"; done
        ERRORS=$((ERRORS + 1))
        local_errors=$((local_errors + 1))
      fi
    done
    if [ "$local_errors" -eq 0 ]; then
      echo "  ✅ 未发现"
    fi
  else
    echo "  ✅ 暂无 app_* 应用云函数"
  fi
else
  echo "  ⏭️  cloudfunctions/ 目录不存在，跳过"
fi
echo ""

# ── 检查 4：应用云函数中的私有集合命名 ──────────────────
echo "▶ 检查 4: 应用云函数的私有集合名是否符合 app_<appKey>_ 前缀"

if [ -d "cloudfunctions" ]; then
  APP_DIRS=$(find cloudfunctions -maxdepth 1 -type d -name "app_*" 2>/dev/null || true)
  if [ -n "$APP_DIRS" ]; then
    for appdir in $APP_DIRS; do
      # 提取 appKey: cloudfunctions/app_my_app → my_app
      dirname=$(basename "$appdir")
      appkey="${dirname#app_}"

      # 查找所有 .collection("xxx") 调用
      ALL_COLLECTIONS=$(do_search "\.collection\(['\"]([^'\"]+)['\"]\)" "$appdir/" | grep -v "node_modules" || true)
      if [ -n "$ALL_COLLECTIONS" ]; then
        # 过滤：允许公共集合（只读引用 app_usage_records 是合法的）和 app_<appKey>_ 前缀集合
        BAD_NAMES=$(echo "$ALL_COLLECTIONS" | grep -Ev "\.collection\(['\"](app_${appkey}_[^'\"]*|app_usage_records)['\"]\)" || true)
        if [ -n "$BAD_NAMES" ]; then
          echo "  ❌ $appdir 中有不符合 app_${appkey}_ 前缀的集合引用:"
          echo "$BAD_NAMES" | while IFS= read -r line; do echo "     $line"; done
          echo "     （app_* 仅允许读取 app_usage_records，其余私有集合必须使用 app_${appkey}_ 前缀）"
          ERRORS=$((ERRORS + 1))
        fi
      fi
    done
    echo "  ✅ 检查完成"
  else
    echo "  ✅ 暂无 app_* 应用云函数"
  fi
else
  echo "  ⏭️  cloudfunctions/ 目录不存在，跳过"
fi
echo ""

# ── 检查 5：客户端是否存在 wx.cloud.database() 直接写操作 ──
echo "▶ 检查 5: 客户端(miniprogram/)是否存在数据库直接写操作"

if [ -d "miniprogram" ]; then
  # 匹配 .add( / .update( / .set( / .remove( 但排除 callCloud/callFunction 上下文
  HITS=$(do_search "\.(add|update|set|remove)\s*\(" "miniprogram/" | grep -v "node_modules" | grep -v "callFunction" | grep -v "callCloud" | grep -v "setData" | grep -v "\.wxss" | grep -v "\.wxml" | grep -v "\.json" || true)
  # 进一步排除已知安全操作（如 wx.setStorageSync, setData, wx.navigateTo 等）
  HITS=$(echo "$HITS" | grep -v "setStorage" | grep -v "setNavigationBarTitle" | grep -v "setClipboardData" | grep -v "setTabBarBadge" || true)
  if [ -n "$HITS" ]; then
    echo "  ❌ 可能的客户端数据库写操作:"
    echo "$HITS" | head -20 | while IFS= read -r line; do echo "     $line"; done
    echo "     （客户端写操作必须改为云函数；如为误报，请调整脚本 allowlist 并说明原因）"
    ERRORS=$((ERRORS + 1))
  else
    echo "  ✅ 未发现可疑写操作"
  fi
else
  echo "  ⏭️  miniprogram/ 目录不存在，跳过"
fi
echo ""

# ── 汇总 ──────────────────────────────────────────────────
echo "═══════════════════════════════════════════════════════"
if [ "$ERRORS" -gt 0 ]; then
  echo "  ❌ 发现 $ERRORS 个边界违规，请修复后再提交"
  exit 1
else
  echo "  ✅ 边界检查全部通过"
  exit 0
fi
