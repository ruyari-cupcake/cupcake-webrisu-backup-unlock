// SHA-256 of a backup's database.risudat payload, streamed from disk.
// Usage: node db-hash.cjs <backup.bin>
const fs = require('node:fs');
const crypto = require('node:crypto');
const core = require('../../src/core.js');

(async () => {
  const file = process.argv[2];
  const fd = fs.openSync(file, 'r');
  const size = fs.fstatSync(fd).size;
  // scanEntries only needs slice().arrayBuffer() on small header windows.
  const lazy = {
    size,
    slice(start, end) {
      return { arrayBuffer: async () => {
        const buffer = Buffer.alloc(end - start);
        fs.readSync(fd, buffer, 0, buffer.length, start);
        return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.length);
      } };
    },
  };
  const entries = await core.scanEntries(lazy);
  const db = entries.find((e) => e.name === 'database.risudat');
  const hash = crypto.createHash('sha256');
  for (let at = db.dataStart; at < db.end; at += 16 * 1024 * 1024) {
    const buffer = Buffer.alloc(Math.min(16 * 1024 * 1024, db.end - at));
    fs.readSync(fd, buffer, 0, buffer.length, at);
    hash.update(buffer);
  }
  console.log(JSON.stringify({ entries: entries.length, names: [...new Set(entries.map((e) => e.name.endsWith('.risudat') ? e.name : 'asset'))], dbBytes: db.end - db.dataStart, sha256: hash.digest('hex') }));
})();
