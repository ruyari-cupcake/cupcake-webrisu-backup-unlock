#!/usr/bin/env bash
# Every acceptance check against the CURRENT source, in order: unit + mutation, build, live
# unlock/restore (run-e2e.sh), panel lifecycle, asset scale, database scale (400 MiB, 1 GiB).
# Needs the stock venue and work/web-backup.bin (see README.md). Stops at the first failure.
set -euo pipefail
cd "$(dirname "$0")"
echo "== build"; node ../../scripts/build.cjs
echo "== unit + bundle tests"; (cd ../.. && node --test tests/*.test.cjs 2>&1 | grep -E '^(✖|ℹ (tests|pass|fail))')
echo "== mutation"; (cd ../.. && node tests/mutate.cjs)
bash run-e2e.sh
echo "== panel lifecycle"; rm -rf work/profile-web-lifecycle; PROFILE=web-lifecycle node drive.mjs web lifecycle
echo "== asset scale"; bash run-scale.sh
for size in ${DB_SIZES:-400 1024}; do echo "== database scale ${size} MiB"; DB_MIB="$size" bash run-bigdb.sh; done
echo "ALL CHECKS DONE"
