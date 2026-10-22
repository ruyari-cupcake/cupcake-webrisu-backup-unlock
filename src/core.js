// Core of the web-Risu backup unlocker. No DOM access, so the same code runs on risuai.xyz
// (bookmarklet / userscript / console) and under node:test.
//
// Backup container, as written by stock RisuAI `LocalWriter.writeBackup`, is a run of entries:
//   [u32 LE name length][UTF-8 name][u32 LE data length][data]
// Since v2026.10.210 risuai.xyz encrypts every full backup's `database.risudat` (AES-GCM, key =
// SHA-256 of a string from sv.risuai.xyz, zero IV) and records the key timestamp in
// `encryption.risudat`. The key server only answers pages on risuai.xyz, so other Risu builds
// cannot restore the file. Unlocking = decrypt that one entry, drop the metadata entry, and copy
// every other entry byte-for-byte, which any stock Risu loader then reads as a plain backup.
const RisuBackupUnlock = (() => {
  'use strict';

  const KEY_ENDPOINT = 'https://sv.risuai.xyz/cryptokey?key=';
  const ENCRYPTION_ENTRY = 'encryption.risudat';
  const DATABASE_ENTRY = 'database.risudat';
  const LENGTH_BYTES = 4;
  // One read per entry: two lengths plus an asset name almost always fit in this window.
  const HEADER_WINDOW_BYTES = 4096;
  // Guards against reading a garbage length as a multi-GB name in a damaged file.
  const MAX_NAME_BYTES = 64 * 1024;
  const GCM_IV = new Uint8Array(12);
  const SAVE_FORMATS = [
    ['risusave', [82, 73, 83, 85, 83, 65, 86, 69, 0]],
    ['compressed', [0, 82, 73, 83, 85, 83, 65, 86, 69, 0, 8]],
    ['raw', [0, 82, 73, 83, 85, 83, 65, 86, 69, 0, 7]],
    ['stream', [0, 82, 73, 83, 85, 83, 65, 86, 69, 0, 9]],
  ];

  class UnlockError extends Error {
    constructor(code, message) {
      super(message);
      this.name = 'UnlockError';
      this.code = code;
    }
  }

  async function readBytes(blob, start, end) {
    return new Uint8Array(await blob.slice(start, end).arrayBuffer());
  }

  function readU32(bytes, offset) {
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
  }

  function truncated(offset) {
    return new UnlockError('TRUNCATED',
      `백업 파일이 ${offset} 바이트 지점에서 끊겨 있어요. 다운로드가 끝까지 됐는지 확인해 주세요.`);
  }

  function throwIfCancelled(signal) {
    if (signal && signal.aborted) throw new UnlockError('CANCELLED', '작업을 취소했어요.');
  }

  // Lists entries by reading headers only; entry data is never loaded here, so a multi-GB
  // backup costs one small read per entry.
  async function scanEntries(blob, onProgress, signal) {
    const decoder = new TextDecoder();
    const entries = [];
    let offset = 0;
    while (offset < blob.size) {
      throwIfCancelled(signal);
      if (offset + LENGTH_BYTES > blob.size) throw truncated(offset);
      let header = await readBytes(blob, offset, Math.min(blob.size, offset + HEADER_WINDOW_BYTES));
      const nameLength = readU32(header, 0);
      if (nameLength > MAX_NAME_BYTES) {
        throw new UnlockError('CORRUPT', `${offset} 바이트 지점의 항목 이름 길이가 비정상이에요. 리스 백업 파일이 맞나요?`);
      }
      const headerLength = LENGTH_BYTES + nameLength + LENGTH_BYTES;
      if (offset + headerLength > blob.size) throw truncated(offset);
      if (header.length < headerLength) header = await readBytes(blob, offset, offset + headerLength);
      const dataLength = readU32(header, LENGTH_BYTES + nameLength);
      const dataStart = offset + headerLength;
      const end = dataStart + dataLength;
      if (end > blob.size) throw truncated(offset);
      entries.push({
        name: decoder.decode(header.subarray(LENGTH_BYTES, LENGTH_BYTES + nameLength)),
        start: offset,
        dataStart,
        end,
      });
      offset = end;
      if (onProgress) onProgress(offset, blob.size, entries.length);
    }
    return entries;
  }

  // Mirrors the stock loader's acceptance rule: `meta.type === 'account' && meta.time`.
  function parseEncryptionMeta(bytes) {
    let meta;
    try {
      meta = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new UnlockError('BAD_META', 'encryption.risudat 내용을 읽을 수 없어요.');
    }
    if (!meta || meta.type !== 'account' || !meta.time) {
      throw new UnlockError('BAD_META', 'encryption.risudat 형식이 예상과 달라요 (type/time 없음).');
    }
    return meta;
  }

  async function fetchKey(time, fetchImpl) {
    let response;
    try {
      response = await fetchImpl(KEY_ENDPOINT + encodeURIComponent(String(time)));
    } catch (error) {
      throw new UnlockError('KEY_NETWORK',
        `키 서버에 연결하지 못했어요 (${error && error.message}). risuai.xyz 페이지에서 실행했는지, 인터넷이 되는지 확인해 주세요.`);
    }
    if (response.status === 403) {
      throw new UnlockError('KEY_FORBIDDEN', '키 서버가 거절했어요 (403). 이 도구는 risuai.xyz 페이지에서 실행해야 해요.');
    }
    if (!response.ok) throw new UnlockError('KEY_HTTP', `키 서버 응답이 비정상이에요 (HTTP ${response.status}).`);
    let body;
    try {
      body = await response.json();
    } catch {
      throw new UnlockError('KEY_BAD', '키 서버 응답을 읽을 수 없어요.');
    }
    if (!body || typeof body.key !== 'string' || !body.key) throw new UnlockError('KEY_BAD', '키 서버 응답에 키가 없어요.');
    return body.key;
  }

  async function decryptDatabase(cipher, keyString, subtle) {
    const digest = await subtle.digest('SHA-256', new TextEncoder().encode(keyString));
    const key = await subtle.importKey('raw', digest, 'AES-GCM', false, ['decrypt']);
    try {
      return new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: GCM_IV }, key, cipher));
    } catch {
      // AES-GCM authenticates the whole payload, so this also catches a damaged database entry.
      throw new UnlockError('DECRYPT_FAILED', '데이터베이스 해독에 실패했어요. 파일이 손상됐거나 키가 맞지 않아요.');
    }
  }

  // Informational only: stock Risu also accepts legacy layouts, so an unknown header is not an error.
  function detectSaveFormat(bytes) {
    for (const [format, magic] of SAVE_FORMATS) {
      if (bytes.length >= magic.length && magic.every((value, index) => bytes[index] === value)) return format;
    }
    return 'unknown';
  }

  function unlockedFileName(name) {
    const base = String(name || 'Binary').replace(/\.bin$/i, '');
    return `${base}-unlocked.bin`;
  }

  // Re-reads the produced file the way a loader would and checks it against the plan, so a
  // mistake in assembly surfaces here instead of during the user's restore.
  async function verifyOutput(output, expected) {
    const entries = await scanEntries(output);
    if (entries.length !== expected.length) {
      throw new UnlockError('VERIFY_FAILED', `결과 파일 항목 수가 맞지 않아요 (${entries.length} ≠ ${expected.length}).`);
    }
    entries.forEach((entry, index) => {
      const want = expected[index];
      if (entry.name !== want.name || entry.end - entry.dataStart !== want.dataLength) {
        throw new UnlockError('VERIFY_FAILED', `결과 파일 ${index}번째 항목이 원본과 달라요 (${entry.name}).`);
      }
    });
  }

  /**
   * Turns an encrypted risuai.xyz full backup into a plain one.
   * @param {Blob} blob the original `.bin` backup (a File works)
   * @param {{fetchImpl?: Function, subtle?: SubtleCrypto, onScanProgress?: Function,
   *   onPhase?: (phase: 'scan'|'key'|'decrypt'|'verify') => void, signal?: AbortSignal}} [options]
   *   `signal` stops the work at the next step boundary (a running WebCrypto call cannot be
   *   interrupted); a cancelled run throws UnlockError CANCELLED and never returns a file.
   * @returns {Promise<{status: 'not-encrypted', entryCount: number} |
   *   {status: 'unlocked', blob: Blob, summary: object}>}
   */
  async function unlockBackup(blob, options = {}) {
    const fetchImpl = options.fetchImpl || globalThis.fetch.bind(globalThis);
    const subtle = options.subtle || globalThis.crypto.subtle;
    const phase = options.onPhase || (() => {});
    const { signal } = options;
    phase('scan');
    const entries = await scanEntries(blob, options.onScanProgress, signal);
    const encryptionEntries = entries.filter((entry) => entry.name === ENCRYPTION_ENTRY);
    const databaseEntries = entries.filter((entry) => entry.name === DATABASE_ENTRY);
    if (databaseEntries.length === 0) {
      throw new UnlockError('NO_DATABASE', 'database.risudat 항목이 없어요. 리스 "전체 백업" .bin 파일이 맞는지 확인해 주세요.');
    }
    // Real exports write each exactly once; anything else is refused rather than guessed at.
    if (databaseEntries.length > 1 || encryptionEntries.length > 1) {
      throw new UnlockError('UNEXPECTED_LAYOUT', '데이터베이스나 암호화 정보가 두 번 이상 들어 있는 백업이에요. 안전을 위해 처리하지 않을게요.');
    }
    if (encryptionEntries.length === 0) return { status: 'not-encrypted', entryCount: entries.length };

    const encryption = encryptionEntries[0];
    const database = databaseEntries[0];
    const meta = parseEncryptionMeta(await readBytes(blob, encryption.dataStart, encryption.end));
    throwIfCancelled(signal);
    phase('key');
    const key = await fetchKey(meta.time, fetchImpl);
    throwIfCancelled(signal);
    phase('decrypt');
    const plain = await decryptDatabase(await readBytes(blob, database.dataStart, database.end), key, subtle);
    throwIfCancelled(signal);

    // Reuse the original header bytes (exact name encoding) with the plaintext length patched in.
    const databaseHeader = await readBytes(blob, database.start, database.dataStart);
    new DataView(databaseHeader.buffer).setUint32(databaseHeader.length - LENGTH_BYTES, plain.byteLength, true);

    // Untouched entries stay lazy File slices, so assets never pass through memory.
    const parts = [];
    const expected = [];
    let runStart = -1;
    let runEnd = -1;
    const flush = () => {
      if (runStart >= 0) parts.push(blob.slice(runStart, runEnd));
      runStart = -1;
    };
    for (const entry of entries) {
      if (entry === encryption) {
        flush();
        continue;
      }
      if (entry === database) {
        flush();
        parts.push(databaseHeader, plain);
        expected.push({ name: entry.name, dataLength: plain.byteLength });
        continue;
      }
      if (runStart < 0) runStart = entry.start;
      runEnd = entry.end;
      expected.push({ name: entry.name, dataLength: entry.end - entry.dataStart });
    }
    flush();

    const output = new Blob(parts, { type: 'application/octet-stream' });
    phase('verify');
    await verifyOutput(output, expected);
    throwIfCancelled(signal);
    return {
      status: 'unlocked',
      blob: output,
      summary: {
        keyTime: meta.time,
        entryCount: expected.length,
        otherEntryCount: expected.length - 1,
        databaseBytes: plain.byteLength,
        databaseFormat: detectSaveFormat(plain),
        inputBytes: blob.size,
        outputBytes: output.size,
      },
    };
  }

  return {
    KEY_ENDPOINT,
    ENCRYPTION_ENTRY,
    DATABASE_ENTRY,
    UnlockError,
    scanEntries,
    parseEncryptionMeta,
    fetchKey,
    decryptDatabase,
    detectSaveFormat,
    unlockedFileName,
    unlockBackup,
  };
})();

if (typeof module === 'object' && module.exports) module.exports = RisuBackupUnlock; // @strip-in-bundle
