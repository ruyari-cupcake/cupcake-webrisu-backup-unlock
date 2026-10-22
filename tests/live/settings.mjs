// Navigate to Settings -> Account & Files, where stock Risu keeps the local backup buttons.
import { visibleButtons } from './step-explore.mjs';

export async function openAccountAndFiles(risu) {
  await risu.mouse.click(40, 23); // sidebar menu
  await risu.waitForTimeout(1200);
  await risu.mouse.click(40, 84); // gear
  await risu.waitForTimeout(1500);
  await risu.getByRole('button', { name: 'Account & Files' }).click();
  await risu.waitForTimeout(1500);
  return visibleButtons(risu);
}
