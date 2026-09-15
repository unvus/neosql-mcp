# MCP W3·W4 구현 결과와 W5 검증 인계

2026-09-15 (Asia/Seoul). **W3·W4 구현·자동 검증 및 리뷰 지적 2건 수정 완료.**
실제 Desktop/host/Windows의 W5는 미검증이며 전체 기능 검증 완료나 검증 생략 승인으로
표시하지 않는다. 초기 구현은 `7d81afd`로 커밋됐으며, 이번 후속 수정은 미커밋 상태다.
이번 수정에서 push·merge·배포·버전 변경은 수행하지 않았다.

## 리뷰 후속 수정과 재검토 (2026-09-15)

검토 대상 `7d81afd`에서 확인한 P1·P2 두 건을 수정했다.

- **P1 stdio EOF 취소 누락:** CLI가 stdin `end`·`close`를 중복 실행 방지 종료 함수에
  연결해 SDK `server.close()`로 진행 중인 요청을 취소한다. 연결 전에 listener를
  등록하며 종료 및 연결 실패 시 정리한다. SDK transport callback은 덮어쓰지 않는다.
  정상 EOF는 자연 종료, 종료 처리 오류는 로그와 실패 exit code로 남긴다.
- **P2 상태 형변환 검증:** `project.state`는 문자열 타입을 먼저 확인한 뒤 허용값과
  비교한다. 배열·객체를 문자열로 변환해 통과시키거나 변환 예외를 발생시키지 않는다.
- 재검토 결과 두 지적은 해결됐으며 이번 수정 diff에서 추가 결함은 발견하지 않았다.
  이 대화의 Codex가 수행한 재검토이며 별도 리뷰어 또는 실제 W5 검증 결과가 아니다.

회귀 검증은 승인된 계획대로 red → 수정 → green 순서로 수행했다.

| 검증 | 근거와 결과 |
| --- | --- |
| 상태값 red | 기존 코드에서 배열 4종과 변환 불가 객체 1종, 총 5개 실패. `/tmp/mcp-review-fix-state-red.log` |
| EOF red | 기존 built CLI에서 loading 중 추가 조회, HTTP pending 중 timeout 이후 최종 응답을 확인해 두 테스트 실패. `/tmp/mcp-review-fix-eof-red.log` |
| 상태값 green | 배열·중첩 배열·객체·숫자·null 8종 모두 첫 조회에서 `status_check_failed`, `requestSent: false`, 조회 1회·작업 0회. 후속 ready 응답 소비·설치 확인·앱 실행 없음 |
| EOF green | raw spawn의 stdin만 종료. loading 후 추가 조회·작업·알림 없음, pending HTTP는 1초 timeout 이전에 연결 종료(750ms 미만 assertion), CLI 정상 자연 종료. SDK client.close 및 성공 경로의 kill 미사용 |
| 타입 검사·빌드 | `npm run typecheck`, `npm run build` 통과. 테스트 입력의 이종 타입 추론 오류는 명시적인 unknown 타입으로 수정 후 통과 |
| spawn 통합 | `npm run test:integration`: 8/8 통과. `/tmp/mcp-review-fix-spawn-green.log` |
| 전체 검증 | `npm test`: 24 suite, **221/221 통과**, 2026-09-15 04:08:01 KST 시작, 5.14초. `/tmp/mcp-review-fix-full-green.log` |
| diff 확인 | `git diff --check` 통과 |

새 회귀 테스트는 상태값 8개와 built CLI EOF 2개다. 임시 UDS 및 로그 디렉터리로 격리해
실제 NeoSQL 앱·DB에 접근하지 않았다. Windows는 기존 전용 runner 조건을 유지했고
이번 실행은 macOS 결과다. 아래 초기 검증 기록과 W5 미검증 목록은 이력으로 유지한다.

## 기준과 소유권

- 외부 checkout: `/Users/shock/workspace/mcp`, 브랜치 `main`.
- 초기 구현 시작 HEAD: `8ad666e86780bc992f06a7dce73734dbb9ddcb04`, 패키지 `1.6.0`.
  시작 작업 트리는 깨끗했다. 초기 구현 커밋 및 후속 수정 기준 HEAD는 `7d81afd`다.
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

