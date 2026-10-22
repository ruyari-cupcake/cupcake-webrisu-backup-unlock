// Loader bookmarklet on risuai.xyz: navigate to the javascript: URL from dist/loader-bookmarklet.txt,
// let it fetch the console bundle, and unlock work/<IN> through the panel. LOCAL_CONSOLE=1 serves
// the hosted console.js URL from this checkout's dist/ (pre-release check); FAIL_LOAD=1 aborts it
// and expects the loader's failure alert instead.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const DIST = new URL('../../dist/', import.meta.url).pathname;

export default async function ({ risu, shot, WORK }) {
  const loader = (await readFile(join(DIST, 'loader-bookmarklet.txt'), 'utf8')).trim();
  const hosted = /src:'([^']+)'/.exec(loader)[1];
  if (process.env.FAIL_LOAD) {
    await risu.route(hosted, (route) => route.abort('internetdisconnected'));
    const dialog = risu.waitForEvent('dialog', { timeout: 15000 });
    await risu.evaluate((url) => { location.href = url; }, loader);
    const message = (await dialog).message();
    console.log(`load failure alert: "${message}"`);
    if (!message.includes('load-failed')) process.exitCode = 1;
    return;
  }
  if (process.env.LOCAL_CONSOLE) {
    await risu.route(hosted, (route) => route.fulfill({ path: join(DIST, 'console.js'), contentType: 'text/javascript' }));
  }
  await risu.evaluate((url) => { location.href = url; }, loader);
  const panel = risu.getByRole('dialog', { name: '컵케익 웹리스 백업 풀기' });
  await panel.waitFor({ state: 'visible', timeout: 20000 });
  console.log(`panel: "${(await panel.locator('h2').innerText()).replace(/\s+/g, ' ')}"`);
  const [chooser] = await Promise.all([
    risu.waitForEvent('filechooser', { timeout: 10000 }),
    panel.getByRole('button', { name: '백업 파일 고르기' }).click(),
  ]);
  await chooser.setFiles(join(WORK, process.env.IN || 'web-backup.bin'));
  const status = panel.getByRole('status');
  await risu.waitForFunction((el) => /완료|❌/.test(el.textContent), await status.elementHandle(), { timeout: 120000 });
  console.log((await status.innerText()).split('\n').slice(0, 2).join(' | '));
  const [download] = await Promise.all([
    risu.waitForEvent('download', { timeout: 30000 }),
    panel.getByRole('button', { name: '⬇ 풀린 백업 저장하기' }).click(),
  ]);
  const out = join(WORK, process.env.OUT || 'loader-unlocked.bin');
  await download.saveAs(out);
  console.log(`saved ${out} sha256 ${createHash('sha256').update(await readFile(out)).digest('hex')}`);
  await shot(risu, 'loader');
}
