// Panel lifecycle on risuai.xyz: object URLs created by the tool must be revoked when the panel
// is replaced or closed, and a run abandoned by closing the panel must never mint a URL.
// Counts URL.createObjectURL / revokeObjectURL calls made while the tool runs.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const DIST = new URL('../../dist/', import.meta.url).pathname;

export default async function ({ risu, shot, WORK }) {
  // BOOKMARKLET=<file> runs another build (e.g. a pre-fix one, to prove this check goes red).
  const url = (await readFile(process.env.BOOKMARKLET || join(DIST, 'bookmarklet.txt'), 'utf8')).trim();
  const body = decodeURIComponent(url.slice('javascript:'.length));
  const inject = () => risu.addScriptTag({ content: body });
  await risu.evaluate(() => {
    const created = new Set();
    const revoked = new Set();
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (object) => { const made = create(object); created.add(made); return made; };
    URL.revokeObjectURL = (target) => { revoked.add(target); revoke(target); };
    window.__rbuUrls = () => ({ created: [...created], revoked: [...revoked] });
  });
  const urls = () => risu.evaluate(() => window.__rbuUrls());
  const panelCount = () => risu.evaluate(() => document.querySelectorAll('#cupcake-risu-backup-unlock').length);
  const panel = () => risu.getByRole('dialog', { name: '컵케익 웹리스 백업 풀기' });
  const pickFile = async (file) => {
    const [chooser] = await Promise.all([
      risu.waitForEvent('filechooser', { timeout: 10000 }),
      panel().getByRole('button', { name: '백업 파일 고르기' }).click(),
    ]);
    await chooser.setFiles(join(WORK, file));
  };
  const waitDone = () => risu.waitForFunction(
    () => /완료|❌/.test(document.querySelector('#cupcake-risu-backup-unlock')?.shadowRoot?.querySelector('.status')?.textContent || ''),
    null, { timeout: 120000 },
  );
  const checks = [];
  const check = (name, ok, detail) => checks.push({ name, ok, detail });

  // A: finished panel replaced by running the bookmarklet again.
  await inject();
  await pickFile('web-backup.bin');
  await waitDone();
  const afterFirst = await urls();
  await inject();
  const afterReplace = await urls();
  check('A: first unlock created one URL', afterFirst.created.length === 1, afterFirst);
  check('A: replacing the panel revoked it', afterReplace.revoked.includes(afterFirst.created[0]), afterReplace);
  check('A: exactly one panel after replacement', (await panelCount()) === 1, await panelCount());

  // B: close while a ~1.5 GiB backup is still being processed; the late result must be dropped.
  await pickFile(process.env.BIG || 'big.bin');
  await risu.waitForTimeout(800);
  await panel().getByRole('button', { name: '닫기' }).click();
  await risu.waitForTimeout(Number(process.env.SETTLE_MS || 20000));
  const afterAbandon = await urls();
  check('B: closing mid-run minted no URL', afterAbandon.created.length === afterReplace.created.length, afterAbandon);
  check('B: panel gone after close', (await panelCount()) === 0, await panelCount());

  // C: close a finished panel.
  await inject();
  await pickFile('web-backup.bin');
  await waitDone();
  const beforeClose = await urls();
  await panel().getByRole('button', { name: '닫기' }).click();
  const afterClose = await urls();
  const last = beforeClose.created[beforeClose.created.length - 1];
  check('C: closing a finished panel revoked its URL', afterClose.revoked.includes(last), afterClose);
  check('C: every created URL is revoked', afterClose.created.every((made) => afterClose.revoked.includes(made)), afterClose);

  await shot(risu, 'lifecycle-end');
  for (const { name, ok } of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (checks.some((c) => !c.ok)) {
    console.log(JSON.stringify(checks.filter((c) => !c.ok), null, 2));
    process.exitCode = 1;
  }
}
