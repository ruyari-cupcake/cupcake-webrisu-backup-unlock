// Unit tests for src/core.js. Encryption here uses node:crypto (createCipheriv), not the
// tool's WebCrypto path, so a wrong key derivation or IV in the tool cannot pass by symmetry.
const test = require('node:test');
const assert = require('node:assert/strict');
const nodeCrypto = require('node:crypto');
const core = require('../src/core.js');

const KEY_STRING = 'f99a49c0ffee1234567890abcdef1234567890abcdef1234567890abcdef1234';
const KEY_TIME = 1792600000000;

function u32(value) {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(value);
  return bytes;
}

function entry(name, data) {
  const nameBytes = Buffer.from(name, 'utf8');
  const dataBytes = Buffer.from(data);
  return Buffer.concat([u32(nameBytes.length), nameBytes, u32(dataBytes.length), dataBytes]);
}

// Same scheme as risuai.xyz: AES-256-GCM, key = SHA-256(key string), 12 zero bytes IV,
// ciphertext followed by the 16-byte tag (WebCrypto layout).
function webRisuEncrypt(plain, keyString = KEY_STRING) {
  const key = nodeCrypto.createHash('sha256').update(keyString, 'utf8').digest();
  const cipher = nodeCrypto.createCipheriv('aes-256-gcm', key, Buffer.alloc(12));
  return Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
}

function meta(time = KEY_TIME) {
  return JSON.stringify({ time, type: 'account' });
}

const PLAIN_DB = Buffer.concat([Buffer.from('RISUSAVE\0', 'latin1'), nodeCrypto.randomBytes(5000)]);
const ASSET_A = nodeCrypto.randomBytes(3000);
const ASSET_B = nodeCrypto.randomBytes(10);
// Named and shaped like a stock cold-storage entry (UUID name, {message} payload). The tool
// treats every non-reserved entry as opaque bytes, so this checks it is not special-cased.
const COLD_NAME = 'coldstorage_3f2a9c4e-1b7d-4e8a-9c0f-5d6e7f8a9b0c.json';
const COLD = Buffer.from(JSON.stringify({ message: [{ role: 'char', data: 'archived chat' }] }));

function webBackup(order = 'stock') {
  const parts = {
    a: entry('0123abcd.png', ASSET_A),
    b: entry('에셋 이름.webp', ASSET_B),
    empty: entry('empty.bin', Buffer.alloc(0)),
    cold: entry(COLD_NAME, COLD),
    enc: entry('encryption.risudat', meta()),
    db: entry('database.risudat', webRisuEncrypt(PLAIN_DB)),
  };
  const sequence = order === 'stock'
    ? ['a', 'b', 'empty', 'cold', 'enc', 'db']
    : ['a', 'db', 'b', 'enc', 'empty', 'cold'];
  return new Blob(sequence.map((key) => parts[key]));
}

function keyServer(key = KEY_STRING, status = 200) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return {
      status,
      ok: status >= 200 && status < 300,
      json: async () => ({ key }),
    };
  };
  return { calls, fetchImpl };
}

// Independent port of the stock `LoadLocalBackup` parse loop (native Uint32Array lengths,
// streamed buffer), returning what the loader would act on.
async function stockLoaderView(blob) {
  const buffer = new Uint8Array(await blob.arrayBuffer());
  const seen = [];
  let encryptionMeta = { type: 'none' };
  let pendingDatabase = null;
  let offset = 0;
  while (offset + 4 <= buffer.length) {
    const nameLength = new Uint32Array(buffer.slice(offset, offset + 4).buffer)[0];
    if (offset + 4 + nameLength > buffer.length) break;
    const name = new TextDecoder().decode(buffer.slice(offset + 4, offset + 4 + nameLength));
    if (offset + 4 + nameLength + 4 > buffer.length) break;
    const dataLength = new Uint32Array(buffer.slice(offset + 4 + nameLength, offset + 8 + nameLength).buffer)[0];
    if (offset + 8 + nameLength + dataLength > buffer.length) break;
    const data = buffer.slice(offset + 8 + nameLength, offset + 8 + nameLength + dataLength);
    if (name === 'encryption.risudat') {
      const parsed = JSON.parse(new TextDecoder().decode(data));
      if (parsed.type === 'account' && parsed.time) encryptionMeta = parsed;
    } else if (name === 'database.risudat') {
      pendingDatabase = data;
    } else {
      seen.push([name, Buffer.from(data)]);
    }
    offset += 8 + nameLength + dataLength;
  }
  return { seen, encryptionMeta, pendingDatabase, leftover: buffer.length - offset };
}

