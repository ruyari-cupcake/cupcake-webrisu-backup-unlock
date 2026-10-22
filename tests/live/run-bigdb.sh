#!/usr/bin/env bash
# Large-DATABASE check: the database is the only part held in memory (read, decrypted, copied
# into the output Blob), so its size — not the asset total — bounds the tool's memory.
# Builds a DB_MIB-sized fixture encrypted with a genuine key fetched on risuai.xyz, unlocks it
# with the bookmarklet under a memory/time cap while sampling RSS, then compares the output
# database's SHA-256 with the plaintext's.
set -euo pipefail
cd "$(dirname "$0")"
source ./cap.sh
DB_MIB="${DB_MIB:-400}"
IN="bigdb-${DB_MIB}.bin"
OUT="bigdb-${DB_MIB}-unlocked.bin"
if [ ! -f "work/$IN" ]; then
  [ -f work/key.json ] || node fetch-key.mjs work/key.json
  node make-big-db.cjs work/web-backup.bin work/key.json "work/$IN" "$DB_MIB" | tee "work/$IN.json"
fi
rm -rf work/profile-web-bigdb "work/$OUT"
node rss-sampler.cjs profile-web-bigdb &
SAMPLER=$!
STATUS=0
"${CAP[@]}" env PROFILE=web-bigdb FORM=bookmarklet IN="$IN" OUT="$OUT" node drive.mjs web unlock || STATUS=$?
kill -TERM "$SAMPLER"; wait "$SAMPLER" || true
echo "expected plaintext: $(node -p "require('./work/$IN.json').plainSha256")"
[ -f "work/$OUT" ] && node db-hash.cjs "work/$OUT"
exit "$STATUS"
