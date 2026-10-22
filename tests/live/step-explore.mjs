// Exploration helper: list visible buttons and save a screenshot of the current screen.
export const visibleButtons = (page) => page.evaluate(() => [...document.querySelectorAll('button, [role=button]')]
  .filter((el) => el.getBoundingClientRect().width > 0)
  .map((el) => {
    const r = el.getBoundingClientRect();
    const label = (el.innerText || el.getAttribute('aria-label') || el.title || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return `${label}@${Math.round(r.x)},${Math.round(r.y)}`;
  }));

export default async function ({ risu, shot }) {
  console.log('url:', risu.url());
  console.log('buttons:', JSON.stringify(await visibleButtons(risu)));
  console.log('text tail:', (await risu.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 600));
  await shot(risu, `explore-${Date.now()}`);
}
