#!/usr/bin/env bash
# Restore half of run-e2e.sh: control (original encrypted) vs unlocked backup into stock Risu.
set -euo pipefail
cd "$(dirname "$0")"
rm -rf work/profile-stock-encrypted work/profile-stock-unlocked work/result-*.json
echo '== 4. control: ORIGINAL encrypted backup into stock Risu'
PROFILE=stock-encrypted node drive.mjs stock onboard > /dev/null
PROFILE=stock-encrypted IN=web-backup.bin LABEL=encrypted node drive.mjs stock restore
echo '== 5. UNLOCKED backup into stock Risu'
PROFILE=stock-unlocked node drive.mjs stock onboard > /dev/null
PROFILE=stock-unlocked IN=web-backup-unlocked.bin LABEL=unlocked node drive.mjs stock restore
