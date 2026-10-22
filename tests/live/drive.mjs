// Live E2E driver: real risuai.xyz export -> unlock tool on risuai.xyz -> restore into stock Risu.
// Usage: node drive.mjs <venue: web|stock> <step>   (one persistent profile per venue under work/)
// Steps live in step-<name>.mjs; artifacts (backups, screenshots, results) go to work/.
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('/home/cupcake/workspace/cupcake/Playwright/workspace/node_modules/playwright');
const LIVE = new URL('.', import.meta.url).pathname;
const WORK = join(LIVE, 'work');
const VENUES = { web: 'https://risuai.xyz/', stock: process.env.STOCK_URL || 'http://127.0.0.1:6420/' };
const [venue, step] = process.argv.slice(2);
if (!VENUES[venue] || !step) throw new Error('usage: node drive.mjs <web|stock> <step>');

await mkdir(join(WORK, 'shots'), { recursive: true });
const profile = join(WORK, `profile-${process.env.PROFILE || venue}`);
// MOBILE=1 emulates a phone-sized touch screen to check the panel layout.
const device = process.env.MOBILE
  ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
  : { viewport: { width: 1400, height: 900 } };
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium', headless: true, acceptDownloads: true, ...device,
});
const logs = [];
const shot = (page, name) => page.screenshot({ path: join(WORK, 'shots', `${venue}-${name}.png`) });
try {
  const risu = context.pages()[0] || await context.newPage();
  risu.on('console', (m) => { if (m.type() === 'error') logs.push(`console: ${m.text().slice(0, 300)}`); });
  risu.on('dialog', (d) => { logs.push(`dialog: ${d.message()}`); d.accept(); });
  await risu.goto(VENUES[venue], { waitUntil: 'domcontentloaded', timeout: 60000 });
  await risu.waitForTimeout(6000);
  const mod = await import(join(LIVE, `step-${step}.mjs`));
  await mod.default({ context, risu, shot, logs, LIVE, WORK, venue });
} finally {
  if (logs.length) console.log('LOGS:\n' + logs.slice(-20).join('\n'));
  await context.close();
}
