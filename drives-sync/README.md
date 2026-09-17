# Drives Sync

**주소: https://hongguqaz.github.io/Lobby/drives-sync/** (휴대폰·노트북 브라우저에서 열고, 홈 화면/앱으로 설치할 수 있습니다)

Google Drive, 비공개 `Drive` 저장소, 그리고 기기(휴대폰·노트북)의 폴더를 **한 방향으로, 추가만 하며** 동기화하는
작은 웹 앱(PWA)입니다. 서버가 없습니다. 브라우저가 Google Drive API와 GitHub API를 직접 호출하고,
토큰은 그 브라우저 안에만 저장됩니다. 저장소에 올라가는 것은 이 앱의 코드뿐입니다.

```
기능 1  Stock Matching       Google Drive(honggusangjoon@gmail.com) 내 드라이브 전체  ──▶  hongguqaz/Drive : fin-lab/FinResearchRaw/
기능 2  Flow Matching        이 기기의 폴더  ──▶  Google Drive · DrivesSync/<기기>/<폴더>  ──▶  같은 저장소 폴더의 DrivesSync/<기기>/<폴더>/
기능 3  Matching Automation  정해진 주기마다 기능 2를 자동 실행
```

- **삭제는 절대 반영하지 않습니다.** Drive나 기기에서 파일을 지워도 GitHub에 남습니다. 바뀐 파일은 같은 경로에 덮어씁니다.
- **브레이크.** 모든 실행은 직전에 사전 점검(0번 바)을 통과해야 합니다. 로그인이 없거나, **설정과 다른 Google/GitHub
  계정**이 로그인되어 있거나, 권한이나 대상 폴더가 없으면 아무것도 쓰지 않고 사유를 화면과 로그에 남깁니다.
  에이전트(`window.DrivesSync`, `agent/` CLI)가 실행해도 같은 브레이크가 걸립니다.
- 기본값은 위 그림과 같고, 모든 경로(계정, 원본 폴더, 저장소, 브랜치, 대상 폴더, Drive 경로)는 앱에서 바꿀 수 있습니다.
  브랜치를 비워 두면 저장소의 기본 브랜치를 씁니다.

## 처음 한 번 설정하기

준비물: Google 계정(`honggusangjoon@gmail.com`), GitHub 계정(`hongguqaz`), 그리고 아래 두 가지 열쇠.

### 1. Google OAuth 클라이언트 만들기 (Google Cloud Console)

1. https://console.cloud.google.com 에서 프로젝트를 하나 만듭니다(이름은 아무거나, 예: `drives-sync`).
2. **API 및 서비스 → 라이브러리**에서 **Google Drive API**를 찾아 *사용*을 누릅니다.
3. **API 및 서비스 → OAuth 동의 화면**: 사용자 유형 *외부*, 앱 이름 `Drives Sync`, 이메일 입력. **테스트 사용자**에
   `honggusangjoon@gmail.com`을 추가합니다(게시하지 않고 테스트 상태로 둡니다).
4. **API 및 서비스 → 사용자 인증 정보 → 사용자 인증 정보 만들기 → OAuth 클라이언트 ID**
   - 애플리케이션 유형: **웹 애플리케이션**
   - 승인된 JavaScript 원본: `https://hongguqaz.github.io`
   - 승인된 리디렉션 URI: `https://hongguqaz.github.io/Lobby/drives-sync/` (장기 인증용),
     그리고 CLI를 쓸 계획이면 `http://localhost:53682/` 도 추가
   - 만들기 → **클라이언트 ID**(`….apps.googleusercontent.com`)와 **클라이언트 보안 비밀**을 복사해 둡니다.
5. 앱의 **⚙ 설정** 바에 클라이언트 ID를 붙여 넣습니다. 보안 비밀은 장기 인증(기능 3의 무인 실행)이나 CLI를 쓸 때만 필요합니다.

