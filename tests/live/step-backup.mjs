// Press Risu's own "Save Backup Locally" and keep the downloaded .bin as work/<venue>-backup.bin.
import { join } from 'node:path';
import { stat } from 'node:fs/promises';
import { openAccountAndFiles } from './settings.mjs';

export default async function ({ context, risu, shot, WORK, venue }) {
  await openAccountAndFiles(risu);
  const downloads = [];
  const watch = (page) => page.on('download', (download) => downloads.push(download));
  context.pages().forEach(watch);
  context.on('page', watch);
  await risu.getByRole('button', { name: 'Save Backup Locally' }).click();
  await risu.waitForTimeout(1000);
  await risu.getByRole('button', { name: 'YES', exact: true }).click(); // Risu's own confirm
  for (let i = 0; i < 60 && downloads.length === 0; i += 1) await risu.waitForTimeout(1000);
  await shot(risu, 'backup-1');
  if (!downloads.length) throw new Error('no download event from Save Backup Locally');
  const target = join(WORK, `${venue}-backup.bin`);
  await downloads[0].saveAs(target);
  await risu.waitForTimeout(3000);
  await shot(risu, 'backup-2');
  console.log('saved', target, (await stat(target)).size, 'bytes; suggested name:', downloads[0].suggestedFilename());
  console.log('alert text:', (await risu.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 200));
}
