# MCP W3·W4 구현 결과와 W5 검증 인계

2026-09-15 (Asia/Seoul). **W3·W4 구현 및 자동 검증 완료, 원래 대화 Codex 검토 대기.**
실제 Desktop/host/Windows의 W5는 미검증이며 전체 기능 검증 완료나 검증 생략 승인으로
표시하지 않는다. commit·push·merge·배포는 수행하지 않았다.

## 기준과 소유권

- 외부 checkout: `/Users/shock/workspace/mcp`, 브랜치 `main`.
- 시작/최종 HEAD: `8ad666e86780bc992f06a7dce73734dbb9ddcb04`, 패키지 `1.6.0`.
  시작 작업 트리는 깨끗했다. 변경은 미커밋 상태다.
- 본체 checkout: `/Users/shock/workspace/neosql`.
- 본체 검토 통과본: `2ffef514dbc56911df40a7c253b15fbb423f3ce5`.
- 착수 근거: 본체 `docs/plan/mcp-startup-progress/work-instructions/neosql-review.md`의
  최신 **W1·W2 검토 통과** 판정 및 `neosql-completion.md` 인계.
- 작업 중 확인한 본체 HEAD는 `4e2ac93ef3a61a912d5e929d32918a7244b8f20c`였다.
  runtime-status/server/renderer-bridge/method-timeouts 네 계약 파일은 검토 통과본과
  diff가 없었다. 본체에는 다른 작업의 미커밋 변경이 있으며 읽기 참조만 했다.
- 실행 환경: macOS (`darwin`, `arm64`), Node `v22.22.2`, Vitest `2.1.9`.
  테스트의 Windows 분기는 mock이며 Windows OS 실행 결과가 아니다.

## 구현과 계약 경계

| 위치 | 구현 근거 |
| --- | --- |
| `src/upstream/runtime-status.ts` | 본체 §4.1의 app/profile/Renderer/project 타입과 조합, 실패/조치 reason whitelist 검증 |
| `src/upstream/http-client.ts:57` | JSON-RPC envelope/ID 검증, 절대 요청 수명 timer, AbortSignal로 HTTP destroy, 응답 중단·늦은 결과 정리. ENOTSOCK는 명확한 오류 |
| `src/upstream/desktop-readiness.ts:59` | 내부 POST 조회, 20초 deadline, 조회 최대 1초·종료 후 0.5초 간격, 설치 후 재확인, 실행 1회, 이번 호출의 근거별 polling |
| `src/upstream/observation.ts` | 취소된 I/O의 결과 관찰 중단과 늦은 완료 폐기, 취소 가능한 대기 timer |
| `src/upstream/desktop-installation.ts` | 지원 경로/record/HKCU 유지, 미발견·조회 오류 구분, 다른 후보 성공 허용, 각 I/O에 취소 적용 |
| `src/upstream/desktop-installation.ts:356` | reg 실패 시 .NET OpenSubKey의 null로 키 부재 확인. probe 실패/불명확 응답은 조회 실패로 유지 |
| `src/upstream/mcp-config-record.ts` | 파일 부재·기존 invalid JSON fallback 유지, 권한 등 실제 조회 오류 전파 |
| `src/upstream/app-activation.ts:108` | spawn만으로 성공 처리하지 않고 exit 0/비정상 종료 관찰. 취소 시 관찰 listener 정리, 이미 시작한 앱 유지 |
| `src/mcp/server.ts` | SDK 요청 컨텍스트를 받는 readiness dependency 연결 |
| `src/mcp/tools/shared.ts:63` | 원 postRpc 이전에 준비 결과 처리. progressToken 0/문자열 유지, 영어 progress 증가, deadline/취소 재확인 후 원 작업 1회 |
| `src/mcp/tools/preparation-messages.ts` | HTML 영어 문구와 조치별 안내, 공개 준비 결과 네 필드, timeout의 마지막 관찰 단계 |

RPC는 기존 UDS/Named Pipe의 `POST /mcp/rpc`, method `get-runtime-status`, params `{}`다.
공개 tool·TCP endpoint·프로젝트 고정 인자는 추가하지 않았다. GET health는 준비 완료
근거에서 제거했다. 이전 호출의 준비 상태·기동 근거를 캐시하지 않는다.

