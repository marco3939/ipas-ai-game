#!/usr/bin/env bash
# Agent D run-all: SM-2 / DrillSession / generateVariation / Review / ErrorReports / GameFX
# 跑全部 10 個測試,各自 redirect 到 <name>.stdout.log
set -uo pipefail

cd "$(dirname "$0")"

declare -a TESTS=(
  "01-sm2-algorithm"
  "02-sm2-due-queue"
  "03-sm2-render-xss"
  "04-drillsession-basic"
  "05-generateVariation"
  "06-review-render-with-bad-data"
  "07-review-xss-sandbox"
  "08-errorreports-add"
  "09-errorreports-export-filename"
  "10-gamefx-shake-damage-confetti"
)

PASS=0
FAIL=0
ERR=0
FAILED_TESTS=()

echo "=== Agent D test run ==="
date

for t in "${TESTS[@]}"; do
  printf "  %-50s " "$t"
  node "${t}.test.js" > "${t}.stdout.log" 2>&1
  rc=$?
  if [ $rc -eq 0 ]; then
    echo "OK"
    PASS=$((PASS+1))
  elif [ $rc -eq 1 ]; then
    # 預期的「測試失敗」exit code (A.summary 統計後 process.exit(1))
    echo "FAIL ($(grep -c '^  FAIL' ${t}.stdout.log) failures)"
    FAIL=$((FAIL+1))
    FAILED_TESTS+=("$t")
  else
    echo "ERROR rc=$rc"
    ERR=$((ERR+1))
    FAILED_TESTS+=("$t (rc=$rc)")
  fi
done

echo ""
echo "=== Summary ==="
echo "PASS:  $PASS / ${#TESTS[@]}"
echo "FAIL:  $FAIL"
echo "ERROR: $ERR"
if [ ${#FAILED_TESTS[@]} -gt 0 ]; then
  echo ""
  echo "Failed tests:"
  for f in "${FAILED_TESTS[@]}"; do
    echo "  - $f"
  done
fi

# exit non-zero if any error (but allow FAIL — by design tests assert real bugs)
if [ $ERR -gt 0 ]; then
  exit 2
fi
exit 0
