#!/usr/bin/env bash
# Scale check: unlock a ~1.5 GiB backup on risuai.xyz with the bookmarklet while sampling the
# browser's RSS. Capped (memory + time) so a regression cannot take the host down.
set -euo pipefail
cd "$(dirname "$0")"
COUNT="${COUNT:-1536}"
[ -f work/big.bin ] || node make-big.cjs work/web-backup.bin work/big.bin "$COUNT"
rm -rf work/profile-web-big work/big-unlocked.bin
node rss-sampler.cjs profile-web-big &
SAMPLER=$!
CAP=(timeout 900)
if systemd-run --user --scope --quiet true 2>/dev/null; then
  CAP=(systemd-run --user --scope --quiet -p MemoryMax=8G timeout 900)
fi
PROFILE=web-big FORM=bookmarklet IN=big.bin OUT=big-unlocked.bin "${CAP[@]}" node drive.mjs web unlock || STATUS=$?
kill -TERM "$SAMPLER"; wait "$SAMPLER" || true
node inspect.cjs work/big-unlocked.bin | head -3
echo "input $(stat -c %s work/big.bin) B, output $(stat -c %s work/big-unlocked.bin) B, expected output $(( $(stat -c %s work/big.bin) - 65 - 16 )) B"
exit "${STATUS:-0}"
