// Mutation check for tests/core.test.cjs: apply one plausible bug at a time to a copy of
// src/core.js and require the unit tests to go RED. Usage: npm run mutate
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'src/core.js'), 'utf8');
const MUTANTS = [
  ['skip length patch', 'new DataView(databaseHeader.buffer).setUint32(databaseHeader.length - LENGTH_BYTES, plain.byteLength, true);', ''],
  ['keep encryption entry', '      if (entry === encryption) {\n        flush();\n        continue;\n      }\n', ''],
  ['big-endian lengths', 'getUint32(offset, true)', 'getUint32(offset, false)'],
  ['raw key (no sha256)', "const key = await subtle.importKey('raw', digest,", "const key = await subtle.importKey('raw', new TextEncoder().encode(keyString).slice(0, 32),"],
  ['time not sent', 'KEY_ENDPOINT + encodeURIComponent(String(time))', "KEY_ENDPOINT + '0'"],
  ['accept duplicates', 'databaseEntries.length > 1 || encryptionEntries.length > 1', 'false'],
  ['no truncation check', 'if (end > blob.size) throw truncated(offset);', ''],
  ['ignore cancellation', "if (signal && signal.aborted) throw new UnlockError('CANCELLED', '작업을 취소했어요.');", ''],
];

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'rbu-mutants-'));
let survivors = 0;
try {
  for (const [label, from, to] of MUTANTS) {
    if (!source.includes(from)) throw new Error(`mutant "${label}" no longer matches src/core.js`);
    const dir = path.join(work, label.replace(/\W+/g, '-'));
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'tests'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src/core.js'), source.replace(from, to));
    fs.copyFileSync(path.join(ROOT, 'tests/core.test.cjs'), path.join(dir, 'tests/core.test.cjs'));
    const run = spawnSync(process.execPath, ['--test', path.join(dir, 'tests/core.test.cjs')], { encoding: 'utf8' });
    const failed = Number(/ℹ fail (\d+)/.exec(run.stdout)?.[1] || 0);
    if (!failed) survivors += 1;
    console.log(`${failed ? 'KILLED  ' : 'SURVIVED'} ${label} (failing tests: ${failed})`);
  }
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
process.exit(survivors ? 1 : 0);
