// Counts what stock Risu (web mode) holds in its localforage IndexedDB.
export const idbSummary = (page) => page.evaluate(async () => {
  const request = indexedDB.open('risuai');
  const idb = await new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  if (!idb.objectStoreNames.contains('keyvaluepairs')) return { total: 0, assets: 0, other: [] };
  const keys = await new Promise((resolve) => {
    const out = [];
    const cursor = idb.transaction('keyvaluepairs').objectStore('keyvaluepairs').openKeyCursor();
    cursor.onsuccess = () => {
      const current = cursor.result;
      if (!current) return resolve(out);
      out.push(String(current.key));
      current.continue();
    };
  });
  idb.close();
  return {
    total: keys.length,
    assets: keys.filter((key) => key.startsWith('assets/')).length,
    other: keys.filter((key) => !key.startsWith('assets/')),
  };
});