첫 로그인 때 "Google에서 확인하지 않은 앱" 화면이 나오면 *고급 → Drives Sync(안전하지 않음)으로 이동*을 누르세요.
본인만 쓰는 테스트 상태의 앱이라 나오는 경고입니다. 권한은 "Google Drive의 모든 파일 보기, 수정, 생성, 삭제"를
요청하는데, 기능 2가 Drive에 업로드하려면 필요합니다. 앱은 삭제 기능을 쓰지 않습니다.

### 2. GitHub 토큰 만들기

1. GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token.
2. Repository access: *Only select repositories* → **Drive**.
3. Permissions → Repository permissions → **Contents: Read and write** (Metadata는 자동으로 Read).
4. 만료 기간을 정하고 생성한 뒤 토큰(`github_pat_…`)을 복사합니다.
5. 앱의 **0번 바**에 붙여 넣고 *저장*을 누릅니다.

### 3. 연결하고 점검하기

0번 바에서 **Google Drive 연결**(계정 선택 → 권한 승인) → **사전 점검 실행**. 열 개 항목이 모두 ✓이면 준비 끝입니다.
대상 폴더 `fin-lab/FinResearchRaw`는 이미 저장소에 있습니다. 다른 경로로 바꿨는데 폴더가 없으면 점검이 멈추고
*대상 폴더 만들기* 버튼이 나타납니다.

토큰은 **기기(브라우저)마다** 따로 저장되므로 휴대폰과 노트북 각각에서 한 번씩 연결합니다.

### 4. 기기에 설치하기

| 기기 | 설치 | 기능 2 폴더 접근 | 기능 3 |
|---|---|---|---|
| 노트북 Chrome / Edge | 주소창 오른쪽 설치 아이콘 또는 앱 상단 *앱으로 설치* | **지속 접근**: 폴더를 한 번 고르면 계속 사용 | 가능 (창이 열려 있는 동안) |
| Android Chrome | 메뉴 ⋮ → *홈 화면에 추가* | 실행할 때마다 폴더 선택 | 불가 (폴더 지속 접근 미지원) |
| iPhone / iPad Safari | 공유 → *홈 화면에 추가* | 실행할 때마다 파일 선택 | 불가 |

## 기능 1 · Stock Matching (드라이브 간 동기화)

*동기화 실행*을 누르면 Drive 전체 목록을 읽고, 장부(`fin-lab/FinResearchRaw/.drives-sync/manifest.json`)와 비교해
새 파일과 바뀐 파일만 내려받아 GitHub에 커밋합니다(20개 또는 48 MB마다 커밋 하나, 설정 가능). *미리 보기*는 무엇을
올릴지 목록만 보여 주고 아무것도 쓰지 않습니다.

- 폴더 구조를 그대로 옮깁니다. git과 Windows가 허용하지 않는 문자(`\ / : * ? " < > |`)는 `_`로 바꾸고, 같은 이름의
  파일이 같은 폴더에 둘 있으면 뒤의 것에 `[파일ID 끝 6자리]`를 붙입니다.
- 변경 감지: 일반 파일은 Drive의 MD5, Google 문서류는 수정 시각. Drive에서 이름을 바꾸거나 옮기면 새 경로에 다시
  올리고 예전 파일은 그대로 둡니다.
- Google 문서·시트·슬라이드·드로잉은 내보내기(기본 `.docx` `.xlsx` `.pptx` `.png`, Markdown·PDF 등으로 변경 가능)로
  저장합니다. 내보내기는 10 MB까지입니다. 폼·사이트·지도·바로가기는 건너뜁니다.
- 100 MB가 넘는 파일은 GitHub이 받지 않아 건너뛰고 로그에 남깁니다.
- 원본을 내 드라이브 전체가 아닌 특정 폴더로 바꾸려면 Drive 폴더 URL의 `…/folders/<ID>` 부분을 *Drive 원본 폴더 ID*에
  넣습니다. 대상 저장소·브랜치·폴더도 0번 바에서 바꿉니다.

## 기능 2 · Flow Matching (드라이브 업로드 간 동기화)