## 초기 구현 자동 검증 (후속 수정 전 기록)

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

### 2026-09-15 08:53~08:54 KST 후속 실제 실행 — I07·I08 기동 지연과 복구

사용자가 설치된 NeoSQLDev를 완전히 종료한 뒤 main 프로세스 부재와 설치 버전
3.3.1을 확인했다. macOS/dev에서 별도 MCP SDK로 실제 Desktop을 호출했다.
사용자가 승인한 새 앱 프로세스의 일시 정지·재개 방식으로 지연을 재현했다.

- CLI `/Users/shock/workspace/mcp/dist/cli.js --profile=dev`, SHA-256
  `cf15dfaea19b2c4d3e00b8cd3eb76053c779ff3a2d85d49de45e92ef14456df4`.
  제품 소스·dist·준비 제한 시간은 변경하지 않았다. spawn/http 관찰은 실제 함수에
  그대로 위임하며 실행 결과를 mock하지 않았다.
- 08:53:43.980 KST `list-connections` tools/call 1회, request ID 1,
  progressToken `i07-dev-once`. 실제 `open -a NeoSQLDev neosql-dev://mcp/activate`
  1회, 08:53:44.664 exit 0. 별도 자동 재개 감시 프로세스 준비 후 새 main PID 3217을
  08:53:44.821 SIGSTOP했으며 프로세스 상태 T를 확인했다.
- 준비 조회 시도 39회, 원래 작업 RPC 전송 0회. 약 20,020ms 후 최종 응답 1개:
  `isError: true`, `readiness_timeout`, `requestSent: false`. 앱 확인 후 재시도 안내이며
  crash라고 단정하지 않았다. progress 1·2를 동일 토큰으로 수신했다.
- SDK 종료 후 08:54:04.575 감시 프로세스가 동일 실행 신원을 확인하고 SIGCONT했다.
  감시 프로세스에는 테스트 중단 시에도 35초 후 재개하는 안전 기한을 두었다.
  08:54:06.741 직접 runtime 조회에서 `renderer: responsive`,
  `projectState: not_selected`를 확인했다. 같은 PID 3217이 유지됐다.
  복구 조회는 별도 내부 상태 관찰이며 두 번째 MCP 도구 호출이 아니다.
- 횟수·실제 open 성공·timeout 결과·작업 미전송·정지 상태·동일 PID 재개·응답 회복
  assertion 통과. **I07·I08 일시 정지 변형 완료.** 자연적으로 느린 머신의 기동,
  Windows 및 ChatGPT host UI 표시는 이번 결과에 포함하지 않는다.
- 증거 디렉터리:
  `/var/folders/nf/3jht63k9493byyz6v7vykcp80000gn/T/neosql-i07-5G7Skd`
  (`evidence.json`, `trace.jsonl`, `pause-resume.json`, `resume-result.json`).
  실행기 `/tmp/neosql-i07-driver.mjs`, `/tmp/neosql-i07-client.mjs`,
  `/tmp/neosql-i07-observer.cjs`, `/tmp/neosql-i07-guardian.cjs`.


### 2026-09-15 08:44 KST 후속 실제 실행 — I06 실행 명령 시작 실패

사용자가 NeoSQLDev를 Cmd+Q로 종료한 뒤 main 프로세스 부재를 재확인했다.
실제 설치 진단은 `/Applications/NeoSQLDev.app/Contents/MacOS/NeoSQLDev`에서
`installed`를 반환했다. 앱 버전 3.3.1, macOS/dev 환경이다.

- I05 관찰용 SDK 실행기를 별도 임시 파일로 복사하고, MCP 자식 프로세스의 PATH만
  빈 임시 디렉터리로 설정했다. Node는 절대 경로로 실행했다. 전역 PATH·앱·설정 파일·
  제품 소스는 변경하지 않았다. 실제 spawn을 호출하며 오류를 mock하지 않았다.
- CLI SHA-256은 I05와 동일한
  `cf15dfaea19b2c4d3e00b8cd3eb76053c779ff3a2d85d49de45e92ef14456df4`다.
