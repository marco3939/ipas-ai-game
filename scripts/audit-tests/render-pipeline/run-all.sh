#!/usr/bin/env bash
# run-all.sh — Audit-tests render-pipeline runner.  Runs each test, captures
# stdout to a .stdout.log, and aggregates pass/fail counts at the end.
#
# Usage: bash scripts/audit-tests/render-pipeline/run-all.sh
#        (run from repo root)

set -u
cd "$(dirname "$0")"

OVERALL_PASS=0
OVERALL_FAIL=0
FAILED_FILES=()

for f in 01-rng-determinism.test.js \
         02-applyVariables.test.js \
         03-pickCase.test.js \
         04-renderQuestion.test.js \
         05-playengine-show.test.js \
         06-playengine-answer.test.js \
         07-xss-sandbox.test.js; do
  # Use canonical name: 01-rng-determinism.test.js -> 01-rng-determinism.stdout.log
  log="${f%.test.js}.stdout.log"
  node "$f" > "$log" 2>&1
  rc=$?
  pass=$(grep -c '^PASS' "$log" || true)
  fail=$(grep -c '^FAIL' "$log" || true)
  OVERALL_PASS=$((OVERALL_PASS + pass))
  OVERALL_FAIL=$((OVERALL_FAIL + fail))
  if [ "$rc" -ne 0 ] || [ "$fail" -gt 0 ]; then
    FAILED_FILES+=("$f (exit=$rc, fail=$fail)")
    echo "FAIL  $f  pass=$pass fail=$fail exit=$rc"
  else
    echo "OK    $f  pass=$pass"
  fi
done

echo ""
echo "=== AGGREGATE ==="
echo "PASS: $OVERALL_PASS"
echo "FAIL: $OVERALL_FAIL"
if [ "${#FAILED_FILES[@]}" -gt 0 ]; then
  echo "FAILED TESTS:"
  for f in "${FAILED_FILES[@]}"; do echo "  - $f"; done
  exit 1
fi
exit 0