*폴더 추가*로 이 기기의 폴더를 지정합니다(여러 개 가능, 병렬 업로드). 실행하면 각 폴더의 새 파일만 Google Drive의
`DrivesSync/<기기 이름>/<폴더 라벨>/`(원본 폴더 기준, 폴더마다 경로 변경 가능)에 올린 뒤 **곧바로** GitHub의 같은 상대
경로에 커밋합니다.

- "새 파일"은 장부에 없는 파일, 또는 크기나 수정 시각이 달라진 파일입니다. 지난 실행 이후 폴더에 쌓인 것만 올라갑니다.
  `.DS_Store`, `Thumbs.db`, `~$…`, `.tmp`, `.crdownload` 같은 임시 파일은 건너뜁니다.
- 기기에서 파일을 지워도 Drive와 GitHub의 파일은 지우지 않습니다. 목록에서 폴더를 *제외*해도 마찬가지입니다.
- 지속 접근 방식(노트북)은 브라우저를 다시 열면 *권한 승인* 한 번을 요구할 수 있습니다. Chrome 설정에서 "이 사이트에
  항상 허용"을 고르면 이후에는 묻지 않습니다.
- 실행 시 선택 방식(휴대폰)은 *폴더 선택 후 업로드*를 눌러 폴더(또는 파일들)를 고를 때마다 실행됩니다. 이미 올린 파일은
  건너뜁니다.
- 기능 2로 올린 파일은 장부에 함께 기록되므로 기능 1이 다시 올리지 않습니다.

## 기능 3 · Matching Automation

*자동 실행*을 켜면 즉시 한 번, 그 뒤 주기(기본 30분)마다 기능 2를 실행합니다. 켤 때와 매 실행 전에 선결 조건을 다시
점검하며, 하나라도 빠지면 **실행하지 않고** 사유를 자동화 로그·배너·알림(켠 경우)에 남깁니다.

선결 조건: 사전 점검 10개 항목 통과, Drive 쓰기 권한, 지정된 폴더가 1개 이상, 모든 폴더가 *지속 접근* 방식이고 권한이
승인된 상태, 주기가 1분 이상. 로그인 문제(토큰 만료, 다른 계정)로 멈추면 자동화를 끄고 알립니다. 그 밖의 문제는 다음
주기에 다시 시도합니다.

한계: 브라우저 앱이므로 **페이지(설치한 앱 창)가 열려 있는 동안만** 돌아갑니다. 창을 닫거나 기기가 잠들면 멈추고, 다시
열면 밀린 실행을 바로 처리합니다. *화면 켜짐 유지*를 켜면 노트북이 잠들지 않게 요청합니다. 기본 Google 로그인은
1시간짜리 토큰이라 갱신을 조용히 시도하지만 브라우저가 팝업을 막으면 실패할 수 있습니다. 하루 이상 무인으로 돌리려면
**⚙ 설정 → 장기 인증 시작**으로 refresh token을 받아 두세요(클라이언트 보안 비밀 필요, 테스트 상태 프로젝트는 7일마다
재인증).

## 사전 점검(브레이크) 항목

| 항목 | 실패하면 |
|---|---|
| Google Drive 로그인 | 토큰이 없거나 갱신 실패. *Google Drive 연결*로 로그인 |
| Google 계정 일치 | 설정한 계정(`honggusangjoon@gmail.com`)이 아닌 계정이 로그인됨. 연결 해제 후 올바른 계정으로 |
| Drive 읽기/쓰기 권한 | 권한 승인 화면에서 Drive 권한을 빼고 승인함. 다시 연결 |
| Drive 원본 폴더 | 폴더 ID가 틀렸거나 접근 불가 |
| GitHub 로그인 | 토큰이 없음 |
| GitHub 계정 일치 | 설정한 계정(`hongguqaz`)이 아닌 계정의 토큰 |
| GitHub 저장소 | 저장소가 없거나 토큰의 접근 범위 밖 |
| GitHub 쓰기 권한 | 토큰에 Contents: Read and write가 없음 |
| GitHub 브랜치 / 대상 폴더 | 브랜치가 없거나 대상 폴더가 없음(*대상 폴더 만들기* 버튼) |