- 08:44:27.056 KST `list-connections` tools/call 1회, wire request ID 1,
  progressToken `i06-dev-once`. 준비 조회 시도 2회 후 실제 `spawn open` 1회에서
  `ENOENT` 발생. 이것은 프로세스 시작 실패이며 open 프로세스가 실행 후 nonzero로
  종료한 경우가 아니다.
- 약 520ms 후 최종 응답 1개: `isError: true`, `activation_failed`,
  `requestSent: false`, 수동 앱 실행 후 재시도 안내. 원래 작업 RPC 전송 0회.
  테스트 후에도 Dev 앱 프로세스가 없음을 확인했다.
- 실제 spawn 오류·시도 횟수·최종 응답·작업 미전송 assertion 통과.
  **I06 프로세스 시작 실패 변형 완료.** 명령 시작 후 비정상 종료 변형과 Windows는
  미검증이다. SDK 수신 결과이며 ChatGPT host UI 검증으로 해석하지 않는다.
- 증거: `/var/folders/nf/3jht63k9493byyz6v7vykcp80000gn/T/neosql-i06-7gyQLQ/evidence.json`, `/var/folders/nf/3jht63k9493byyz6v7vykcp80000gn/T/neosql-i06-7gyQLQ/trace.jsonl`.
  실행기: `/tmp/neosql-i06-client.mjs`, `/tmp/neosql-i06-observer.cjs`.
  제한된 PATH는 종료된 테스트 프로세스에만 적용되어 별도 전역 복구가 필요하지 않았다.


### 2026-09-15 08:26 KST 후속 실제 실행 — I05 자동 실행 명령 1회

사용자가 NeoSQLDev를 다시 설치하고 종료한 후 수행했다. 설치 버전 3.3.1과 호출 전
앱 main 프로세스 부재를 확인했다. macOS/dev, Node v22.22.2, 실제 Desktop과 SDK
StdioClientTransport를 사용했으며 기존 ChatGPT host 세션 호출과 구분한다.

- CLI: `/Users/shock/workspace/mcp/dist/cli.js --profile=dev`. checkout HEAD
  `e48f525a2156a3ae116aeac8386a5820783a408b`, source map의 src 파일 30개가 현재 작업 트리와 일치했다.
  CLI SHA-256: `cf15dfaea19b2c4d3e00b8cd3eb76053c779ff3a2d85d49de45e92ef14456df4`.
  package version 1.6.0, handshake serverInfo.version 0.0.1을 구분한다.
- 관찰 방식: 임시 Node preload에서 `child_process.spawn`과 `http.request`를 감싸
  실제 함수에 동일 인자를 그대로 전달했다. 제품 소스·dist를 수정하거나 응답/시간/실행을
  mock하지 않았다. 앱과 같은 TMPDIR을 SDK에 전달했다.
- 08:26:32.117 KST `list-connections` tools/call **1회**. wire request ID 1,
  progressToken `i05-dev-once`. 약 5,339ms 후 최종 결과 **1개**:
  `project_not_selected`, `requestSent: false`.
- 실제 `open -a NeoSQLDev neosql-dev://mcp/activate` 호출은 08:26:32.636 KST
  **1회**, 08:26:32.893 종료 코드 **0**. 준비 상태 조회 시도는 총 **11회**이며
  앱 실행 이후에도 반복했지만 open 재호출은 없었다. 앱 연결 전 실패한 조회 시도도
  이 수에 포함되므로 앱이 11회 수신했다고 해석하지 않는다.
- 상태 응답에서 Renderer `not_ready` → `responsive`/project `not_selected`를 확인했다.
  원래 list-connections RPC 전송 **0회**. 종료 후 PID 96242의 실제 Dev 앱이 유지됐다.
- SDK wire에 progress 1·2·3을 수신했다. 이 부수 관찰을 ChatGPT host UI의
  진행 알림 표시 또는 다른 N 분기 전체 통과로 계산하지 않는다.
- 판정: **I05 완료**. 별도 SDK 실행이며 과거 M01 host 호출의 명령 횟수를
  소급 확정하지 않는다. Windows는 미검증이다.
