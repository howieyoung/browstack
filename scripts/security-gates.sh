#!/usr/bin/env bash
# 安全不變式 grep 閘——任一命中即失敗。與 SECURITY.md 的「Security invariants」對應。
# 開源專案的關鍵防迴歸:這些「看似無害」的改動,任一都可能危及每個安裝。
# 本地執行:npm run security-gates
set -uo pipefail
cd "$(dirname "$0")/.."

fail=0

# 命中 pattern 即失敗（用於「不該出現」的東西）。
# 忽略純註解行（//、*、#）——說明文字可以提到這些字面,只有實際程式碼才算違規。
deny() {
  local desc="$1"; shift
  local pattern="$1"; shift
  local hits
  hits="$(grep -rniE "$pattern" "$@" 2>/dev/null | grep -vE ':[0-9]+:[[:space:]]*(//|\*|#)' || true)"
  if [ -n "$hits" ]; then
    echo "✗ GATE FAILED: $desc"
    echo "$hits" | sed 's/^/    /'
    fail=1
  else
    echo "✓ $desc"
  fi
}

# 綁定位址永遠本機迴環,絕不 0.0.0.0
deny "server binds 127.0.0.1 only (no 0.0.0.0)" '0\.0\.0\.0' src/
# CSP:default-src 'none' 已封殺腳本,不得再出現 script-src / unsafe-eval
deny "CSP has no script-src directive" 'script-src' src/
deny "CSP has no unsafe-eval" 'unsafe-eval' src/
# jsdom 必須維持惰性預設（解析敵意 HTML;啟用腳本/資源=RCE/SSRF）
deny "jsdom stays inert (no runScripts / resources:usable)" "runScripts|resources:[[:space:]]*[\"']usable" src/
# server.ts 的 Host 反 rebinding 檢查必須精確比對,不得用寬鬆字串比對
deny "server.ts Host check is exact (no includes/startsWith/endsWith)" '\.(includes|startsWith|endsWith)\(' src/server.ts

# PR2 起 archiveToken.ts 若存在:token 比對必須用 timingSafeEqual、且無字面 default
if [ -f src/archiveToken.ts ]; then
  if ! grep -q "timingSafeEqual" src/archiveToken.ts; then
    echo "✗ GATE FAILED: archiveToken.ts must compare with crypto.timingSafeEqual"
    fail=1
  else
    echo "✓ archiveToken.ts uses timingSafeEqual"
  fi
  deny "archive token has no hardcoded/default fallback" 'archive[_-]?token[^\n]*(\|\||\?\?)[[:space:]]*[\"'\''`]' src/
fi

# 個人資料檔絕不進版控
tracked="$(git ls-files -- data/ out/ assets/covers/ src/shared/userConfig.ts 2>/dev/null || true)"
if [ -n "$tracked" ]; then
  echo "✗ GATE FAILED: personal files are tracked:"
  echo "$tracked" | sed 's/^/    /'
  fail=1
else
  echo "✓ no personal data files tracked"
fi

# .gitignore 仍涵蓋所有敏感路徑
for p in data/ out/ assets/covers/ src/shared/userConfig.ts .env; do
  if git check-ignore -q "$p"; then
    echo "✓ ignored: $p"
  else
    echo "✗ GATE FAILED: not ignored by .gitignore: $p"
    fail=1
  fi
done

if [ "$fail" -ne 0 ]; then
  echo ""
  echo "Security gates failed. See SECURITY.md for the invariants these protect."
  exit 1
fi
echo ""
echo "All security gates passed."
