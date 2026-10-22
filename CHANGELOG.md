# Changelog

## 0.1.0 — 2026-10-22

- Published as **컵케익 웹리스 백업 풀기** (`cupcake-webrisu-backup-unlock`) under the MIT License,
  with the install page on GitHub Pages and Tampermonkey update URLs pointing at `dist/`.
- First version: bookmarklet, userscript and console forms that run on risuai.xyz, fetch the
  backup's key the way RisuAI does, decrypt only `database.risudat`, drop `encryption.risudat`,
  copy every other entry byte-for-byte, and re-check the result before offering the download.
- Panel releases its output on close or replacement; closing mid-run cancels without output.
- Verified against stock RisuAI v2026.10.211 (restore of a real risuai.xyz export; databases up
  to 1 GiB; 1.5 GiB of assets) — evidence in `README.md` and `.report/acceptance-2026-10-22.md`.
