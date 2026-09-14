# 수동 e2e 검증 (실제 MCP 클라이언트 연동)

자동화된 단위/통합 테스트(`docs/testing.md`)로는 잡지 못하는 영역 — 실제 MCP Host와의 stdio 핸드셰이크, 툴 호출 왕복 — 을 사람이 검증하는 절차.

> Phase 0 시점에서는 `ping` 툴 하나만 응답한다. Phase가 진행되면 같은 자리에 시나리오만 추가한다.

## 사전 준비

```bash
npm run build       # dist/cli.js 생성 (shebang + 실행권한 포함)
npm link            # neosql-mcp 명령을 글로벌 PATH에 등록 (1회)
which neosql-mcp    # 경로 확인 (예: ~/.nvm/.../bin/neosql-mcp)
```

코드 수정 후에는 `npm run build` 만 다시 돌리면 된다 (link는 symlink라 재실행 불필요).
검증이 끝나면 `npm unlink -g neosql-mcp`로 link를 해제한다. 해제하지 않으면
`neosql-mcp`를 직접 실행하는 MCP host 설정은 계속 로컬 workspace build를 사용할 수 있다.

## 1. MCP Inspector — LLM 없이 빠른 검증 (권장 첫 단계)

```bash
# prod profile (기본)
npx @modelcontextprotocol/inspector neosql-mcp

# dev profile
npx @modelcontextprotocol/inspector neosql-mcp --profile=dev
```

- 브라우저 UI가 자동으로 열린다.
- prod profile 은 `neosql-mcp.sock` / `\\.\pipe\neosql-mcp` 로 연결한다.
- dev profile 은 `neosql-mcp-dev.sock` / `\\.\pipe\neosql-mcp-dev` 로 연결한다.
- MCP host 설정 예시는 [`README.md`](../README.md)를 기준으로 한다.
- 활성 프로젝트와 좌표 해석 계약은
  [`docs/mcp-client-config.md`](mcp-client-config.md)를 따른다.
- **Tools** 탭 → `ping` 선택 → **Run Tool** → 응답 `"pong"` 확인.
- 핸드셰이크 / `tools/list` / `tools/call` 셋을 한 화면에서 본다. 어디서 끊겼는지 즉시 보이므로 디버깅 효율이 가장 좋다.

## 2. Claude Code

**방법 A — CLI 등록 (사용자 단위)**

```bash
claude mcp add neosql-ping neosql-mcp
```

**방법 B — 프로젝트 단위 (`.mcp.json`)**

프로젝트 설정 예시는 [`README.md`](../README.md)를 기준으로 삼는다.

검증:

- 세션에서 `/mcp` → `neosql` 가 connected 로 보이는지.
- 대화에서 "ping 툴 호출해줘" → `pong` 반환 확인.
- `get-context-help` 툴 호출 → 활성 프로젝트 Default와 선택적 `list-connections`
  사용 안내가 표시되는지 확인.

## 3. Codex CLI

`~/.codex/config.toml` 에 추가:

Codex 설정 예시는 [`README.md`](../README.md)를 기준으로 삼는다.

검증: 세션에서 `ping` 툴 호출 가능한지 확인.

## Phase별 추가 시나리오

| Phase | 추가될 절차                                                                                                                                           |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | config 파일이 (a) 정상, (b) 없음, (c) pid dead, (d) socket path not bound (UDS/Named Pipe connect 실패) 인 각 상태에서 client 연결을 시도해 동작 확인 |
| 2     | 아래 as-is embedded-server MCP vs to-be neosql-mcp 비교 절차 확인                                                                                     |
| 3     | 아래 Desktop readiness UX 시나리오 확인                                                                                                               |
| 4+    | 미설치 흐름 시나리오, Windows Named Pipe ACL 검증                                                                                                     |

## Phase 2. as-is/to-be MCP tool 비교

목표는 기존 embedded-server MCP tool 과 to-be `neosql-mcp` tool 이 같은 사용자 입력에서
동등한 결과를 반환하는지 확인하는 것이다. 실제 NeoSQL Desktop, project, connection,
schema, template pack 이 필요하므로 이 절차는 수동 e2e로 유지한다.

### 공통 준비

