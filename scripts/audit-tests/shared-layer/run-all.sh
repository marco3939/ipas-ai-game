#!/usr/bin/env bash
# run-all.sh — 跑所有共用層稽核測試
# 用法: bash scripts/audit-tests/shared-layer/run-all.sh
set -u

cd "$(dirname "$0")/../../.."  # repo root

DIR="scripts/audit-tests/shared-layer"
TESTS=(
  "01-storage.test.js"
  "02-progress.test.js"
  "03-mastery.test.js"
  "04-wrongbook.test.js"
  "05-seencorrect.test.js"
  "06-player.test.js"
  "07-cross-module-integration.test.js"
)

PASS_ALL=0
FAIL_ALL=0
echo "=================================================="
echo "Agent A 共用層稽核 — run-all.sh"
echo "Repo: $(pwd)"
echo "Started: $(date)"
echo "=================================================="

for t in "${TESTS[@]}"; do
  echo ""
  echo "--- Running $t ---"
  # strip both ".test.js" → use base "<NN-name>.stdout.log"
  BASE="${t%.test.js}"
  LOG="$DIR/${BASE}.stdout.log"
  node "$DIR/$t" > "$LOG" 2>&1
  EXIT=$?
  # Summary line e.g. "=== Storage SUMMARY: 35/36 PASS ==="
  SUMMARY=$(grep -E "SUMMARY:" "$LOG" | tail -1)
  echo "$SUMMARY  [exit=$EXIT]  log: $LOG"
  if [ "$EXIT" -eq 0 ]; then
    PASS_ALL=$((PASS_ALL + 1))
  else
    FAIL_ALL=$((FAIL_ALL + 1))
    echo "  ⚠️ test failed — tail of log:"
    tail -10 "$LOG" | sed 's/^/    /'
  fi
done

echo ""
echo "=================================================="
echo "  Total: ${#TESTS[@]} test files"
echo "  Pass:  $PASS_ALL"
echo "  Fail:  $FAIL_ALL"
echo "=================================================="
[ "$FAIL_ALL" -eq 0 ]