- Renderer not_ready 또는 project loading, 이번 호출의 OS 실행 명령 성공이 재조회 근거다.
  근거 있는 연결 부재·HTTP/IPC timeout만 재조회한다. 명확한 오류는 즉시 종료한다.
- 최초 확인부터 설치·실행·조회·알림이 같은 20초를 사용한다. 현재 프로젝트가 바뀌어도
  기한을 초기화하지 않으며 매 조회의 현재 상태를 따른다.
- 비선택/인증/확정 실패/사용자 조치는 즉시 종료한다. 준비 실패는 isError=true 및
  content text JSON의 status/message/nextAction/requestSent=false 네 필드다.
- 원 작업 전송 후 오류는 기존 error/formatter 경로를 유지한다. 본체가 ready 조회 직후
  현재 프로젝트 미준비로 원 작업을 거부해도 requestSent=false로 변환하거나 재전송하지 않는다.
- 앱 의존 6개 등록 callback(list-connections/list-tables/get-table-details/
  erd-create-tables/erd-modify-tables/execute-query)이 요청 컨텍스트를 전달한다.
  ping/get-context-help/get-mcp-session-id/placeholder generate-code 범위는 유지한다.
- upstream은 SDK에 의존하지 않는다. MCP 계층에서 signal·상태 callback을 전달한다.
  알림 실패 자체는 무시하며 알림 Promise 무응답은 deadline/취소로 관찰을 끝낸다.
- SDK 취소·transport 종료는 준비 signal로 전달된다. 이미 시작된 앱을 kill하지 않는다.
  파일 access처럼 취소할 수 없는 I/O는 관찰을 중단하고 후속 작업·늦은 결과를 차단한다.
  HTTP는 destroy하며 reg/probe 프로세스는 signal을 받는다. detached 실행 명령은 앱을
  보존하기 위해 kill하지 않고 관찰을 끝낸다. 늦은 ChildProcess error에는 무해한 listener를 둔다.
- 미지원 OS의 설치 감지 결과 not_checked는 유지한다. 공통 준비 경로에서는
  installation_check_failed로 안내하며 미설치로 분류하거나 지원을 확장하지 않는다.

## 변경 파일 범위

제품 변경은 기존 upstream 5개 파일과 신규 observation/runtime-status, MCP server/shared/
preparation-messages 및 6개 앱 의존 도구 등록부다. 테스트는 기존 upstream/readiness/
installation/activation/http, shared, schema/sql/erd 도구, integration/round-trip/
desktop-lifecycle, spawn/cli suite와 mock helper를 갱신하고
`tests/upstream/desktop-installation-io.test.ts`를 추가했다.

README의 사용자 동작, `docs/upstream-rpc-contract.md`, `docs/e2e-manual.md`,
`docs/project-structure.md`, PLAN/CHECKLIST의 직접 영향 정책을 갱신했다.
과거 Phase 항목은 이력임을 표시하고 최신 준비 정책을 연결했다. dist는 빌드만 했으며
직접 편집하거나 추적 파일로 추가하지 않았다.

## 자동 검증

최종 명령 (cwd `/Users/shock/workspace/mcp`):

```sh
npm run typecheck
npm run build
npm test
git diff --check
```

- typecheck: exit 0. `/tmp/mcp-startup-types-final.log`.
- build: exit 0. `/tmp/mcp-startup-build-final.log`.
- 전체 npm test: **24 suite, 211/211 통과**, exit 0, 5.07초.
  `/tmp/mcp-startup-full-final.log` (2026-09-15 01:59:20 KST 실행).
- npm test에 build 및 built CLI StdioClientTransport spawn 6개가 포함된다.
  별도 test:integration을 반복하지 않았다.
- git diff --check: 통과.