1. `npm run build` 로 `dist/cli.js`를 갱신한다.
2. NeoSQL Desktop 을 실행하고 MCP RPC socket 이 준비됐는지 확인한다.
3. 비교에 사용할 project/connection/schema 를 정한다.
4. to-be MCP host 는 `neosql-mcp` stdio 설정을 사용한다.
5. as-is MCP host 는 기존 embedded-server MCP 설정을 사용한다.
6. 양쪽이 같은 DB 좌표를 사용하도록 준비한다.
   - to-be: NeoSQL Desktop에서 비교 프로젝트를 열고 Default를 지정하거나,
     `connectionId` / `database` / `schema`를 도구 호출에 모두 명시한다.
   - as-is: 기존 HTTP header 또는 기존 host 설정의 context 주입 방식을 사용한다.

### 비교 대상

| Tool              | 입력                                                                         | 기대 비교 포인트                                     | 상태                              |
| ----------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------- |
| `get-context-help` | `{}`                                                                         | stdio/npx 기준 도움말                                | 확인 완료                         |
| `list-tables`      | `{ "connectionId": "<id>", "database": null, "schema": "<schema>" }`        | table/view 목록, comment                             | 재검증 필요                       |
| `get-table-details` | `tableNames` + 전체 명시 좌표 또는 좌표 전체 생략                         | columns/indexes/fks/constraints                      | 재검증 필요                       |
| `erd-create-tables` | `tableDefinitions` + 전체 명시 좌표 또는 좌표 전체 생략                    | ERD 가상 테이블 생성, DB 무변경                      | 재검증 필요                       |
| `erd-modify-tables` | `alterations` + 전체 명시 좌표 또는 좌표 전체 생략                         | ERD 모델 수정, DB 무변경                             | 재검증 필요                       |
| `execute-query`    | `sql` + 전체 명시 좌표 또는 좌표 전체 생략                                | SELECT/DML result                                    | 재검증 필요                       |
| `generate-code`    | `{}`                                                                         | `개발중입니다`                                      | 개발중 placeholder                |

### generate-code 추가 조건

`generate-code`는 현재 개발중 placeholder로 유지한다. 호출 시 upstream RPC를 호출하지 않고
`개발중입니다`를 반환한다.

실제 code generation contract는 기능 재개 시 별도 phase에서 다시 정의한다.

### 결과 기록

| Date       | Host               | Profile                   | Tool             | Input 요약                 | Result  | 비고                                    |
| ---------- | ------------------ | ------------------------- | ---------------- | -------------------------- | ------- | --------------------------------------- |
| 2026-05-11 | automated mock UDS | profile path independent  | 9개 Node handler | contract fixtures          | pass    | `npm test` 기준, real Desktop 비교 아님 |
| TBD        | real Desktop       | prod 또는 dev             | `generate-code`  | 없음                       | pending | placeholder 응답 확인                   |

## Active project runtime context

실제 NeoSQL Desktop에서 다음 시나리오를 같은 MCP process로 연속 검증한다.

1. 프로젝트 A를 열고 MCP Access Control에서 enabled 좌표 하나를 Default로 지정한다.
2. 좌표 없이 `list-tables`를 호출해 프로젝트 A의 Default가 사용되는지 확인한다.
3. `list-connections`에서 다른 enabled 좌표를 찾고 세 좌표를 모두 명시해 호출한다.
4. `connectionId`만 전달한 호출이 `invalid-params`로 실패하고 upstream DB 작업이 실행되지
   않는지 확인한다.
5. 프로젝트 B로 전환한 뒤 MCP process를 재시작하지 않고 좌표 생략 호출을 실행해 프로젝트
   B의 Default가 사용되는지 확인한다.
6. Default를 해제하고 좌표 생략 호출이 `invalid-params`로 실패하는지 확인한다.
7. 아래처럼 legacy 인자를 포함한 별도 Inspector process를 시작하고 오류·경고 없이 기동하는지,
   인자 값과 무관하게 현재 Desktop 활성 프로젝트가 사용되는지 확인한다.

```bash
npx @modelcontextprotocol/inspector neosql-mcp \
  --project=ignored-project \
  --default-connection=999 \
  --default-database=ignored \
  --default-schema=ignored
```

## 앱 준비 대기·진행 알림 E2E (M01~M11)

2026-09-15: 아래는 본체 설계에서 검토한 실제 Desktop 검증 절차다. 기존 Phase 3의
activation 직후 반환 절차를 대체한다. 자동 mock UDS/stdio 검증과 실제 앱 검증은
구분한다. 실행 여부·OS·버전·wire/host 표시 결과는
[mcp-startup-progress-completion.md](mcp-startup-progress-completion.md)에 기록한다.

