// Run the BUILT tool on risuai.xyz exactly as a user would, through the panel UI.
// FORM=bookmarklet (default): the decoded javascript: URL from dist/bookmarklet.txt.
// FORM=userscript: dist/risu-backup-unlock.user.js, then its launcher button.
// Unlocks work/<IN> (default web-backup.bin) and saves work/<OUT>.
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const DIST = new URL('../../dist/', import.meta.url).pathname;

async function injectTool(risu, form) {
  if (form === 'userscript') {
    await risu.addScriptTag({ content: await readFile(join(DIST, 'risu-backup-unlock.user.js'), 'utf8') });
    await risu.getByRole('button', { name: '🧁 백업 풀기' }).click();
    return;
  }
  const url = (await readFile(join(DIST, 'bookmarklet.txt'), 'utf8')).trim();
  if (!url.startsWith('javascript:')) throw new Error('bookmarklet.txt is not a javascript: URL');
  // A bookmarklet runs its decoded body as a classic script in the page's main world.
  await risu.addScriptTag({ content: decodeURIComponent(url.slice('javascript:'.length)) });
}

export default async function ({ risu, shot, WORK }) {
  const form = process.env.FORM || 'bookmarklet';
  const input = join(WORK, process.env.IN || 'web-backup.bin');
  const output = join(WORK, process.env.OUT || 'web-backup-unlocked.bin');
  await injectTool(risu, form);
  const panel = risu.getByRole('dialog', { name: '웹리스 백업 풀기' });
  await panel.waitFor({ state: 'visible', timeout: 10000 });
  const [chooser] = await Promise.all([
    risu.waitForEvent('filechooser', { timeout: 10000 }),
    panel.getByRole('button', { name: '백업 파일 고르기' }).click(),
  ]);
  await chooser.setFiles(input);
  const status = panel.getByRole('status');
  await risu.waitForFunction(
    (el) => /완료|암호화되어 있지 않아요|❌/.test(el.textContent), await status.elementHandle(), { timeout: 60000 },
  );
  const statusText = await status.innerText();
  console.log(`[${form}] status:\n${statusText}`);
  await shot(risu, `unlock-${form}`);
  if (!statusText.includes('해독 완료')) return;
  const [download] = await Promise.all([
    risu.waitForEvent('download', { timeout: 30000 }),
    panel.getByRole('button', { name: '⬇ 풀린 백업 저장하기' }).click(),
  ]);
  await download.saveAs(output);
  console.log(`[${form}] saved ${output} (${(await stat(output)).size} B), suggested name: ${download.suggestedFilename()}`);
}