| T ID | 실행 근거와 결과 |
| --- | --- |
| T01 | readiness + shared + round-trip: ready이면 activation 0회, 작업 1회. 전체 명령 통과 |
| T02 | installation/readiness 및 installation-io: 부재/권한 오류/record 후보/Windows reg 불명확 실패/OS probe 결과 구분. 전체 명령 통과 |
| T03 | readiness: 설치 확인 후 0.5초 재조회에서 ready면 activation 생략. 통과 |
| T04 | readiness: 연결 부재 → 실행 → Renderer → project loading → ready, 실행 1회·중복 상태 알림 억제. 통과 |
| T05 | activation/readiness: spawn 오류·exit nonzero·pending 명령의 전체 기한 분류. 통과 |
| T06 | readiness + 실제 mock HTTP lifecycle: 근거 없는 최초 timeout은 조회 실패, 재조회/실행 없음. 통과 |
| T07 | readiness: loading 이후 HTTP/IPC timeout에서 회복, 다음 호출에는 근거 미보존. 통과 |
| T08 | HTTP/readiness: null·잘못된 envelope/ID/profile/상태/reason·명확한 오류·응답 중간 연결 종료. 일반 파일 ENOTSOCK와 실제 stale socket inode 구분. 통과 |
| T09 | readiness/shared/HTTP: fake monotonic clock 20,000ms 종료, 프로젝트 변경·설치/실행/알림 무응답, ready 반환 뒤 기한 만료, 응답 byte trickle도 요청 수명 연장 없음. 통과 |
| T13·T16 외부 매핑 | readiness: 실패 reason 4종, account 인증 필요, 사용자 조치 reason 6종의 종료 매핑. local ready는 정상 상태 계약 소비. 본체 상태 생성 검증과 구분 |
| T17 외부 경계 | A loading → B loading → B ready, A/B 변경 중 전체 20초 유지. 본체 회차 상태 소유권 검증은 인계 결과 참조 |
| T18 외부 경계 | 설치/실행/HTTP/알림 pending 취소와 늦은 완료, activation 전 파일 관찰 취소·실행 후 앱 유지, registry 늦은 거절 뒤 probe 금지. 실제 SDK notifications/cancelled 및 client.close가 pending 상태 HTTP를 닫음. 통과 |
| T19 | shared + 등록된 6개 도구 + stdio: 토큰 없음/0/문자열, 증가 progress·total 없음, 중복 상태 억제, notification failure. 통과 |
| T20 | 준비 종료 9종의 정확히 네 공개 필드 및 작업 0회, 준비 후 원 작업 실패의 기존 매핑. 6개 등록 도구 모두 본체 unavailable 수신 후 requestSent 필드 없이 기존 오류·작업 1회 유지. 통과 |
| T21 | built CLI + 실제 stdio + 전용 임시 UDS: 3개 토큰 변형 각각 loading 조회 2회 → ready → 작업 1회, 중간 알림과 최종 응답 1개. 각 1.17~1.18초(전체 클라이언트/fixture 포함). 통과 |
| T12·T22 본체 결합 | 본체 완료/검토의 수신 시 재검사·HTTP close pending 정리 결과 확인. 외부는 T20 unavailable 수신과 T18 실제 HTTP close로 소비 경계 검증. 실제 양측 Desktop E2E로 계산하지 않음 |

### red와 기존 실패 구분

- 신규 readiness 38개는 기존 구현에서 실패했다. `/tmp/mcp-startup-red.log`.
- malformed JSON-RPC/취소 HTTP 회귀: sandbox listen EPERM을 분리한 뒤 기존 구현에서
  6개 실패·1개 통과, unhandled error 2개를 확인했다. `/tmp/mcp-startup-http-red.log`.
- 설치/실행 경계 초기 테스트 및 shared 준비 결과 회귀 실패를 확인했다.
  `/tmp/mcp-startup-install-red.log`, `/tmp/mcp-startup-shared-red.log`.
  초기 activation 테스트에는 누락된 vi import로 인한 harness 오류도 포함돼 있어
  이를 제품 결함 재현으로 계산하지 않는다. readiness의 명령 실패 분기는 별도 red에 포함된다.
- 기존 built CLI의 T21 세 변형 모두 실패했다. `/tmp/mcp-startup-stdio-red.log`.
- 변경 후 최초 전체 실행의 15개 실패는 기존 도구 mock이 준비 RPC에도 작업 결과를
  반환했기 때문이다. 준비 상태 fixture를 명시하고 기존 작업의 결과/params assertion을
  유지하여 모두 통과했다. 기존 ENOTSOCK를 stale로 기대하던 테스트도 실제 socket inode와
  일반 파일을 나누어 새 정책을 검증한다. 남아 있는 기존 실패는 없다.
