// Release check on what users actually get: the bookmarklet taken from the HOSTED install page
// (GitHub Pages) and the userscript from its update URL, each run on risuai.xyz against
// work/<IN>. Both outputs must be byte-identical and must be plain backups.
// HOSTED_URL overrides the install page (default: the project's GitHub Pages address).
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const HOSTED_URL = process.env.HOSTED_URL || 'https://ruyari-cupcake.github.io/cupcake-webrisu-backup-unlock/';
const PANEL = { name: '컵케익 웹리스 백업 풀기' };

async function unlockThroughPanel(risu, WORK, input, output) {
  const panel = risu.getByRole('dialog', PANEL);
  await panel.waitFor({ state: 'visible', timeout: 15000 });
  const [chooser] = await Promise.all([
    risu.waitForEvent('filechooser', { timeout: 10000 }),
    panel.getByRole('button', { name: '백업 파일 고르기' }).click(),
  ]);
  await chooser.setFiles(join(WORK, input));
  const status = panel.getByRole('status');
  await risu.waitForFunction((el) => /완료|❌/.test(el.textContent), await status.elementHandle(), { timeout: 120000 });
  const text = await status.innerText();
  if (!text.includes('해독 완료')) throw new Error(`unlock failed: ${text}`);
  const [download] = await Promise.all([
    risu.waitForEvent('download', { timeout: 30000 }),
    panel.getByRole('button', { name: '⬇ 풀린 백업 저장하기' }).click(),
  ]);
  await download.saveAs(join(WORK, output));
  return createHash('sha256').update(await readFile(join(WORK, output))).digest('hex');
}

export default async function ({ context, risu, shot, WORK }) {
  const input = process.env.IN || 'web-backup.bin';

  // 1. The hosted install page: follow the Pages root redirect, read the bookmarklet link.
  const page = await context.newPage();
  const response = await page.goto(HOSTED_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForURL(/dist\/install\.html$/, { timeout: 15000 });
  const href = await page.locator('a.bookmarklet').getAttribute('href');
  const userscriptUrl = new URL(await page.getByRole('link', { name: /\.user\.js$/ }).getAttribute('href'), page.url()).href;
  console.log(`hosted page: ${page.url()} (root HTTP ${response.status()}), bookmarklet ${href.length} chars, title "${await page.title()}"`);
  await shot(page, 'hosted-install-page');
  await page.close();

  // 2. Bookmarklet from the hosted page, navigated as a javascript: URL on risuai.xyz.
  await risu.evaluate((url) => { location.href = url; }, href);
  const viaBookmarklet = await unlockThroughPanel(risu, WORK, input, 'hosted-bookmarklet.bin');
  await shot(risu, 'hosted-bookmarklet');

  // 3. Userscript as Tampermonkey would fetch it from the hosted page's link.
  const userscript = await (await fetch(userscriptUrl)).text();
  if (!userscript.startsWith('// ==UserScript==')) throw new Error(`not a userscript: ${userscriptUrl}`);
  await risu.reload({ waitUntil: 'domcontentloaded' });
  await risu.waitForTimeout(4000);
  await risu.addScriptTag({ content: userscript });
  await risu.getByRole('button', { name: '🧁 백업 풀기' }).click();
  const viaUserscript = await unlockThroughPanel(risu, WORK, input, 'hosted-userscript.bin');
  console.log(`userscript from ${userscriptUrl}`);
  console.log(`sha256 bookmarklet=${viaBookmarklet}\nsha256 userscript =${viaUserscript}\nidentical: ${viaBookmarklet === viaUserscript}`);
  if (viaBookmarklet !== viaUserscript) process.exitCode = 1;
}
