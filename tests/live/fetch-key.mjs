// Fetch the genuine backup key for a chosen timestamp from a page on risuai.xyz (the same
// request stock Risu makes during export), so a large synthetic DB can be encrypted exactly
// as risuai.xyz would. Usage: node fetch-key.mjs <out.json>
import { writeFile } from 'node:fs/promises';
import { chromium } from './playwright.mjs';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto('https://risuai.xyz/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  const time = Date.now();
  const key = await page.evaluate(async (t) => (await (await fetch(`https://sv.risuai.xyz/cryptokey?key=${t}`)).json()).key, time);
  if (typeof key !== 'string' || key.length < 16) throw new Error('no key');
  await writeFile(process.argv[2], JSON.stringify({ time, key }));
  console.log(`key for time ${time}: ${key.length} chars`);
} finally {
  await browser.close();
}
