// Restore work/<IN> through stock Risu's own "Load Backup Locally", then report what landed:
// IndexedDB contents, alert text, and whether the test character opens with its first message.
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { openAccountAndFiles } from './settings.mjs';
import { idbSummary } from './idb.mjs';

const bodyText = (page) => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));

export default async function ({ risu, shot, logs, WORK, venue }) {
  const input = join(WORK, process.env.IN);
  const label = process.env.LABEL || process.env.IN;
  const before = await idbSummary(risu);
  await openAccountAndFiles(risu);
  const chooserPromise = risu.waitForEvent('filechooser', { timeout: 20000 });
  await risu.getByRole('button', { name: 'Load Backup Locally' }).click();
  // Stock asks twice (backupLoadConfirm, backupLoadConfirm2) before opening the file picker.
  for (let confirm = 0; confirm < 2; confirm += 1) {
    await risu.waitForTimeout(1000);
    await risu.getByRole('button', { name: 'YES', exact: true }).click();
  }
  await (await chooserPromise).setFiles(input);

  // Success reloads the app (location.search = ''); failure leaves an alert on screen.
  const alerts = [];
  for (let i = 0; i < 30; i += 1) {
    await risu.waitForTimeout(1000);
    const text = await bodyText(risu).catch(() => '');
    const hit = /Failed[^.]*\.?[^.]*\.?|Success[^.]*/.exec(text);
    if (hit && !alerts.includes(hit[0])) alerts.push(hit[0]);
  }
  await shot(risu, `restore-${label}-1`);
  await risu.goto(risu.url(), { waitUntil: 'domcontentloaded' });
  await risu.waitForTimeout(6000);
  const after = await idbSummary(risu);

  // Open the first character in the sidebar, if any, and read the chat area.
  await risu.mouse.click(40, 93);
  await risu.waitForTimeout(2500);
  const text = await bodyText(risu);
  await shot(risu, `restore-${label}-2`);
  const result = {
    venue, label, input,
    before: { assets: before.assets, total: before.total },
    after: { assets: after.assets, total: after.total, hasDatabase: after.other.includes('database/database.bin') },
    alerts,
    characterVisible: text.includes('Unlock Test Bot'),
    firstMessageVisible: /Unlock Test Bot hello/.test(text),
    dialogs: logs.filter((line) => line.startsWith('dialog:')),
  };
  console.log(JSON.stringify(result, null, 2));
  await writeFile(join(WORK, `result-${label}.json`), JSON.stringify(result, null, 2));
}