- 증거: `/var/folders/nf/3jht63k9493byyz6v7vykcp80000gn/T/neosql-i05-We9UaV/evidence.json`, 같은 디렉터리의 `trace.jsonl`.
  일회성 실행기: `/tmp/neosql-i05-client.mjs`, `/tmp/neosql-i05-observer.cjs`.
  횟수·실제 명령 인자·exit 0·반복 조회·최종 응답 1개 assertion이 모두 통과했다.


### 2026-09-15 08:16 KST 후속 실제 실행 — I03 설치 정보 조회 오류

사용자가 Dev 앱 종료·기본 설치 경로 부재를 준비하고 권한 오류 준비를 요청했다.
현재 사용자 계정(uid 501)의 실제 파일 권한으로 수행했으며 별도 VM이나 깨끗한 OS는 아니다.

- 사전 확인: `/Applications/NeoSQLDev.app`, 사용자 Applications의 Dev 앱 및 dev 소켓이 없었다. 기존 설치 기록의 appPath도 존재하지 않는 `/Applications/NeoSQLDev.app`이었다.
- 기존 `~/.neosql-dev/mcp-config.json`은 소유자 uid 501, 일반 파일, 권한 644였다. 내용은 변경하지 않고 08:16:24.257 KST에 권한을 000으로 일시 변경했다. 같은 일반 사용자 계정의 실제 읽기가 `EACCES`로 실패함을 확인했다.
- 45초 자동 복구와 호출 직후 복구를 준비했다. 08:16:30.034 KST에 실제 host에서 `list-connections` 1회 호출, 약 4,495ms 후 `isError: true`, `installation_check_failed`, `requestSent: false` 및 수동 앱 실행 후 재시도 안내를 수신했다.
- 08:16:34.719 KST에 원래 권한 644로 복구했다. 파일 내용의 SHA-256이 변경 전과 같음을 확인했다. 복구 후 추가 MCP 호출은 하지 않았다.
- 판정: I03 설치 조회 권한 오류 안내 분기 확인 완료. OS 실행 명령·원래 작업 횟수는 직접 계측하지 않았으며 `requestSent: false`는 도구의 보고값이다. M07 전체나 Windows 검증 완료를 뜻하지 않는다.
- 증거: `/tmp/neosql-i03-permission-evidence.json`, `/tmp/neosql-i03-call-result.json`. 파일 내용·자격 증명은 증거에 보관하지 않았다.


### 2026-09-15 06:52~06:54 KST 후속 실제 실행 — M01

macOS 26.5.2에서 수행했다.

