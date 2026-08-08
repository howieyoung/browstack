#!/usr/bin/env bash
# Security-invariant grep gates — any hit fails. Mirrors the "Security invariants" in SECURITY.md.
# Key regression guard for an open-source project: any of these "harmless-looking" changes could endanger every install.
# Run locally: npm run security-gates
set -uo pipefail
cd "$(dirname "$0")/.."

fail=0

# Fail on a pattern hit (for things that "should not appear").
# Ignore pure comment lines (//, *, #) — prose may mention these literals; only actual code counts as a violation.
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

# The bind address is always the local loopback, never 0.0.0.0
deny "server binds 127.0.0.1 only (no 0.0.0.0)" '0\.0\.0\.0' src/
# CSP: default-src 'none' already blocks scripts; no script-src / unsafe-eval should appear
deny "CSP has no script-src directive" 'script-src' src/
deny "CSP has no unsafe-eval" 'unsafe-eval' src/
# jsdom must stay inert by default (it parses hostile HTML; enabling scripts/resources = RCE/SSRF)
deny "jsdom stays inert (no runScripts / resources:usable)" "runScripts|resources:[[:space:]]*[\"']usable" src/
# server.ts's Host anti-rebinding check must be an exact match, not a loose string comparison
deny "server.ts Host check is exact (no includes/startsWith/endsWith)" '\.(includes|startsWith|endsWith)\(' src/server.ts

# From PR2 on, if archiveToken.ts exists: the token comparison must use timingSafeEqual, with no literal default
if [ -f src/archiveToken.ts ]; then
  if ! grep -q "timingSafeEqual" src/archiveToken.ts; then
    echo "✗ GATE FAILED: archiveToken.ts must compare with crypto.timingSafeEqual"
    fail=1
  else
    echo "✓ archiveToken.ts uses timingSafeEqual"
  fi
  deny "archive token has no hardcoded/default fallback" 'archive[_-]?token[^\n]*(\|\||\?\?)[[:space:]]*[\"'\''`]' src/
fi

# The /capture per-install secret must be constant-time compared, CSPRNG-only, and fail-closed.
if [ -f src/captureSecret.ts ]; then
  if ! grep -q "timingSafeEqual" src/captureSecret.ts; then
    echo "✗ GATE FAILED: captureSecret.ts must compare with crypto.timingSafeEqual"
    fail=1
  else
    echo "✓ captureSecret.ts uses timingSafeEqual"
  fi
fi

# Personal data files must never be committed to version control
tracked="$(git ls-files -- data/ out/ assets/covers/ src/shared/userConfig.ts 2>/dev/null || true)"
if [ -n "$tracked" ]; then
  echo "✗ GATE FAILED: personal files are tracked:"
  echo "$tracked" | sed 's/^/    /'
  fail=1
else
  echo "✓ no personal data files tracked"
fi

# .gitignore still covers all sensitive paths
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