test('unlocks a web backup into one the stock loader reads as plain', async () => {
  const server = keyServer();
  const result = await core.unlockBackup(webBackup(), { fetchImpl: server.fetchImpl });
  assert.equal(result.status, 'unlocked');
  assert.deepEqual(server.calls, [`https://sv.risuai.xyz/cryptokey?key=${KEY_TIME}`]);

  const view = await stockLoaderView(result.blob);
  assert.equal(view.encryptionMeta.type, 'none', 'no encryption entry may remain');
  assert.equal(view.leftover, 0);
  assert.ok(Buffer.from(view.pendingDatabase).equals(PLAIN_DB), 'database must be the exact plaintext');
  assert.deepEqual(view.seen.map(([name]) => name), ['0123abcd.png', '에셋 이름.webp', 'empty.bin', COLD_NAME]);
  assert.ok(view.seen[0][1].equals(ASSET_A));
  assert.ok(view.seen[1][1].equals(ASSET_B));
  assert.equal(view.seen[2][1].length, 0);
  assert.ok(view.seen[3][1].equals(COLD));

  assert.equal(result.summary.databaseFormat, 'risusave');
  assert.equal(result.summary.entryCount, 5);
  assert.equal(result.summary.outputBytes, result.blob.size);
});

test('entry order does not matter (metadata after the database, database mid-file)', async () => {
  const result = await core.unlockBackup(webBackup('shuffled'), { fetchImpl: keyServer().fetchImpl });
  const view = await stockLoaderView(result.blob);
  assert.equal(view.encryptionMeta.type, 'none');
  assert.ok(Buffer.from(view.pendingDatabase).equals(PLAIN_DB));
  assert.deepEqual(view.seen.map(([name]) => name), ['0123abcd.png', '에셋 이름.webp', 'empty.bin', COLD_NAME]);
  assert.ok(view.seen[0][1].equals(ASSET_A));
  assert.ok(view.seen[1][1].equals(ASSET_B));
  assert.ok(view.seen[3][1].equals(COLD));
});

test('a plain backup is reported as not encrypted and the key server is never asked', async () => {
  const server = keyServer();
  const plain = new Blob([entry('a.png', ASSET_A), entry('database.risudat', PLAIN_DB)]);
  const result = await core.unlockBackup(plain, { fetchImpl: server.fetchImpl });
  assert.deepEqual(result, { status: 'not-encrypted', entryCount: 2 });
  assert.equal(server.calls.length, 0);
});

test('a wrong key fails authentication instead of producing garbage', async () => {
  await assert.rejects(
    core.unlockBackup(webBackup(), { fetchImpl: keyServer('not-the-key').fetchImpl }),
    { code: 'DECRYPT_FAILED' },
  );
});

test('a tampered database entry fails authentication', async () => {
  const cipher = webRisuEncrypt(PLAIN_DB);
  cipher[100] ^= 1;
  const blob = new Blob([entry('encryption.risudat', meta()), entry('database.risudat', cipher)]);
  await assert.rejects(core.unlockBackup(blob, { fetchImpl: keyServer().fetchImpl }), { code: 'DECRYPT_FAILED' });
});

test('key server 403 (run outside risuai.xyz) is explained', async () => {
  await assert.rejects(
    core.unlockBackup(webBackup(), { fetchImpl: keyServer(KEY_STRING, 403).fetchImpl }),
    (error) => error.code === 'KEY_FORBIDDEN' && /risuai\.xyz/.test(error.message),
  );
});

test('network failure and bad key responses are typed errors', async () => {
  await assert.rejects(
    core.unlockBackup(webBackup(), { fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }),
    { code: 'KEY_NETWORK' },
  );
  await assert.rejects(core.unlockBackup(webBackup(), { fetchImpl: keyServer('').fetchImpl }), { code: 'KEY_BAD' });
  await assert.rejects(core.unlockBackup(webBackup(), { fetchImpl: keyServer(KEY_STRING, 500).fetchImpl }), { code: 'KEY_HTTP' });
  const notJson = async () => ({ status: 200, ok: true, json: async () => { throw new SyntaxError('Unexpected token <'); } });
  await assert.rejects(core.unlockBackup(webBackup(), { fetchImpl: notJson }), { code: 'KEY_BAD' });
});

