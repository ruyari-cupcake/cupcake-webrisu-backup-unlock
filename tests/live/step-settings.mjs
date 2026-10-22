// Exploration: list what Settings -> Account & Files offers.
import { openAccountAndFiles } from './settings.mjs';

export default async function ({ risu, shot }) {
  console.log('account & files:', JSON.stringify(await openAccountAndFiles(risu)));
  await shot(risu, 'settings-2');
}
