// Large-DATABASE fixture: the real export's asset entries, then encryption.risudat for <time>,
// then a <MiB>-sized RISUSAVE-headed database encrypted with the genuine key exactly like
// risuai.xyz (AES-256-GCM, key = SHA-256(key string), 12 zero-byte IV, tag appended).
// Prints the plaintext SHA-256 so the unlocked output can be checked byte-for-byte.
// Usage: node make-big-db.cjs <real-backup.bin> <key.json> <out.bin> <MiB>   (key.json from fetch-key.mjs)
const fs = require('node:fs');
const crypto = require('node:crypto');
const core = require('../../src/core.js');

const CHUNK = 16 * 1024 * 1024;
const [source, keyFile, target, mibArg] = process.argv.slice(2);
const dbBytes = Number(mibArg) * 1024 * 1024;

function u32(value) {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(value);
  return bytes;
}

(async () => {
  const { time, key } = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
  const real = new Blob([fs.readFileSync(source)]);
  const assets = (await core.scanEntries(real)).filter((e) => !e.name.endsWith('.risudat'));
  const out = fs.createWriteStream(target);
  const write = (chunk) => new Promise((resolve) => (out.write(chunk) ? resolve() : out.once('drain', resolve)));

  for (const entry of assets) await write(Buffer.from(await real.slice(entry.start, entry.end).arrayBuffer()));
  const meta = Buffer.from(JSON.stringify({ time, type: 'account' }));
  const metaName = Buffer.from('encryption.risudat');
  await write(Buffer.concat([u32(metaName.length), metaName, u32(meta.length), meta]));

  const dbName = Buffer.from('database.risudat');
  await write(Buffer.concat([u32(dbName.length), dbName, u32(dbBytes + 16)]));
  const cipher = crypto.createCipheriv('aes-256-gcm', crypto.createHash('sha256').update(key, 'utf8').digest(), Buffer.alloc(12));
  const plainHash = crypto.createHash('sha256');
  const magic = Buffer.from('RISUSAVE\0', 'latin1');
  let written = 0;
  while (written < dbBytes) {
    const size = Math.min(CHUNK, dbBytes - written);
    const chunk = crypto.randomBytes(size);
    if (written === 0) magic.copy(chunk, 0);
    plainHash.update(chunk);
    await write(cipher.update(chunk));
    written += size;
  }
  await write(Buffer.concat([cipher.final(), cipher.getAuthTag()]));
  await new Promise((resolve) => out.end(resolve));
  console.log(JSON.stringify({ target, bytes: fs.statSync(target).size, assets: assets.length, dbPlainBytes: dbBytes, plainSha256: plainHash.digest('hex') }));
})();
