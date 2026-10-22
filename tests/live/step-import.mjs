// Import the test card through Risu's own "+ -> Import" UI and wait for its assets to land.
import { join } from 'node:path';
import { visibleButtons } from './step-explore.mjs';
import { idbSummary } from './idb.mjs';

export default async function ({ risu, shot, WORK }) {
  await risu.mouse.click(40, 93);
  await risu.waitForTimeout(1500);
  console.log('after plus:', JSON.stringify((await visibleButtons(risu)).slice(0, 15)));
  await shot(risu, 'import-1');
  // Exact label first: hub cards can also contain the word "import".
  const exact = risu.getByRole('button', { name: /^(Import Character|캐릭터 가져오기|캐릭터 불러오기)$/ });
  const importButton = (await exact.count()) ? exact.first() : risu.getByRole('button', { name: /import|가져오기|불러오기/i }).first();
  const [chooser] = await Promise.all([
    risu.waitForEvent('filechooser', { timeout: 15000 }),
    importButton.click(),
  ]);
  await chooser.setFiles(join(WORK, process.env.CARD || 'unlock-test.charx'));
  const want = Number(process.env.EXPECT_ASSETS || 20);
  for (let i = 0; i < 60; i += 1) {
    if ((await idbSummary(risu)).assets >= want) break;
    await risu.waitForTimeout(2000);
  }
  await risu.waitForTimeout(8000); // let the save loop write database.bin
  await shot(risu, 'import-2');
  console.log('idb after import:', JSON.stringify(await idbSummary(risu)));
}
