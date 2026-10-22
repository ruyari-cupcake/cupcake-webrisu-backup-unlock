// Scale fixture: <count> synthetic 1 MiB asset entries followed by every entry of a REAL
// risuai.xyz export verbatim (its encrypted database stays under the genuine server key).
// Usage: node make-big.cjs <real-backup.bin> <out.bin> <count>
const fs = require('node:fs');
const crypto = require('node:crypto');

const ENTRY_BYTES = 1024 * 1024;
const [source, target, countArg] = process.argv.slice(2);
const count = Number(countArg);

function u32(value) {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(value);
  return bytes;
}

(async () => {
  const out = fs.createWriteStream(target);
  const write = (chunk) => new Promise((resolve) => (out.write(chunk) ? resolve() : out.once('drain', resolve)));
  const payload = crypto.randomBytes(ENTRY_BYTES);
  for (let index = 0; index < count; index += 1) {
    const name = Buffer.from(`scale-${String(index).padStart(5, '0')}.png`);
    payload.writeUInt32LE(index, 0); // distinct content per entry
    await write(Buffer.concat([u32(name.length), name, u32(payload.length)]));
    await write(payload);
  }
  await write(fs.readFileSync(source));
  await new Promise((resolve) => out.end(resolve));
  console.log(`${target}: ${fs.statSync(target).size} bytes (${count} synthetic + real entries)`);
})();
