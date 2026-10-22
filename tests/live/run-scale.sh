#!/usr/bin/env bash
# Asset-scale check: unlock a ~1.5 GiB backup (many asset entries, real 10 KB database) on
# risuai.xyz with the bookmarklet while sampling the browser's RSS, under a memory/time cap.
# Asset entries stay lazy File slices, so this measures scanning/assembly, not decryption —
# run-bigdb.sh covers a large database.
set -euo pipefail
cd "$(dirname "$0")"
source ./cap.sh
COUNT="${COUNT:-1536}"
[ -f work/big.bin ] || node make-big.cjs work/web-backup.bin work/big.bin "$COUNT"
rm -rf work/profile-web-big work/big-unlocked.bin
node rss-sampler.cjs profile-web-big &
SAMPLER=$!
STATUS=0
"${CAP[@]}" env PROFILE=web-big FORM=bookmarklet IN=big.bin OUT=big-unlocked.bin node drive.mjs web unlock || STATUS=$?
kill -TERM "$SAMPLER"; wait "$SAMPLER" || true
node inspect.cjs work/big-unlocked.bin | head -3
echo "input $(stat -c %s work/big.bin) B, output $(stat -c %s work/big-unlocked.bin) B, expected output $(( $(stat -c %s work/big.bin) - 65 - 16 )) B"
exit "$STATUS"
