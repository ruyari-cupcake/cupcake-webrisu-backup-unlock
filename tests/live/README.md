# Live E2E: risuai.xyz export → unlock → stock Risu restore

Proves the built `dist/` tool on the real venues. Everything stateful (browser profiles, backups,
fixtures, screenshots, result JSON) lands in `work/`, which is git-ignored and deleted after a run.
Needs Playwright with Chromium: `PLAYWRIGHT_MODULE=/path/to/node_modules/playwright`, or
`npm i -D playwright && npx playwright install chromium` in the repo.

1. Stock RisuAI from GitHub (the authority), served on a non-risuai origin:
   ```bash
   git clone --depth 1 https://github.com/kwaroran/RisuAI.git ~/vanilla-risu-live && cd ~/vanilla-risu-live
   pnpm install --frozen-lockfile
   VITE_RISU_LEGAL_CONFIGURED=TRUE pnpm exec vite build --outDir dist
   pnpm exec vite preview --outDir dist --host 127.0.0.1 --port 6420 --strictPort
   ```
2. A real encrypted export from risuai.xyz (20-image test card, no login):
   ```bash
   python3 gen-charx.py 10 9 work/unlock-test.charx "Unlock Test Bot"
   node drive.mjs web onboard && node drive.mjs web import && node drive.mjs web backup   # -> work/web-backup.bin
   ```
3. `bash run-e2e.sh` — bookmarklet and userscript forms on risuai.xyz (identical output), the
   already-plain path, then `run-restore.sh`: the control (original file into stock Risu must
   fail) and the unlocked file into stock Risu (character, first message and 20 assets present).
   `MOBILE=1 PROFILE=web-mobile node drive.mjs web unlock` checks the phone-sized panel;
   `FORM=jsurl node drive.mjs web unlock` navigates to the real `javascript:` URL.
4. Scale, both under the memory/time cap from `cap.sh` (`CAP_MEMORY`, `CAP_SECONDS`):
   - `bash run-scale.sh` — ~1.5 GiB of 1 MiB asset entries + the real export (assets stay lazy
     slices, so this measures scanning/assembly);
   - `DB_MIB=400 bash run-bigdb.sh` — a database of that size encrypted with a genuine key from
     `fetch-key.mjs` (the database is the only part held in memory); compares SHA-256.
   `rss-sampler.cjs` records the browser's peak RSS per process type.
5. `PROFILE=web-lifecycle node drive.mjs web lifecycle` — object URLs are revoked on panel
   replacement/close and a run closed mid-way mints none (needs `work/big.bin` from step 4 for the
   slow run). `BOOKMARKLET=<file>` runs an older build to show the check going red.

`bash run-all.sh` runs build, unit + mutation and steps 3–5 in that order.

6. Loader bookmarklet: `LOCAL_CONSOLE=1 node drive.mjs web loader` (serves the hosted
   `console.js` URL from this checkout — use before a release), the same with `MOBILE=1`, and
   `FAIL_LOAD=1` (bundle unreachable → the loader's alert). Without `LOCAL_CONSOLE` it loads the
   live GitHub Pages bundle (use after a release).
7. After pushing a release: `PROFILE=web-hosted node drive.mjs web hosted` takes the bookmarklet
   from the HOSTED install page (GitHub Pages; `HOSTED_URL` overrides) and the userscript from
   its link, unlocks `work/web-backup.bin` with each on risuai.xyz, and requires identical output.

Afterwards: stop the preview server, `rm -rf work ~/vanilla-risu-live`.
