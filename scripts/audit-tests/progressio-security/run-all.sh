#!/bin/bash
cd /home/user/ipas-ai-game
PASS=0; FAIL=0
for f in scripts/audit-tests/progressio-security/[0-9]*.test.js; do
  name=$(basename "$f" .test.js)
  if node "$f" > "${f%.test.js}.stdout.log" 2>&1; then
    echo "PASS  $name"; PASS=$((PASS+1))
  else
    echo "FAIL  $name (exit $?)"; FAIL=$((FAIL+1))
  fi
done
echo "Total: $((PASS+FAIL)) PASS=$PASS FAIL=$FAIL"
