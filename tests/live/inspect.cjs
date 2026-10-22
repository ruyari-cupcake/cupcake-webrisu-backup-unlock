// Print a backup's entry list (name, size) and the encryption metadata, if any.
// Usage: node inspect.cjs <backup.bin>
const fs = require('node:fs');
const core = require('../../src/core.js');

(async () => {
  const blob = new Blob([fs.readFileSync(process.argv[2])]);
  const entries = await core.scanEntries(blob);
  const assets = entries.filter((e) => !e.name.endsWith('.risudat'));
  console.log(`${entries.length} entries, ${assets.length} non-risudat (assets/cold storage)`);
  for (const entry of entries.filter((e) => e.name.endsWith('.risudat'))) {
    const data = new Uint8Array(await blob.slice(entry.dataStart, entry.end).arrayBuffer());
    const preview = entry.name === core.ENCRYPTION_ENTRY
      ? new TextDecoder().decode(data)
      : `format=${core.detectSaveFormat(data)} head=${Buffer.from(data.subarray(0, 12)).toString('hex')}`;
    console.log(`  ${entry.name} ${entry.end - entry.dataStart} B ${preview}`);
  }
})();
