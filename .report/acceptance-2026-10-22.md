# Acceptance — risu-backup-unlock 0.1.0 (2026-10-22)

Astra: ran | Sol: ran | Opus: ran (also covered agy's user-journey lens) | agy: skipped (provider quota
exhausted — `RESOURCE_EXHAUSTED (code 429)`, resets in ~42 h; retrying cannot succeed)

Reviewed venue: commit a08e52e. All four verdicts that ran: **ACCEPT WITH FIXES**; nobody found a
defect in the parse / decrypt / repack path. One round; fixes below were then verified with the
final build by `tests/live/run-all.sh` (exit 0).

## Findings and disposition

| # | Seat(s) | Finding | Disposition | Evidence |
|---|---|---|---|---|
| 1 | Astra, Sol | Panel replacement/close leaked the output object URL; a run closed mid-way still minted one | **Fixed**: per-panel idempotent `dispose` used on close and replacement; `AbortController` → `unlockBackup({signal})` stops at step boundaries and late results are dropped | live `step-lifecycle.mjs` 7/7 PASS; same check on the pre-fix bookmarklet: 3 FAIL (revert-proof); unit cancellation test + mutant "ignore cancellation" KILLED |
| 2 | Opus, Sol | Scale test grew only lazily-sliced assets; the database (the only in-memory part) was 10 KB | **Fixed**: `run-bigdb.sh` — synthetic DB encrypted with a genuine key fetched on risuai.xyz | 400 MiB: 5.4 s, renderer 1,668 MiB, SHA-256 equal; 1 GiB: 9.5 s, renderer 4,184 MiB, SHA-256 equal (8G cap) |
| 3 | (found while fixing 2) | The first 1.5 GiB run was not memory-capped: `systemd-run --user` silently failed without bus variables | **Fixed**: `cap.sh` supplies the bus variables and warns loudly if the cap still cannot apply | final runs print `cap: MemoryMax=8G, 900s` |
| 4 | Sol | Cold-storage fixture name did not match stock's UUID rule, so it proved nothing about cold storage | **Fixed** (fixture now stock-shaped) / **documented**: a live restore with genuine cold or plugin storage was not exercised; the tool copies those entries byte-for-byte | unit tests; README "확인하지 못한 것" |
| 5 | Sol, Opus | Firefox, native Android/iOS, drag-to-bookmark-bar never run | **Documented** as unverified in README and install page; PC recommended | — |
| 6 | Opus | The owner's own backup into the actual Tauri desktop app not run | **Owner action** (the backup and the desktop install are off this machine) | — |
| 7 | Opus | README dates: account-sync backups encrypted since June; #1681 fix does not unlock old backups | **Fixed** | README "왜 필요한가" |
| 8 | Opus | Output Blob references the original file | **Fixed**: panel, README and install page say to keep the original until saved | — |
| 9 | Opus | `innerHTML` would break if risuai.xyz enabled its commented-out Trusted-Types CSP | **Declined**: speculative (the policy is commented out upstream), and a strict `script-src` would block the bookmarklet anyway; README limit names CSP hardening | upstream `index.html:14` |
| 10 | Opus | Live test depended on `risu-asset-cleaner/…/gen-charx.py` | **Fixed**: vendored into `tests/live/` | — |
| 11 | Opus | Install page: no userscript link, no "allow pasting" note, partial-backup fallback unmentioned, nobody can find the tool | **Fixed** (links, note, fallback line); publishing is an **owner decision** | `src/install.template.html` |
| 12 | Astra | Untested branches: non-JSON key response, shuffled-layout byte equality | **Fixed** (tests added) | `tests/core.test.cjs` |

## Final run (final build, `tests/live/run-all.sh`, exit 0)

- 18 unit/bundle tests pass; 8/8 mutants killed.
- risuai.xyz: bookmarklet and userscript outputs byte-identical (152,744 B); already-plain file recognised.
- Stock RisuAI v2026.10.211 on a non-risuai origin: original → key 403, no character; unlocked → character, first message, 20 assets.
- Panel lifecycle 7/7.
- Asset scale 1.5 GiB: 12.0 s, renderer 310 MiB, output size = input − 81 B.
- Database scale: 400 MiB and 1 GiB as in row 2.