## 에이전트가 쓰는 법

- 브라우저 안: `window.DrivesSync` (A 바에 요약). `preflight()`, `runStock()`, `runFlow()`, `automation.enable()` 등이
  결과 JSON을 돌려주고, 브레이크에 걸리면 `{ ok:false, braked:true, reasons:[…] }`를 줍니다.
  `<body data-state>`와 `<pre id="agent-state">`로 현재 상태를 읽을 수 있습니다.
- 명령줄: `agent/drives-sync-cli.mjs` (Node 18+). 같은 엔진, 같은 브레이크, 종료 코드 `2` = 브레이크. 자세한 사용법은
  [`agent/README.md`](agent/README.md).
- GitHub Actions: Drive 저장소의 `.github/workflows/drives-sync-stock.yml`이 CLI로 기능 1을 실행합니다(수동 실행, 비밀 필요).

## 보안과 저장 위치

토큰과 설정은 이 브라우저의 `localStorage`, 폴더 접근 권한은 IndexedDB에만 저장됩니다. 저장소나 서버로 전송되지 않으며
*상태 JSON*과 로그에도 토큰은 들어가지 않습니다. 공용 기기에서는 사용 후 ⚙ 설정의 *이 기기의 앱 데이터 지우기*를 누르세요.
GitHub 토큰은 Drive 저장소 하나에만, Contents 권한만 주도록 만드는 것이 안전합니다.

## 문제 해결

- **로그인 팝업이 차단됨**: 주소창의 팝업 차단 아이콘에서 허용하고 다시 누릅니다.
- **"다른 Google 계정이 로그인되어 있습니다"**: 의도한 브레이크입니다. 연결 해제 후 계정 선택 화면에서 올바른 계정을 고르세요.
- **GitHub 쓰기 권한 실패(403)**: 토큰의 Repository access에 Drive가 포함되고 Contents가 Read and write인지 확인합니다.
- **토큰 만료(401)**: 새 토큰을 만들어 0번 바에 다시 저장합니다.
- **폴더 권한 재승인**: 브라우저 재시작 후에는 폴더 항목의 *권한 승인*을 한 번 누릅니다.
- **iPhone에서 폴더 선택이 안 됨**: *파일 선택* 버튼으로 여러 파일을 고르면 됩니다.
- 전부 다시 올리고 싶을 때: ⚙ 설정 → *매니페스트 초기화*. 같은 경로에 덮어쓰며 삭제하지 않습니다.

## 개발

| 파일 | 역할 |
|---|---|
| `index.html`, `drives-sync.css` | 화면. 기능별 바(0 사전 점검, 1, 2, 3, A 에이전트, ⚙ 설정). 색은 `../assets/tokens.css` |
| `core.js` | 엔진: Drive·GitHub 클라이언트, 사전 점검, Stock/Flow 동기화, 장부. 브라우저와 Node에서 같은 코드 |
| `app.js` | 화면 연결, Google 로그인(GIS 토큰 + 선택적 refresh token), 폴더 핸들, 자동화 타이머, `window.DrivesSync` |
| `sw.js`, `manifest.webmanifest`, `assets/` | 설치·오프라인 셸. 배포 시 `sw.js`의 `VERSION`을 올리세요 |
| `agent/drives-sync-cli.mjs` | 에이전트용 명령줄 |
| `agent/test-core.mjs`, `agent/test-ui.mjs`, `agent/test-fakes.mjs` | 가짜 Drive/GitHub API로 엔진과 화면을 검증 |

```bash
node drives-sync/agent/test-core.mjs                       # 엔진 테스트
PLAYWRIGHT_MODULE=$(npm root -g)/playwright node drives-sync/agent/test-ui.mjs   # 화면 테스트 (Chromium)
python3 -m http.server 8000                                # 로컬 실행: http://localhost:8000/drives-sync/
```

로컬에서 Google 로그인까지 시험하려면 `http://localhost:8000`을 승인된 JavaScript 원본에 추가하면 됩니다.