test('a cancelled run stops at the next step and never returns a file', async () => {
  const early = new AbortController();
  early.abort();
  const server = keyServer();
  await assert.rejects(core.unlockBackup(webBackup(), { fetchImpl: server.fetchImpl, signal: early.signal }), { code: 'CANCELLED' });
  assert.equal(server.calls.length, 0, 'aborted before scanning: the key server is never asked');

  // Closing the panel while the key request is in flight.
  const late = new AbortController();
  const abortingServer = async (url) => {
    late.abort();
    return keyServer().fetchImpl(url);
  };
  await assert.rejects(core.unlockBackup(webBackup(), { fetchImpl: abortingServer, signal: late.signal }), { code: 'CANCELLED' });
});

test('truncated files are refused, whether cut in data or in a header', async () => {
  const full = Buffer.from(await webBackup().arrayBuffer());
  for (const cut of [full.length - 1, full.length - 30, 2, entry('0123abcd.png', ASSET_A).length + 6]) {
    await assert.rejects(
      core.unlockBackup(new Blob([full.subarray(0, cut)]), { fetchImpl: keyServer().fetchImpl }),
      { code: 'TRUNCATED' },
      `cut at ${cut}`,
    );
  }
});

test('invalid encryption metadata is refused', async () => {
  const db = entry('database.risudat', webRisuEncrypt(PLAIN_DB));
  for (const bad of ['not json', JSON.stringify({ type: 'none', time: 1 }), JSON.stringify({ type: 'account' })]) {
    const blob = new Blob([entry('encryption.risudat', bad), db]);
    await assert.rejects(core.unlockBackup(blob, { fetchImpl: keyServer().fetchImpl }), { code: 'BAD_META' });
  }
});

test('duplicate database or metadata entries are refused, not guessed', async () => {
  const db = entry('database.risudat', webRisuEncrypt(PLAIN_DB));
  const enc = entry('encryption.risudat', meta());
  for (const parts of [[enc, db, db], [enc, enc, db]]) {
    await assert.rejects(core.unlockBackup(new Blob(parts), { fetchImpl: keyServer().fetchImpl }), { code: 'UNEXPECTED_LAYOUT' });
  }
});

test('a file without a database entry (partial or foreign file) is refused', async () => {
  await assert.rejects(
    core.unlockBackup(new Blob([entry('a.png', ASSET_A)]), { fetchImpl: keyServer().fetchImpl }),
    { code: 'NO_DATABASE' },
  );
  await assert.rejects(core.unlockBackup(new Blob([]), { fetchImpl: keyServer().fetchImpl }), { code: 'NO_DATABASE' });
});

test('a garbage name length is reported as corrupt', async () => {
  const blob = new Blob([u32(0xfffffff0), Buffer.alloc(32)]);
  await assert.rejects(core.unlockBackup(blob, { fetchImpl: keyServer().fetchImpl }), { code: 'CORRUPT' });
});

test('names longer than the header read window are parsed correctly', async () => {
  const longName = `${'가'.repeat(2000)}.png`; // 6,004 UTF-8 bytes > 4 KiB window
  const blob = new Blob([
    entry(longName, ASSET_B),
    entry('encryption.risudat', meta()),
    entry('database.risudat', webRisuEncrypt(PLAIN_DB)),
  ]);
  const result = await core.unlockBackup(blob, { fetchImpl: keyServer().fetchImpl });
  const view = await stockLoaderView(result.blob);
  assert.equal(view.seen[0][0], longName);
  assert.ok(view.seen[0][1].equals(ASSET_B));
});

test('thousands of assets keep byte-identical content and order', async () => {
  const assets = Array.from({ length: 3000 }, (_, index) => [`asset-${index}.png`, nodeCrypto.randomBytes(index % 97)]);
  const blob = new Blob([
    ...assets.map(([name, data]) => entry(name, data)),
    entry('encryption.risudat', meta()),
    entry('database.risudat', webRisuEncrypt(PLAIN_DB)),
  ]);
  const result = await core.unlockBackup(blob, { fetchImpl: keyServer().fetchImpl });
  const view = await stockLoaderView(result.blob);
  assert.equal(view.seen.length, assets.length);
  view.seen.forEach(([name, data], index) => {
    assert.equal(name, assets[index][0]);
    assert.ok(data.equals(assets[index][1]));
  });
  assert.equal(result.blob.size, blob.size - entry('encryption.risudat', meta()).length - 16);
});

test('output file name keeps the original stem', () => {
  assert.equal(core.unlockedFileName('Binary.bin'), 'Binary-unlocked.bin');
  assert.equal(core.unlockedFileName('내 백업.BIN'), '내 백업-unlocked.bin');
  assert.equal(core.unlockedFileName(''), 'Binary-unlocked.bin');
});
