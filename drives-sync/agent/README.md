# Drives Sync — 에이전트용 인터페이스

에이전트(Claude Code, 스크립트, 자동화 도구)가 Drives Sync를 실행하는 두 가지 길입니다. 둘 다 웹 앱과 **같은 엔진
(`../core.js`)과 같은 브레이크**를 씁니다. 사전 점검에 실패하면 아무것도 쓰지 않고 사유를 돌려줍니다.

## 1. 명령줄 `drives-sync-cli.mjs` (Node 18+)

```bash
cd drives-sync/agent
node drives-sync-cli.mjs preflight --json
node drives-sync-cli.mjs stock [--dry-run] [--json]
node drives-sync-cli.mjs flow --folder "스캔=/home/me/scans" --folder "메모=/home/me/notes" [--dry-run] [--json]
node drives-sync-cli.mjs status --json
node drives-sync-cli.mjs auth [--port 53682]      # Google refresh token 받기 (한 번)
```

| 종료 코드 | 뜻 |
|---|---|
| `0` | 완료 (dry run 포함) |
| `2` | **브레이크**: 사전 점검 실패, 쓰지 않음. `--json` 출력의 `reasons[]`에 사유 |
| `1` | 실행 중 오류 |
| `3` | 사용법 오류 |

`--json`을 주면 결과 JSON만 표준 출력으로, 로그는 표준 오류로 나갑니다.

### 환경 변수

| 변수 | 내용 |
|---|---|
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | 웹 앱 README의 OAuth 클라이언트 |
| `GOOGLE_REFRESH_TOKEN` | `auth` 명령으로 받은 값. 없으면 `GOOGLE_ACCESS_TOKEN`(1시간짜리)을 대신 씀 |
| `GITHUB_TOKEN` | Drive 저장소에 Contents: Read and write 권한이 있는 fine-grained 토큰 |
| `DRIVES_SYNC_CONFIG` | 설정 JSON 경로 (기본 `./drives-sync.config.json`, 없으면 기본값) |
| `DRIVES_SYNC_DEVICE` | 장부에 기록될 기기 이름 (기본 `CLI <호스트명>`) |
| `DRIVES_SYNC_EXPECTED_EMAIL` | 동기화 계정 (기본 설정: `honggusangjoon@gmail.com`) |

### 설정 JSON (선택)

웹 앱의 *설정 내보내기*와 같은 모양입니다. `folders[].path`는 CLI에서만 씁니다.

```json
{
  "config": {
    "google": { "expectedEmail": "honggusangjoon@gmail.com", "sourceFolderId": "root",
                "exports": { "document": "docx", "spreadsheet": "xlsx", "presentation": "pptx" } },
    "github": { "owner": "hongguqaz", "repo": "Drive", "branch": "", "targetPath": "fin-lab/FinResearchRaw", "expectedLogin": "hongguqaz" },
    "device": { "id": "cli-office", "name": "사무실 PC" }
  },
  "folders": [ { "label": "스캔", "path": "/home/me/scans", "driveSubPath": "" } ]
}
```

### refresh token 받기

Google Cloud의 OAuth 클라이언트에 리디렉션 URI `http://localhost:53682/`가 등록되어 있어야 합니다.

```bash
GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... node drives-sync-cli.mjs auth
```

출력된 주소를 브라우저에서 열어 `honggusangjoon@gmail.com`으로 승인하면 refresh token이 출력됩니다. 이 값을
`GOOGLE_REFRESH_TOKEN` 환경 변수나 GitHub Actions 비밀로 저장합니다. 프로젝트가 "테스트" 상태이면 7일 뒤 만료됩니다.

### GitHub Actions에서

Drive 저장소의 `.github/workflows/drives-sync-stock.yml`이 이 CLI로 기능 1(Stock Matching)을 실행합니다. Actions 탭에서
수동으로 실행하고, 무인 실행이 필요하면 파일 안의 `schedule` 주석을 풉니다. 기능 2는 기기의 폴더가 필요하므로 Actions에서
실행할 수 없습니다.

## 2. 브라우저 안 `window.DrivesSync`

앱 페이지(https://hongguqaz.github.io/Lobby/drives-sync/)를 연 브라우저(Playwright 등)에서:

```js
await DrivesSync.preflight()                        // { ok, reasons[], checks[] }
await DrivesSync.runStock({ dryRun: false })        // 결과 또는 { ok:false, braked:true, reasons[] }
await DrivesSync.folders.add({ label: '스캔', mode: 'oneshot' })   // 지속 접근(handle)은 사용자 동작이 필요
await DrivesSync.runFlow({ folderIds: [...] })      // 준비된(권한 있는) 폴더만 실행
await DrivesSync.automation.enable({ intervalMinutes: 30 })       // 선결 조건 미충족이면 { ok:false, reasons[] }
DrivesSync.automation.status(); DrivesSync.automation.disable()
DrivesSync.getState()                               // 토큰 없는 전체 상태 (설정, 폴더, 마지막 점검·실행, 자동화)
DrivesSync.config.set({ github: { targetPath: 'fin-lab/FinResearchRaw' } })
DrivesSync.tokens.setGitHub('github_pat_...')       // GitHub 토큰은 넣을 수 있음
DrivesSync.logs.get(200)
DrivesSync.on('log' | 'progress' | 'state', handler)
document.body.dataset.state                        // idle | running | braked | error
document.getElementById('agent-state').textContent // getState() JSON (화면에 항상 표시)
```

Google 로그인은 사용자 동작(팝업)이 필요하므로 에이전트가 대신 할 수 없습니다. 사람이 한 번 연결해 두거나 ⚙ 설정의
장기 인증을 켜 두면 에이전트는 그 토큰으로 실행합니다. 한 번에 한 작업만 실행되며, 실행 중 호출하면
`{ ok:false, busy:true }`를 돌려줍니다.

## 테스트

```bash
node test-core.mjs                                         # 엔진: 가짜 Drive/GitHub API로 브레이크·동기화 검증
PLAYWRIGHT_MODULE=$(npm root -g)/playwright node test-ui.mjs   # 화면: headless Chromium (Lobby 저장소 루트에서 실행)
```
