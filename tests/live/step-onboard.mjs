// Walk the first-run screens: accept the terms, answer the name prompt, then prefer
// "set up myself / skip"-style choices until the main UI shows.
import { visibleButtons } from './step-explore.mjs';

const SKIP_LIKE = /myself|skip|건너|later|nothing|no thanks|already|i know|advanced/i;

async function clickByLabel(page, wanted) {
  return page.evaluate((label) => {
    const el = [...document.querySelectorAll('button, [role=button]')]
      .filter((b) => b.getBoundingClientRect().width > 0)
      .find((b) => (b.innerText || b.getAttribute('aria-label') || b.title || '').trim().replace(/\s+/g, ' ').slice(0, 40) === label);
    el?.click();
    return Boolean(el);
  }, wanted);
}

export default async function ({ risu, shot }) {
  for (let round = 0; round < 12; round += 1) {
    const labels = (await visibleButtons(risu)).map((b) => b.replace(/@[\d,-]+$/, ''));
    console.log(`round ${round}: ${JSON.stringify(labels)}`);
    if (labels.length > 8) break; // main UI reached
    if (labels.includes('Accept')) {
      await clickByLabel(risu, 'Accept');
    } else if (labels.some((l) => SKIP_LIKE.test(l))) {
      await clickByLabel(risu, labels.find((l) => SKIP_LIKE.test(l)));
    } else if (await risu.locator('input[type=text]:visible, textarea:visible').count()) {
      const box = risu.locator('input[type=text]:visible, textarea:visible').first();
      await box.fill('tester');
      if (labels.includes('Continue')) await clickByLabel(risu, 'Continue');
      else await box.press('Enter');
    } else if (labels.length) {
      const choice = labels.find((l) => l && !/go back|guide me/i.test(l)) || labels[0];
      await clickByLabel(risu, choice);
    } else break;
    await risu.waitForTimeout(2500);
    await shot(risu, `onboard-${round}`);
  }
  await shot(risu, 'onboard-end');
}