상태 조회 `get-runtime-status`는 내부 RPC이며 host에서 직접 호출하는 공개 도구가 아니다.
격리된 앱/프로젝트와 해당 profile을 사용하는 built CLI를 준비한 뒤 아래 절차를 따른다.
일반 파일을 실제 NeoSQL 소켓 경로에 만드는 방식은 사용하지 않는다. 일반 파일의
ENOTSOCK는 상태 확인 실패이며 stale socket(ECONNREFUSED)과 다르다.

설치만 진단할 때는 `npm run check:desktop-installation -- --profile=local`을 사용한다.
진단 CLI의 installed/not_installed/not_checked 및 상세 경로 형식은 유지된다.
조회 오류는 CLI 실패로 보고하며 MCP 준비 결과의 installation_check_failed와 구분한다.
사용 중인 앱을 이동·삭제하거나 권한을 바꿔 설치 실패를 재현하지 않는다.

### 공통 준비·관찰 기준

- 앱과 MCP의 profile을 맞추고 OS·앱/MCP commit 또는 버전·host 버전을 기록한다. 테스트 전용 프로젝트와 격리된 앱/OS 환경을 사용한다. 기본 도구는 `list-connections`다. A/B 각각에 설정 완료·비활성 아님·AI 사용 허용·schema 보유 조건을 만족하는 연결을 준비하고 이름을 구별한다. 준비 완료된 A/B에서 도구를 사전 호출해 서로 구별 가능한 연결이 실제 반환됨을 확인하고 기준 결과를 기록한다. 이 사전 호출은 본 시나리오의 호출 횟수에서 제외한다.
- MCP host에서 도구를 한 번 호출하고 요청 ID를 기록한다. agent가 자동으로 새 도구 호출을 추가했다면 이를 동일 호출의 polling으로 계산하지 않는다. 재요청 없이 완료되어야 하는 사례는 최초 tools/call 하나의 경로로 판정한다.
- wire의 tools/call·progressToken·notifications/progress·최종 결과, 앱 내부 상태 조회, OS 실행 명령, 원래 작업 전달을 각각 구분해 관찰한다. 취소는 해당 requestId의 notifications/cancelled 전달 또는 MCP transport 종료와 서버의 관찰 시점을 기록한다. 내부 조회 횟수를 원래 작업 횟수에 포함하지 않는다. 원시 자격 증명·SQL 데이터가 포함된 로그는 증거에 남기지 않는다.
- 최초 준비 확인부터 종료/원래 작업 전달까지의 시간을 측정한다. OS 실행 명령 성공과 실제 앱 창·Renderer 응답·프로젝트 준비 완료를 별도 시점으로 기록한다.
- host가 토큰 포함/미포함을 선택할 수 없으면 해당 변형은 실제 Desktop에 연결한 SDK 클라이언트로 확인하고, host의 실제 토큰 전달·UI 표시는 별도 결과로 남긴다. SDK 수신 성공을 host 화면 표시 성공이라고 기록하지 않는다.
- host의 취소 버튼 클릭만으로 서버 취소 수신을 가정하지 않는다. 취소가 전달되지 않거나 증거를 확인할 수 없으면 해당 host의 서버 취소 처리 검증은 미검증으로 남기고, 실제 Desktop에 연결한 SDK 클라이언트의 취소 전달·서버 처리 결과를 별도로 기록한다. 서버가 취소/연결 종료를 관찰한 이후의 새 조회·알림 발행·원래 작업 시작 여부로 판정하며, 이미 진행 중인 I/O의 늦은 완료·이미 발행한 알림의 늦은 화면 표시와 구분한다.