- 사용자가 새 Dev 빌드 설치를 완료했다고 알린 뒤 검사했다. `/Applications/NeoSQLDev.app`의 버전은 3.3.1, bundle ID는 `com.unvus.neosql.dev`다. 이전 빌드 작업에서 생성한 dev 패키지는 서명·공증 티켓·DMG 무결성 검증을 통과했다.
- host: ChatGPT Desktop 26.908.40834 (8881). 프로젝트 `.codex/config.toml`은 `npx -y neosql-mcp --profile=dev`. 이 host가 실행한 npm 패키지의 정확한 revision은 미확인이다.
- 호출 전 해당 설치 경로의 NeoSQLDev main 프로세스가 없음을 `pgrep`으로 확인했다. 앱 종료 조작은 하지 않았다.
- 2026-09-15 06:52:22.494 KST에 host의 `list-connections`를 1회 호출했다. 추가 도구 호출 없이 약 7,707ms 후 최종 응답 1개: `isError: true`, `status: project_not_selected`, `requestSent: false`. message와 nextAction은 프로젝트 선택 후 재호출을 안내했다. 시간은 host 도구 호출 전체 관찰 시간이며 MCP 내부 준비 시간과 같다고 단정하지 않는다.
- 호출 후 PID 73983이 `/Applications/NeoSQLDev.app/Contents/MacOS/NeoSQLDev`로 실행 중임을 확인했다.
- 앱 로그: 06:52:29.264 `neosql-dev://mcp/activate` 수신, 06:52:29.276 dev 소켓 listen, 06:52:30.000 Renderer handler ready. 06:52분 로그의 `list-connections` 원래 작업 dispatch는 0회다. 내부 상태 조회의 upstream JSON-RPC ID는 16·17이며 host tools/call ID와 구분한다.
- 같은 deep link가 pending 처리 과정에서 다시 로그에 나타난다. 이를 OS 실행 명령 2회로 계산하지 않는다. OS 실행 명령 횟수는 직접 계측하지 않았다.
- 원본 로그의 해당 구간에서 MCP 및 activation 관련 행만 `/tmp/neosql-m01-first-call-20260915.log`에 보관했다. host wire의 tools/call ID·progressToken·진행 알림 UI는 이번 도구 결과에서 노출되지 않아 미확인이다.
- 사용자가 프로젝트 접속 완료를 알린 후 06:54:25.997 KST에 두 번째 `list-connections`를 1회 호출했다. 약 3,599ms 후 `{"connections":[]}` 정상 결과를 수신했다. 빈 목록은 MCP에 공개된 연결이 반환되지 않았다는 의미이며, 도구 실행 실패가 아니다. DB 연결 기준 결과 확보나 DB 작업 검증으로 계산하지 않는다.
- 앱 로그에서 06:54:29.577 준비 조회 후 06:54:29.586 `list-connections` dispatch 1회, 06:54:29.587 성공 응답을 확인했다. 원래 작업 upstream requestId는 19다. 준비 상태 조회와 원래 작업을 별도로 집계했으며 두 번째 호출의 앱 로그 발췌는 `/tmp/neosql-m01-second-call-20260915.log`다.
- 판정: **macOS/dev M01의 핵심 동작(종료 앱 기동 → 첫 호출 프로젝트 미선택·작업 0회 → 사용자의 프로젝트 선택 → 새 호출 정상 처리·작업 1회)은 확인했다.** OS 실행 명령 정확한 횟수, host wire ID·progressToken·진행 UI, host가 실제 사용한 MCP 패키지 revision은 미확인이다. 해당 증거까지 포함한 M01 전체 검증 및 W5 전체 완료는 선언하지 않는다. Windows는 미검증이다.

### 2026-09-15 02:26 KST local 앱 사전 연결 점검

아래 설정·revision·미확인 상태와 다음 단계는 사전 점검 당시 기록이다. 이후 dev 설치본 검증 결과와 구분한다.

#### 환경과 판정 경계

- macOS 26.5.2 (25F84), Node v22.22.2.
- 본체 checkout HEAD: `9683668473a6d379fc5104685284e36ffead2c5f`. 미커밋 변경 있음. 실제 실행 앱이 이 checkout/build인지, 테스트 전용 환경인지는 아직 미확인.
- MCP checkout HEAD: `7d81afd4dc4c48d19dab479fdcc4ad00eb742deb`, 작업 트리 깨끗함. 패키지 1.6.0. 기존 `dist/cli.js.map`의 src 파일 30개가 현재 소스와 일치함을 확인했다. 이번 점검에서 재빌드하지 않았다.
- SDK `StdioClientTransport`에서 `node /Users/shock/workspace/mcp/dist/cli.js --profile=local`을 실행했다. MCP handshake의 serverInfo.version은 `0.0.1`로 응답했다. 패키지 버전과 구분한다.
- Codex 저장 설정은 `npx -y neosql-mcp`이며 profile 지정이 없다. 현재 Codex 연결의 실제 패키지 revision은 확인하지 않았다. 설정은 변경하지 않았다.
- 아래는 실제 local 앱과의 사전 연결 점검이다. M01~M11 전체 통과 또는 W5 완료로 계산하지 않는다. 실제 host UI·취소·OS 실행 횟수·앱 내부 작업 횟수는 미검증이다.

#### 수행 결과

