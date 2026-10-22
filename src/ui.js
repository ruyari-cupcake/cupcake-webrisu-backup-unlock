// On-page panel for the unlocker. Concatenated after core.js by scripts/build.cjs, so
// `RisuBackupUnlock` is in scope. Everything renders inside a shadow root so risuai.xyz styles
// cannot leak in, and running the bookmarklet again replaces the previous panel.
const RBU_VERSION = '__RBU_VERSION__';
const RBU_PANEL_ID = 'cupcake-risu-backup-unlock';
const RBU_LAUNCHER_ID = 'cupcake-risu-backup-unlock-launcher';
const RBU_PROGRESS_INTERVAL_MS = 200;
const RBU_PHASE_TEXT = {
  scan: '백업 파일 구조 확인 중…',
  key: '키 서버에서 이 백업의 키 받는 중…',
  decrypt: '데이터베이스 해독 중…',
  verify: '결과 파일 검증 중…',
};

const RBU_STYLE = `
  :host { all: initial; }
  .panel {
    position: fixed; z-index: 2147483647; top: 16px; right: 16px;
    width: min(420px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow: auto;
    box-sizing: border-box; padding: 16px; border-radius: 14px;
    background: #fffaf3; color: #3b2a1f; border: 1px solid #e8cfb4;
    box-shadow: 0 12px 32px rgba(59, 42, 31, 0.28);
    font: 14px/1.55 system-ui, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
  }
  .head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  h2 { margin: 0; font-size: 16px; }
  .version { font-size: 11px; color: #9a7b63; font-weight: normal; }
  button {
    font: inherit; cursor: pointer; border-radius: 10px; border: 1px solid #d9b896;
    background: #f5e3cf; color: #3b2a1f; padding: 8px 14px;
  }
  button:disabled { opacity: 0.5; cursor: default; }
  button.primary { background: #c8763b; border-color: #b0652f; color: #fff; }
  .close { padding: 2px 10px; background: transparent; border: none; font-size: 18px; }
  p { margin: 8px 0; }
  .warn { color: #a3402a; font-weight: 600; }
  .status { margin-top: 10px; white-space: pre-wrap; word-break: break-word; }
  .status.error { color: #a3402a; }
  .status.ok { color: #2f6b3a; }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
  .note { font-size: 12px; color: #7a5f4b; margin-top: 12px; }
`;

function rbuFormatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function openUnlockPanel() {
  // A panel owns its object URL and in-flight run; replacing it must release both, not just
  // detach the element (an older build without the hook is simply removed).
  const previous = document.getElementById(RBU_PANEL_ID);
  if (previous) {
    if (typeof previous.rbuDispose === 'function') previous.rbuDispose();
    else previous.remove();
  }
  const host = document.createElement('div');
  host.id = RBU_PANEL_ID;
  const root = host.attachShadow({ mode: 'open' });
  const onOfficialSite = /(^|\.)risuai\.xyz$/.test(location.hostname);
  root.innerHTML = `
    <style>${RBU_STYLE}</style>
    <div class="panel" role="dialog" aria-label="웹리스 백업 풀기">
      <div class="head">
        <h2>🧁 웹리스 백업 풀기 <span class="version">v${RBU_VERSION}</span></h2>
        <button class="close" type="button" aria-label="닫기">✕</button>
      </div>
      <p>risuai.xyz의 <b>설정 → 계정 &amp; 파일 → 로컬 백업 저장</b>으로 받은 전체 백업(.bin)을 골라 주세요.
        암호화를 풀어서 로컬리스·노드리스·포크 리스에서 그대로 불러올 수 있는 백업으로 바꿔 드려요.</p>
      ${onOfficialSite ? '' : '<p class="warn">⚠ 지금 페이지는 risuai.xyz가 아니에요. 키 서버가 거절할 수 있으니 risuai.xyz에서 실행해 주세요.</p>'}
      <input class="file" type="file" accept=".bin" hidden>
      <div class="actions">
        <button class="pick primary" type="button">백업 파일 고르기</button>
        <button class="save" type="button" hidden>⬇ 풀린 백업 저장하기</button>
      </div>
      <div class="status" role="status" aria-live="polite"></div>
      <p class="note">원본 파일은 바뀌지 않아요. 단, 결과 파일은 원본을 이어 붙여 만들기 때문에
        저장이 끝날 때까지 원본을 옮기거나 지우지 마세요. 파일 내용은 이 브라우저 밖으로 나가지 않고,
        키 서버에는 리스와 똑같이 백업 시각만 보내요.</p>
    </div>`;
  document.body.appendChild(host);

  const input = root.querySelector('.file');
  const pick = root.querySelector('.pick');
  const save = root.querySelector('.save');
  const status = root.querySelector('.status');
  let objectUrl = null;
  let outputName = '';
  // AbortController of the in-flight run, if any.
  let running = null;
  let disposed = false;

  const setStatus = (text, tone = '') => {
    status.textContent = text;
    status.className = `status ${tone}`;
  };
  const releaseOutput = () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
    save.hidden = true;
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (running) running.abort();
    releaseOutput();
    host.remove();
  };
  host.rbuDispose = dispose;

  root.querySelector('.close').addEventListener('click', dispose);
  pick.addEventListener('click', () => input.click());
  save.addEventListener('click', () => {
    if (!objectUrl) return;
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = outputName;
    root.appendChild(link);
    link.click();
    link.remove();
  });

  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    releaseOutput();
    pick.disabled = true;
    const run = new AbortController();
    running = run;
    let lastProgressAt = 0;
    try {
      const result = await RisuBackupUnlock.unlockBackup(file, {
        signal: run.signal,
        onPhase: (phase) => setStatus(`${file.name} (${rbuFormatBytes(file.size)})\n${RBU_PHASE_TEXT[phase]}`),
        onScanProgress: (done, total, count) => {
          const now = Date.now();
          if (now - lastProgressAt < RBU_PROGRESS_INTERVAL_MS) return;
          lastProgressAt = now;
          setStatus(`${file.name}\n${RBU_PHASE_TEXT.scan} ${Math.floor((done / total) * 100)}% (${count}개 항목)`);
        },
      });
      // Closed or replaced while the last step ran: drop the result instead of minting a URL.
      if (run.signal.aborted) return;
      if (result.status === 'not-encrypted') {
        setStatus(`이 백업은 암호화되어 있지 않아요 (${result.entryCount}개 항목).\n그대로 다른 리스에서 불러오면 돼요.`, 'ok');
        return;
      }
      const { summary } = result;
      objectUrl = URL.createObjectURL(result.blob);
      outputName = RisuBackupUnlock.unlockedFileName(file.name);
      save.hidden = false;
      setStatus([
        '✅ 해독 완료!',
        `데이터베이스 ${rbuFormatBytes(summary.databaseBytes)} 해독, 에셋 등 ${summary.otherEntryCount}개 항목은 그대로 옮겼어요.`,
        `결과 파일: ${outputName} (${rbuFormatBytes(summary.outputBytes)})`,
        '"풀린 백업 저장하기"를 눌러 저장한 뒤, 옮길 리스의 설정 → 계정 & 파일 → "로컬 백업 불러오기"로 열어 주세요.',
      ].join('\n'), 'ok');
    } catch (error) {
      if (run.signal.aborted) return;
      const message = error instanceof RisuBackupUnlock.UnlockError
        ? error.message
        : `예상하지 못한 오류가 났어요: ${error && error.message ? error.message : error}`;
      setStatus(`❌ ${message}`, 'error');
    } finally {
      if (running === run) running = null;
      pick.disabled = false;
    }
  });
}

// Userscript entry: a small launcher button instead of opening the panel on every visit.
function mountUnlockLauncher() {
  if (document.getElementById(RBU_LAUNCHER_ID)) return;
  const host = document.createElement('div');
  host.id = RBU_LAUNCHER_ID;
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      :host { all: initial; }
      button {
        position: fixed; z-index: 2147483646; left: 12px; bottom: 12px;
        font: 12px/1 system-ui, sans-serif; padding: 6px 10px; border-radius: 999px; cursor: pointer;
        background: #fffaf3; color: #3b2a1f; border: 1px solid #e8cfb4; opacity: 0.55;
      }
      button:hover, button:focus-visible { opacity: 1; }
    </style>
    <button type="button" title="웹리스 백업 풀기">🧁 백업 풀기</button>`;
  root.querySelector('button').addEventListener('click', openUnlockPanel);
  document.body.appendChild(host);
}
