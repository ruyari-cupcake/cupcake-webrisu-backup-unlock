# Live E2E: risuai.xyz export → unlock → stock Risu restore

Proves the built `dist/` tool on the real venues. Everything stateful (browser profiles, backups,
screenshots, result JSON) lands in `work/`, which is git-ignored and deleted after a run.

1. Stock RisuAI from GitHub (the authority), served on a non-risuai origin:
   ```bash
   git clone --depth 1 https://github.com/kwaroran/RisuAI.git ~/vanilla-risu-live && cd ~/vanilla-risu-live
   pnpm install --frozen-lockfile
   VITE_RISU_LEGAL_CONFIGURED=TRUE pnpm exec vite build --outDir dist
   pnpm exec vite preview --outDir dist --host 127.0.0.1 --port 6420 --strictPort
   ```
2. A real encrypted export from risuai.xyz (20-image test card, no login):
   ```bash
   python3 ../../../risu-asset-cleaner/scripts/live-stock-risu/gen-charx.py 10 9 work/unlock-test.charx "Unlock Test Bot"
   node drive.mjs web onboard && node drive.mjs web import && node drive.mjs web backup   # -> work/web-backup.bin
   ```
3. `bash run-e2e.sh` — bookmarklet and userscript forms on risuai.xyz (identical output), the
   already-plain path, then the control (original file into stock Risu must fail) and the unlocked
   file into stock Risu (character, first message and 20 assets must be present).
   `MOBILE=1 PROFILE=web-mobile node drive.mjs web unlock` checks the phone-sized panel;
   `FORM=jsurl node drive.mjs web unlock` navigates to the real `javascript:` URL.
4. `bash run-scale.sh` — ~1.5 GiB fixture (1 MiB synthetic assets + the real export's entries,
   so the database stays under a genuine server key), unlocked under a memory/time cap while
   `rss-sampler.cjs` records the browser's peak RSS; prints entry list and expected vs actual size.

Afterwards: stop the preview server, `rm -rf work ~/vanilla-risu-live`.