| ID | 사전 상태 | 실행 절차 | 기대 결과 |
| --- | --- | --- | --- |
| M01 | 앱 설치됨·종료 상태, 자동 프로젝트 복원 없음 | 도구 1회 호출 → 창·Renderer 기동을 관찰하되 프로젝트를 선택하지 않음 → 최종 결과 뒤 프로젝트를 선택하고 새 호출 | 첫 호출은 activation 1회 후 project_not_selected, 원래 작업 0회. 두 번째 호출은 준비된 프로젝트에서 작업 1회. 각 호출의 최종 결과를 구분 |
| M02 | 실행 중인 앱에서 테스트 프로젝트의 실제 초기화를 시작한 상태 | 프로젝트 loading 중 도구 1회 호출 → 최초 상태 조회의 loading 응답을 확인 → 추가 요청 없이 완료까지 관찰 | 전체 기한 내 ready이면 동일 호출에서 원래 작업 1회와 기준 결과 반환. 최초 조회 전에 로딩이 끝난 실행은 M09로만 기록하고 이 사례의 통과로 계산하지 않음. 종료 앱의 자동 복원은 실제 기존 기능·조건을 확인한 경우에만 별도 변형으로 수행하며 이번 기능에 자동 선택을 추가하지 않음 |
| M03 | 설치 확인은 가능하나 OS 실행 요청이 실패하는 격리 환경 / 실제로 느린 기동 환경 | 각각 도구 호출. 명령 오류 또는 기동 지연의 실제 원인을 기록 | 명령의 확인된 실패는 activation_failed. 명령 성공 후 준비가 전체 기한을 넘으면 readiness_timeout, 원래 작업 0회. 시간 초과 후 앱은 계속 기동 가능하며 crash라고 안내하지 않음 |
| M04 | 잠긴 계정 프로젝트·정리 대상 프로젝트·누락 드라이버 등 실제 모달 대기 상태 | 각 상태에서 도구 호출 → 안내 확인 → 앱에서 조치 해결 또는 드라이버 Skip → 새 호출 | 첫 호출은 실제 사유의 user_action_required, 원래 작업 0회. 해결 후 새 호출은 현재 상태로 진행. 자동 잠금이 발생한 이미 로드된 프로젝트도 동일하게 확인 |
| M05 | 기동/프로젝트 로딩 단계가 관찰되는 환경과 실제 host | 토큰 포함·미포함 변형을 확인. 별도 호출의 준비 대기 중 host 취소 → 해당 requestId의 취소 알림 또는 transport 종료가 서버에 전달·관찰된 시점 확인 | 토큰이 있으면 동일 토큰·증가 progress·동일 상태 중복 억제·최종 도구 결과 1개. 없으면 알림 없이 동일 동작. 취소를 서버가 관찰한 뒤 새 조회·알림 발행·작업을 시작하지 않고 앱은 유지. 늦은 I/O 완료와 새 실행을 구분하며 정상 최종 응답 1개를 강제하지 않음. 취소 전달 미확인은 미검증 |
| M06 | 준비 지연과 실제 작업 시간을 측정할 수 있는 테스트 프로젝트 | 읽기 도구를 호출해 준비 구간·작업 구간·host 전체 제한을 따로 측정 | 준비 20초와 기존 도구 실행 제한이 분리됨. host가 먼저 중단하면 해당 제한과 미완료 구간을 기록. 알림이 host 제한을 늘린다고 가정하지 않음 |
| M07 | 해당 profile의 앱이 없는 깨끗한 OS 환경 / 설치 정보 조회 권한 오류를 재현하는 격리 환경 | 각각 도구 1회 호출 | 확인된 미발견은 installation_not_found, 조회 오류는 installation_check_failed. 실행 명령·원래 작업 0회. 사용 중인 설치를 삭제·권한 변경해 재현하지 않음 |
| M08 | 실제 초기 동기화 실패 등 현재 프로젝트 초기화를 중단시킨 상태 | 앱 오류 화면에서 도구 호출 → 원인 해결 후 기존 앱 재시도 → 새 도구 호출 | 실패 시 project_load_failed, 원래 작업 0회. 복구 이후 과거 실패 상태가 남지 않음. 실제 재현하지 못한 저장소 오류·설정 부재 변형은 T13 결과와 별도로 미검증 표시 |
| M09 | 앱·프로젝트가 이미 준비됨. local 익명과 account 로그인 환경 각각 준비 | 도구 1회씩 호출 | 앱 실행 요청 없이 작업 1회. local은 로그인 안내 없음. 계정 인증 만료는 기존 앱 흐름에서 실제로 관찰 가능한 인증 필요 상태로 확인하며, 이미 프로젝트를 떠난 화면에 authentication_required를 강제 기대하지 않음 |
| M10 | A가 로딩 중이고 기준 결과가 확인된 B가 최근 프로젝트 메뉴에 있는 상태 | A loading 응답을 확인한 뒤 최근 프로젝트 메뉴로 대시보드를 경유하지 않고 B에 직접 전환 → 실제 관찰한 상태 전이 기록. 별도 사례는 대시보드로 이동해 not_selected 조회를 확인 | 종료 사유가 관찰되지 않고 남은 기한 내 B ready이면 B 기준 결과로 작업 1회, 변경 자체로 재요청 요구 없음, 기한 리셋 없음. not_selected 등 종료 사유를 관찰했다면 기존 종료 규칙에 따른 정상 종료로 구분. 별도 대시보드 사례는 project_not_selected와 작업 0회. A의 늦은 결과까지 관찰하지 못했으면 늦은 결과 변형은 미검증으로 남김 |
| M11 | 초기화 근거 없이 최초 상태 조회가 응답하지 않는 격리 환경 / 이번 호출에서 실행 또는 loading을 확인한 뒤 응답이 지연되는 환경 | 각각 읽기 도구 호출. 실제 디버거 일시정지 등 재현 수단·중단 지점과 시간을 기록하고 확인 후 복구 | 근거 없는 첫 timeout은 status_check_failed와 추가 재조회 0회. 근거 있는 대기는 남은 기한 내 재조회하고, 회복하면 진행·미회복이면 readiness_timeout. 두 사례 모두 원래 작업을 중복 전송하지 않음 |

