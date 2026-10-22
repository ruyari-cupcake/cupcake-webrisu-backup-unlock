# 🧁 컵케익 웹리스 백업 풀기 (cupcake-webrisu-backup-unlock)

risuai.xyz(웹리스)의 **전체 백업(.bin)** 을 로컬리스(데스크톱 앱)·노드리스·포크 리스에서 불러올 수 있는
일반 백업으로 바꿔 주는 북마클릿 / 유저스크립트입니다.

**👉 설치 안내: <https://ruyari-cupcake.github.io/cupcake-webrisu-backup-unlock/>**

## 왜 필요한가

- risuai.xyz는 **로컬 백업 저장** 때 `database.risudat`를 암호화합니다. 계정 연동(로그인) 상태의 백업은
  2026년 6월(d0548267)부터 암호화됐고, v2026.10.210부터는 연동하지 않아도 **항상** 암호화됩니다
  (dae3f650에서 `forageStorage.isAccount &&` 조건이 빠짐, upstream 이슈 #1681).
- 복원할 때 리스는 `https://sv.risuai.xyz/cryptokey?key=<백업 시각>`에서 키를 받는데, 이 키 서버는
  **risuai.xyz 페이지에서 온 요청만** 받습니다. 그래서 다른 리스에서는 403이 나고 불러오기가 실패합니다
  (순정 빌드에서 실측: `unexpected EOF` 오류, 캐릭터 없음).
- 키는 로그인과 무관하게 **백업 시각마다 정해진 값**이라, risuai.xyz 탭 안에서는 언제든 다시 받을 수 있습니다.
- upstream이 #1681을 고쳐도 **그 전에 만든 백업은 계속 암호화된 상태**라 이 도구가 필요합니다.
  새로 만드는 백업이 암호화되지 않게 되면, 그 백업에는 도구가 필요 없습니다.

## 하는 일

1. 백업 파일의 항목 머리말만 읽어 구조를 확인합니다 (에셋 본문은 메모리에 올리지 않음).
2. `encryption.risudat`에서 백업 시각을 읽고, risuai.xyz 페이지 안에서 키를 받습니다.
3. `database.risudat` 하나만 해독합니다 (AES-GCM, 키 = 키 문자열의 SHA-256, IV 0).
4. `encryption.risudat`를 빼고, 해독한 DB와 **나머지 항목(에셋·콜드 스토리지 등)은 바이트 그대로** 이어 붙여
   `…-unlocked.bin`을 만듭니다.
5. 만든 파일을 다시 읽어 항목 이름·크기가 계획과 같은지 검증한 뒤에만 저장 버튼을 보여 줍니다.

원본 파일은 바뀌지 않습니다. 결과 파일은 원본을 이어 붙여 만들기 때문에 **저장이 끝날 때까지 원본을 옮기거나
지우지 마세요.** 파일 내용은 브라우저 밖으로 나가지 않고, 키 서버에는 리스 자신과 똑같이 백업 시각만 보냅니다.
암호화되지 않은 백업을 넣으면 "암호화되어 있지 않아요"라고 알려 주고 아무것도 만들지 않습니다.

## 사용법

설치 안내 페이지([온라인](https://ruyari-cupcake.github.io/cupcake-webrisu-backup-unlock/), `dist/install.html`)에
북마클릿 버튼·코드 복사·유저스크립트 링크가 모두 있습니다. 빌드 결과물은 `dist/`에 커밋되어 있습니다.

| 형태 | 파일 | 쓰는 법 |
|---|---|---|
| **로더 북마클릿 (모바일 권장, PC도 가능)** | `dist/loader-bookmarklet.txt` (251자) | 북마크 주소로 저장 → risuai.xyz 탭에서 실행. 실행할 때 GitHub Pages의 `dist/console.js`를 불러옴 (인터넷 필요, 항상 최신) |
| 전체 북마클릿 (PC) | `dist/bookmarklet.txt` (약 32 KB) | 북마크바로 끌어다 놓기 → risuai.xyz 탭에서 실행. 도구 전체가 들어 있어 외부에서 아무것도 불러오지 않음. 폰에서는 붙여넣다 잘려 `SyntaxError`가 날 수 있음 |
| 유저스크립트 | [`dist/cupcake-webrisu-backup-unlock.user.js`](https://raw.githubusercontent.com/ruyari-cupcake/cupcake-webrisu-backup-unlock/main/dist/cupcake-webrisu-backup-unlock.user.js) | 탬퍼몽키 등에 설치 → risuai.xyz 왼쪽 아래 **🧁 백업 풀기** |
| 콘솔 | `dist/console.js` | risuai.xyz 탭의 개발자 도구 콘솔에 붙여넣기 |

1. risuai.xyz → **설정 → 계정 & 파일 → 로컬 백업 저장**으로 전체 백업을 받습니다.
2. **risuai.xyz 탭에서** 도구를 실행하고 **백업 파일 고르기** → **풀린 백업 저장하기**.
3. 옮길 리스에서 **설정 → 계정 & 파일 → 로컬 백업 불러오기**로 `…-unlocked.bin`을 엽니다.

- **PC 권장:** DB 해독에 DB 크기의 약 3.5~4배 메모리가 듭니다 (아래 실측). 데스크톱 앱으로 옮길 거라면
  PC에서 바로 하는 게 파일 옮기기도 간단합니다.
- 이미 원본 백업을 불러오다 `unexpected EOF` 같은 오류를 봤다면, 순정 리스는 오류 전에 에셋만 먼저 저장해 둔
  상태입니다. 그대로 풀린 백업을 다시 불러오면 정상 복원됩니다.
- 도구 없이 할 수 있는 길: **부분 로컬 백업 저장(캐릭터 에셋 제외)** 은 암호화되지 않습니다. 대신 감정 이미지·
  추가 에셋 등 캐릭터 에셋이 빠집니다.

## 검증 (2026-10-22, 순정 v2026.10.211)

아래 수치는 모두 최종 빌드로 `tests/live/run-all.sh` 한 번에 잰 값입니다 (헤드리스 크로미움, 메모리 상한 8G).

- 단위·번들 테스트 18개 (`npm test`), 뮤테이션 8개 전부 검출 (`npm run mutate`).
- 실제 risuai.xyz에서 로그인 없이 내보낸 백업(에셋 20개)을 risuai.xyz에서 북마클릿·`javascript:` 주소·
  유저스크립트로 풀었고, 결과가 바이트 단위로 같았습니다.
- 순정 Risu 웹 빌드(risuai.xyz가 아닌 주소)에 복원: **원본은 403 → `unexpected EOF`로 실패**, 풀린 백업은
  캐릭터·첫 메시지·에셋 20개가 정상 복원. 원본 불러오기에 한 번 실패한 상태에서 다시 불러와도 정상 복원.
- 패널 수명: 다시 실행(교체)·닫기 때 결과 URL이 모두 해제되고, 작업 중에 닫으면 결과를 만들지 않음
  (라이브 검사 7개; 수정 전 빌드에서는 3개 실패).
- **큰 DB** (메모리에 올라가는 유일한 부분; 진짜 키로 암호화한 합성 DB):

  | DB 크기 | 처리 시간 | 페이지(렌더러) 최대 메모리 | 브라우저 전체 | 결과 DB SHA-256 |
  |---|---|---|---|---|
  | 400 MiB | 5.4초 | 1,668 MiB | 2,368 MiB | 원본과 같음 |
  | 1 GiB | 9.5초 | 4,184 MiB | 4,848 MiB | 원본과 같음 |

  페이지 메모리 ≈ 기본 약 300 MiB + DB 크기의 3.5~4배. 1 GiB DB면 탭 하나가 4 GiB를 넘으므로 폰에서는
  부족할 가능성이 큽니다 (실기기 미확인).
- **에셋이 많은 백업:** 1.5 GiB(항목 1,558개, DB 10 KB)를 12초에 처리, 페이지 메모리 최대 310 MiB.
  결과 크기는 계산값(입력 − 81바이트)과 같았고, 에셋 영역 1,610,790,144바이트가 원본과 같았습니다.
  에셋은 원본 파일 조각을 그대로 이어 붙이므로 메모리는 에셋 총량이 아니라 **DB 크기**가 좌우합니다.

### 확인하지 못한 것

- 데스크톱(Tauri) 앱 자체. 복원 경로(`LoadLocalBackup`)의 파싱·해독 분기는 웹 빌드와 같은 코드이고,
  저장 위치만 다릅니다. 백업 DB는 원격 블록 없이 자체 완결(`remote: false`)이라 앱 쪽 별도 파일 조회도 없습니다.
- 실제 안드로이드 크롬·iOS Safari·파이어폭스 (모바일은 크롬 화면 크기 에뮬레이션만), 북마크바로 끌어다 놓기.
- 콜드 스토리지·플러그인 저장소가 실제로 들어 있는 백업의 복원 (도구는 이 항목들을 바이트 그대로 복사합니다).

## 한계

- **임시 방편입니다.** 키 서버가 인증을 요구하거나 risuai.xyz가 보안 정책(CSP)을 강화하면 동작하지 않을 수 있습니다.
- 계정 연동 상태로 만든 백업은 기본 설정(`skipSavingAssetsOnWebSync`)상 에셋이 빠져 있을 수 있고, 이 도구가 에셋을 만들어 낼 수는 없습니다.

## 개발

```bash
npm test          # 단위·번들 테스트 (node:test, 의존성 없음)
npm run mutate    # 뮤테이션 검사 — 전부 KILLED여야 함
npm run build     # dist/ 생성
```

- `src/core.js` — DOM 없는 핵심 로직 (스캔, 키 요청, 해독, 재조립, 검증, 취소). Node 테스트와 브라우저가 같은 코드를 씁니다.
- `src/ui.js` — risuai.xyz 위에 띄우는 패널 (shadow DOM). 줄 끝 주석 금지: 북마클릿이 줄바꿈을 잃어도 동작해야 합니다 (`tests/bundle.test.cjs`).
- `tests/core.test.cjs` — 암호화는 `node:crypto`로 따로 만들어 도구의 WebCrypto 경로와 대칭으로 통과하지 않게 했습니다.
- `tests/live/` — 실제 risuai.xyz 내보내기 → 도구 → 순정 Risu 복원, 패널 수명, 큰 DB·많은 에셋 실측
  (`tests/live/README.md`; Playwright 필요 — `PLAYWRIGHT_MODULE`로 기존 설치를 가리키거나 `npm i -D playwright`).
- 리뷰 기록 → `.report/acceptance-2026-10-22.md`.

## 라이선스

[MIT](LICENSE) © 2026 Ruyari Cupcake
