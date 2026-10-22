// Bundles src/core.js + src/ui.js into the three delivery forms (console paste, bookmarklet,
// userscript) plus an install page. No dependencies: plain concatenation inside one IIFE.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const STRIP_MARKER = '@strip-in-bundle';

function source(file) {
  return fs.readFileSync(path.join(ROOT, 'src', file), 'utf8')
    .split('\n')
    .filter((line) => !line.includes(STRIP_MARKER))
    .join('\n')
    .replaceAll('__RBU_VERSION__', version);
}

function bundle(entryCall) {
  return `(() => {\n${source('core.js')}\n${source('ui.js')}\n${entryCall}\n})();\n`;
}

const consoleBundle = bundle('openUnlockPanel();');
// Some bookmark managers flatten the URL to one line; with full-line comments gone (and no
// trailing ones in src), the body still parses when every newline is lost.
const bookmarkletBody = consoleBundle.split('\n').filter((line) => !/^\s*\/\//.test(line)).join('\n');
const bookmarklet = `javascript:${encodeURIComponent(bookmarkletBody)}`;
const userscript = `// ==UserScript==
// @name         🧁 웹리스 백업 풀기
// @namespace    cupcake.risu-backup-unlock
// @version      ${version}
// @description  risuai.xyz 전체 백업의 암호화를 풀어 로컬리스·노드리스·포크 리스에서 불러올 수 있게 바꿉니다.
// @match        https://risuai.xyz/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==
${bundle('mountUnlockLauncher();')}`;

const installPage = fs.readFileSync(path.join(ROOT, 'src', 'install.template.html'), 'utf8')
  .replaceAll('__RBU_VERSION__', version)
  .replaceAll('__RBU_BOOKMARKLET__', bookmarklet);

fs.mkdirSync(DIST, { recursive: true });
fs.writeFileSync(path.join(DIST, 'console.js'), consoleBundle);
fs.writeFileSync(path.join(DIST, 'bookmarklet.txt'), `${bookmarklet}\n`);
fs.writeFileSync(path.join(DIST, 'risu-backup-unlock.user.js'), userscript);
fs.writeFileSync(path.join(DIST, 'install.html'), installPage);
console.log(`built v${version}: console ${consoleBundle.length} B, bookmarklet ${bookmarklet.length} B, userscript ${userscript.length} B`);
