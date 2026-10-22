#!/usr/bin/env bash
# Full live run against the CURRENT dist/: needs work/web-backup.bin (a real risuai.xyz export,
# produced by `node drive.mjs web onboard|import|backup`) and stock Risu served at $STOCK_URL.
set -euo pipefail
cd "$(dirname "$0")"
node ../../scripts/build.cjs
rm -rf work/web-backup-unlocked*.bin

echo '== 1. bookmarklet on risuai.xyz'
FORM=bookmarklet OUT=web-backup-unlocked.bin node drive.mjs web unlock
echo '== 2. userscript on risuai.xyz (must produce identical bytes)'
FORM=userscript OUT=web-backup-unlocked-userscript.bin node drive.mjs web unlock
cmp work/web-backup-unlocked.bin work/web-backup-unlocked-userscript.bin && echo 'identical output'
echo '== 3. already-plain file is recognised'
FORM=bookmarklet IN=web-backup-unlocked.bin OUT=unused.bin node drive.mjs web unlock
node inspect.cjs work/web-backup.bin
node inspect.cjs work/web-backup-unlocked.bin

bash run-restore.sh