실제 DB DDL/DML이 필요한 검증은 NeoSQL MCP로만 수행한다. 사용 중인 앱 강제 종료·장애 주입은 하지 않는다. 오류 재현은 격리 환경의 실제 동작으로 확인하며 제품 코드에 테스트 전용 분기·지연 옵션을 추가하지 않는다. 환경이 없어 수행하지 못한 항목은 미검증으로 남기며, 이를 통과로 취급하거나 검증 생략을 임의 확정하지 않는다.

### 실행 결과 기록 양식

구현 완료 후 각 시나리오·OS·변형별로 아래 내용을 채운다. 상세 실행 방법과 결과는 외부 MCP의 기존 `docs/e2e-manual.md`에 반영하고, 이 계획서에는 결과 위치와 완료 여부를 연결한다. 실제 재현 과정에서 동작 정책 변경이 필요하면 즉시 멈추고 사용자에게 알린다.

| 항목 | 기록 내용 |
| --- | --- |
| 식별 | 시나리오 ID·OS·profile·앱/MCP commit·host 버전·실행 일시 |
| 재현 | 사전 앱/프로젝트 상태·실제 수행 절차·요청 ID·progressToken 유무 |
| 관찰 | 실제 조회된 상태 전이·OS 실행 횟수·원래 작업 횟수·준비/작업 소요 시간·A/B 사전 기준 결과. 취소 사례는 host 클릭/취소 전달/서버 관찰 시점과 늦은 완료 여부 |
| 결과 | 최종 status 또는 원래 도구 결과, 진행 알림 wire 수신 여부와 host 표시 여부 각각 |
| 판정 | 통과 / 실패 / 미검증, 근거 로그·화면 위치, 미검증 이유·복구 여부 |

## 트러블슈팅

| 증상                                      | 확인                                                                                                                                                                                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `neosql-mcp: command not found`           | `npm link` 미실행 또는 글로벌 bin 디렉터리가 PATH에 없음 (`npm bin -g` 로 경로 확인)                                                                                                                                      |
| 옛 동작이 그대로 나옴                     | `npm run build` 누락 — dist 가 갱신되지 않은 채 실행됨                                                                                                                                                                    |
| published package가 실행되지 않음         | `npm link`가 남아 있으면 `neosql-mcp` 직접 실행이 로컬 build를 사용할 수 있음. `which neosql-mcp`로 확인하고 필요 시 `npm unlink -g neosql-mcp` 실행                                                                      |
| Inspector/클라이언트에서 응답 없이 끊김   | 로그는 stdout이 아니라 OS별 로그 파일로 나간다. macOS prod: `~/Library/Logs/NeoSqlMcp/neosql-mcp.log`, non-prod: `~/Library/Logs/NeoSqlMcp<Profile>/neosql-mcp.log`. 파일 destination 생성 실패 시에만 stderr로 fallback 된다. |
| `initialize` 실패                         | SDK 버전 불일치 가능성. `package.json` 의 `@modelcontextprotocol/sdk` 버전과 클라이언트 SDK 버전 점검                                                                                                                     |
| upstream 호출이 `ENOENT` / `ECONNREFUSED` | electron-main 미기동 또는 socket path 불일치. 동일 profile의 deterministic socket 파일/Named Pipe 존재 여부 확인. macOS 는 `ls -la <socketPath>`, Windows 는 `Get-ChildItem \\.\pipe\` 로 확인                  |
| upstream socket 직접 호출 디버깅          | macOS: `curl --unix-socket <socketPath> http://localhost/<path>`. Windows: `Invoke-WebRequest` 가 Named Pipe 미지원 → PowerShell 별도 도구 (e.g. `npipe-curl`) 사용                                                      |