- UDS listen은 sandbox에서 EPERM이었다. 격리된 임시 endpoint 테스트에 한해 권한을
  확장해 실행했다. 실제 NeoSQL endpoint를 삭제·점유하거나 앱을 기동하지 않았다.
- T21은 POSIX에서 TMPDIR/TMP/TEMP를 전용 임시 디렉터리로 맞추고 mock bind 후 CLI를
  실행한다. Windows는 실제 NeoSQL이 없는 전용 runner에서만
  `NEOSQL_MCP_DEDICATED_WINDOWS_RUNNER=1`을 설정해 실행한다. Windows 실행은 미검증이다.

## W5 실제 Desktop/host 검증 상태

사용자에게 격리 앱/테스트 프로젝트의 실행 위치·profile·A/B 이름 및 Windows 환경을
요청했으며 보고 시점에는 제공받지 못했다. 본체 인계에서도 실제 Desktop 실행/빌드 성공을
보증하지 않는다. 사용 중인 앱을 종료·이동·변경하거나 본체의 공유 설정으로 새 앱을
임의 실행하지 않았다. ps 기반 프로세스 확인은 sandbox에서 차단됐으며, 실행 앱의
검토 코드·profile·격리 프로젝트 일치 여부를 확정하지 않았다.

아래 모든 행에서 실제 앱 commit/host 버전/요청 ID/준비·작업 실측/A·B 기준 데이터는
미확인·미측정이다. **wire 수신과 host 표시도 둘 다 미검증**이다. SDK mock 수신 성공을
실제 Desktop 또는 host UI 통과로 바꾸지 않는다.

| M ID | macOS 실제 환경 | Windows 실제 환경 | 남은 변형/전제 |
| --- | --- | --- | --- |
| M01 | 미검증 | 미검증 | 종료 앱·자동 복원 없음, 첫 미선택/선택 후 새 호출 |
| M02 | 미검증 | 미검증 | 실제 loading 최초 관찰 → 동일 호출 ready, 지원되는 자동 복원은 별도 |
| M03 | 미검증 | 미검증 | 명령 실패 및 느린 기동을 재현할 격리 환경 |
| M04 | 미검증 | 미검증 | 잠금·연결/멤버 정리·드라이버 모달, 해결/Skip 및 자동 잠금 |
| M05 | 미검증 | 미검증 | 실제 host의 토큰 유무/0/문자열·진행 UI·취소 전달/서버 관찰, 앱 유지 |
| M06 | 미검증 | 미검증 | 실제 준비·작업·host 전체 제한 별도 측정 |
| M07 | 미검증 | 미검증 | 깨끗한 미설치 OS와 설치 조회 권한 오류 환경 |
| M08 | 미검증 | 미검증 | 실제 초기화 중단 실패/복구, 저장소·동기화·설정 부재 변형 |
| M09 | 미검증 | 미검증 | local 익명, account 로그인/기존 인증 만료 흐름 |
| M10 | 미검증 | 미검증 | 구분 가능한 A/B 기준 결과, 직접 전환·대시보드 경유·A 늦은 결과 |
| M11 | 미검증 | 미검증 | 근거 없는 최초 미응답과 근거 있는 기동/로딩 후 미응답·회복 |

실행 절차는 `docs/e2e-manual.md`의 M01~M11을 따른다. 위 환경과 검토 코드의 앱을
준비한 뒤 실제 결과를 추가해야 W5를 평가할 수 있다. 기본 읽기 도구는 list-connections이며
실제 DDL/DML이 필요하면 NeoSQL MCP로만 수행한다.

## 남은 검토 및 다른 저장소 조치

- 원래 대화 Codex: diff·공통 호출 경로·deadline/취소 수명·T ID 근거 검토 필요.
- Windows OS 명령/레지스트리/Named Pipe 및 실제 host 진행 UI는 환경 검증 필요.
- 본체 제품 코드의 추가 결함은 이번 조사/외부 자동 검증에서 확인하지 않았다.
- 본체 `docs/mcp/architecture.html`의 외부 준비 대기 미완료 설명은 이제 외부 W3·W4
  구현/자동 검증 완료와 W5 미검증을 구분하도록 본체 수행 agent가 갱신할 사항이다.
  본체 구현 계획의 W1~W5 일괄 완료 체크는 실제 W5 전에는 완료로 바꾸지 않아야 한다.
