// Playwright is not a dependency of this repo (the tool itself needs no install). Point
// PLAYWRIGHT_MODULE at an existing installation, or run `npm i -D playwright` here.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
export const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
