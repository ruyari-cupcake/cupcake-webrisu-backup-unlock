# 🧁 웹리스 백업 풀기 (risu-backup-unlock)

risuai.xyz(웹리스)의 **전체 백업(.bin)** 을 로컬리스·노드리스·포크 리스에서 불러올 수 있는
일반 백업으로 바꿔 주는 북마클릿 / 유저스크립트입니다.

## 왜 필요한가

- 순정 RisuAI v2026.10.210부터 risuai.xyz에서 **로컬 백업 저장**을 하면, 계정 연동을 하지 않았어도
  `database.risudat`가 항상 암호화됩니다 (dae3f650에서 `forageStorage.isAccount &&` 조건이 빠짐,
  upstream 이슈 #1681).
- 복원할 때 리스는 `https://sv.risuai.xyz/cryptokey?key=<백업 시각>`에서 키를 받는데, 이 키 서버는
  **risuai.xyz 페이지에서 온 요청만** 받습니다. 그래서 다른 리스에서는 403이 나고 불러오기가 실패합니다
  (순정 로컬 빌드에서 실측: `unexpected EOF` 오류, 캐릭터 없음).
- 키는 로그인과 무관하게 **백업 시각마다 정해진 값**이라, risuai.xyz 탭 안에서는 언제든 다시 받을 수 있습니다.

## 하는 일

1. 백업 파일의 항목 머리말만 읽어 구조를 확인합니다 (에셋 본문은 메모리에 올리지 않음).
2. `encryption.risudat`에서 백업 시각을 읽고, risuai.xyz 페이지 안에서 키를 받습니다.
3. `database.risudat` 하나만 해독합니다 (AES-GCM, 키 = 키 문자열의 SHA-256, IV 0).
4. `encryption.risudat`를 빼고, 해독한 DB와 **나머지 항목은 바이트 그대로** 이어 붙여 `…-unlocked.bin`을 만듭니다.
5. 만든 파일을 다시 읽어 항목 이름·크기가 계획과 같은지 검증한 뒤에만 저장 버튼을 보여 줍니다.

원본 파일은 바뀌지 않습니다. 파일 내용은 브라우저 밖으로 나가지 않고, 키 서버에는 리스 자신과 똑같이
백업 시각만 보냅니다. 암호화되지 않은 백업을 넣으면 "암호화되어 있지 않아요"라고 알려 주고 아무것도 만들지 않습니다.

## 사용법

`npm run build` 결과물이 `dist/`에 있습니다. 설치 안내 페이지는 `dist/install.html`입니다.

| 형태 | 파일 | 쓰는 법 |
|---|---|---|
| 북마클릿 (PC·모바일) | `dist/bookmarklet.txt` | 북마크 주소로 저장 → risuai.xyz 탭에서 실행 |
| 유저스크립트 | `dist/risu-backup-unlock.user.js` | 탬퍼몽키 등에 설치 → risuai.xyz 왼쪽 아래 **🧁 백업 풀기** |
| 콘솔 | `dist/console.js` | risuai.xyz 탭의 개발자 도구 콘솔에 붙여넣기 |

1. risuai.xyz → **설정 → 계정 & 파일 → 로컬 백업 저장**으로 전체 백업을 받습니다.
2. **risuai.xyz 탭에서** 도구를 실행하고 **백업 파일 고르기** → **풀린 백업 저장하기**.
3. 옮길 리스에서 **설정 → 계정 & 파일 → 로컬 백업 불러오기**로 `…-unlocked.bin`을 엽니다.

## 한계

- **임시 방편입니다.** 키 서버가 인증을 요구하도록 바뀌면 이 도구는 동작하지 않습니다. 근본 해결은 upstream #1681입니다.
- 계정 연동 상태로 만든 백업은 기본 설정(`skipSavingAssetsOnWebSync`)상 에셋이 빠져 있을 수 있고, 이 도구가 에셋을 만들어 낼 수는 없습니다.
- 데스크톱(Tauri) 앱 자체는 실행해 보지 않았습니다. 복원 경로(`LoadLocalBackup`)의 파싱·해독 분기는 웹 빌드와
  같은 코드이고, 저장 위치만 다릅니다.

## 개발

```bash
npm test          # 단위 테스트 (node:test, 의존성 없음)
npm run build     # dist/ 생성
```

- `src/core.js` — DOM 없는 핵심 로직 (스캔, 키 요청, 해독, 재조립, 검증). Node 테스트와 브라우저가 같은 코드를 씁니다.
- `src/ui.js` — risuai.xyz 위에 띄우는 패널 (shadow DOM).
- `tests/core.test.cjs` — 암호화는 `node:crypto`로 따로 만들어 도구의 WebCrypto 경로와 대칭으로 통과하지 않게 했습니다.
- `tests/live/` — 실제 risuai.xyz 내보내기 → 도구 → 순정 Risu 복원까지의 라이브 E2E (`README` 참고).