1. built 설치 진단 CLI: local은 `not_installed`, dev는 `/Applications/NeoSQLDev.app/Contents/MacOS/NeoSQLDev`를 찾아 `installed`. 실행 중인 local 개발 앱의 존재와 패키징 앱 설치 판정은 별개다.
2. local 내부 `get-runtime-status` 1회 조회: HTTP 200, 약 116ms. `renderer: responsive`, `project.state: not_selected`, `projectId: null`, `app: neosql`, `profile: local`을 확인했다. 요청 ID는 `w5-preflight-local-20260915`.
3. 02:26:23 KST, 앱과 같은 `TMPDIR`을 전달한 SDK 클라이언트: `list-connections`를 1회 호출했다. 요청 ID 1, progressToken `w5-preflight-local`. 약 28ms 후 최종 도구 응답 1개, `isError: true`, `status: project_not_selected`, `requestSent: false`, 영어 message/nextAction을 수신했다. 진행 알림은 없었다. 즉시 종료 상태의 응답 계약과 일치한다. 원래 작업 미전송은 공개 결과의 보고값이며 앱 내부 횟수를 별도 계측하지 않았다.

앱을 실행·종료하거나 프로젝트·DB를 변경하지 않았다. 초기 소켓 접근은 sandbox의 EPERM으로 차단됐고, 권한을 확장한 읽기 전용 조회로 확인했다. EPERM을 제품 오류로 판정하지 않았다.

#### SDK 실행 환경 주의점

첫 SDK 호출은 기본 `StdioClientTransport` 환경에 `TMPDIR`이 포함되지 않아 앱과 다른 소켓 경로를 계산했고, 약 10ms 후 `installation_not_found`를 반환했다. SDK 구현의 기본 상속 목록과 양측 `os.tmpdir()` 기반 endpoint 계산을 확인했다. 테스트 클라이언트에 실제 앱의 `TMPDIR`을 명시한 뒤 위 3번 결과를 얻었다. 두 실행은 별도 tools/call이며 동일 호출의 polling이 아니다.

실제 host가 전달하는 환경과 해당 host의 성공 여부는 별도로 검증해야 한다. 이 결과를 M07의 깨끗한 미설치 OS 변형 통과로 계산하지 않는다. 제품 코드는 변경하지 않았다.

#### 증거와 당시 남은 확인 사항

- 수정 전 SDK wire: `/tmp/neosql-w5-preflight-without-tmpdir.json`.
- TMPDIR 일치 후 SDK wire: `/tmp/neosql-w5-preflight-result.json`.
- 일회성 클라이언트: `/tmp/neosql-w5-preflight.mjs`.
- 실제 앱 checkout/build·profile·격리 여부와 테스트 프로젝트 A/B를 확인한다. 익명 local의 준비된 프로젝트에서 M09 및 A/B 기준 결과를 먼저 확보한다.
- M01의 종료 앱 자동 실행은 OS에서 발견·실행 가능한 해당 profile 패키징 앱이 필요하다. 현재 local 설치 진단은 미발견이므로 개발 서버 실행만으로 이 변형의 준비 완료를 주장하지 않는다.
- Windows와 장애 재현 환경은 미확인이다. 나머지 절차는 기존 `e2e-manual.md` M01~M11을 따른다.

아래 환경 미확인 설명은 최초 인계 시점 기록이다. M01의 최신 관찰은 위 후속 결과를 따른다.

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
| M01 | 핵심 동작 확인, 일부 증거 미확인 | 미검증 | 첫 호출 작업 0회·프로젝트 선택 후 새 호출 작업 1회 확인. OS 실행 횟수·host wire·MCP revision 미확인 |
| M02 | 미검증 | 미검증 | 실제 loading 최초 관찰 → 동일 호출 ready |
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

- 원래 대화 Codex 검토에서 확인한 두 지적은 위 후속 수정으로 해결하고 재검토했다.
- Windows OS 명령/레지스트리/Named Pipe 및 실제 host 진행 UI는 환경 검증 필요.
- 본체 제품 코드의 추가 결함은 이번 조사/외부 자동 검증에서 확인하지 않았다.
- 본체 `docs/mcp/architecture.html`의 외부 준비 대기 미완료 설명은 이제 외부 W3·W4
  구현/자동 검증 완료와 W5 미검증을 구분하도록 본체 수행 agent가 갱신할 사항이다.
  본체 구현 계획의 W1~W5 일괄 완료 체크는 실제 W5 전에는 완료로 바꾸지 않아야 한다.
