# neosql-mcp 구현 계획

단계별 목표·산출물·TDD 관점 테스트 포인트·완료 조건을 정리한다.
각 Phase는 테스트가 모두 통과한 상태에서 다음 Phase로 진입한다.

> **진행 방식**: Phase 0 → 1 → 2-1 ~ 2-4 까지 먼저 완성한다. Phase 2 는 embedded-server 의 Spring AI MCP 도구를 Node MCP 로 전면 이관하는 것이 목표이며, Sub-phase 2-1(인프라+시그니처+mock) → 2-2(분석+contract) → 2-3(Node 핸들러 일괄) → 2-4(본체 HTTP tool 구현 + as-is/to-be 비교 검증) 순으로 진행한다. Phase 3 은 Desktop lifecycle UX 를 구체화하고, 3-1(미실행 감지와 app activation request) → 3-2(미설치 감지·설치 안내) 순으로 진행한다.

## 확정 사항

| 항목                  | 확정                                                                                                                                                            |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 기술 스택             | 아래 "기술 스택" 표 그대로                                                                                                                                      |
| 도구 정의 위치        | **mcp Node 모듈** (기존 embedded-server 의 tool 명세를 Node 로 가져옴)                                                                                          |
| upstream 채널         | **electron-main 이 호스트하는 HTTP 엔드포인트 1개** (POST 요청/응답 + GET SSE 서버 푸시). JSON-RPC over HTTP 로 메서드 분기                                     |
| upstream transport    | **Unix Domain Socket (POSIX) / Named Pipe (Windows)** — TCP 포트 미사용. Node `http`/`net` 이 동일 API 로 추상화                                                |
| renderer 호출         | electron-main 이 IPC 로 위임                                                                                                                                    |
| 엔드포인트 검출       | **고정 socket path 에 connect 시도** (config 파일·환경변수·프로세스 탐색 미사용). 양쪽 코드(electron-main / neosql-mcp) 가 동일 규칙으로 path 산출              |
| socket path 규칙      | POSIX: `${os.tmpdir()}/neosql-mcp${suffix}.sock` · Windows: `\\\\.\\pipe\\neosql-mcp${suffix}`. `suffix` = prod 빈 문자열 / 그 외 `-${profile}`. mcp 는 `--profile=<prod|dev|local|stage>` CLI 인자로 profile 인지 |
| HTTP path             | `/mcp/rpc` 고정. 양쪽 코드의 상수로 보유 (config 미저장). `/mcp/` 네임스페이스로 묶어 향후 비-RPC endpoint 또는 다른 RPC 묶음 추가 여지 확보                    |
| 미설치 vs 미실행 구분 | Phase 1 에서는 합친 메시지로 처리. Phase 3 에서 `not_running` / `stale_socket` / `not_installed` 를 사용자-facing UX 로 구분                                    |
| Phase 순서            | Phase 0 → 1 → 2-1 ~ 2-4 선행, Phase 3 은 Desktop lifecycle UX, Phase 4 이상은 운영 안정화·보안·배포 UX 재검토                                                   |
| Phase 2 전략          | Node core 핸들러 일괄 구현(mock UDS) → 본체 HTTP method 구현 → as-is embedded-server MCP vs to-be neosql-mcp 비교 검증                                         |
| 배포                  | **npm public registry** (`npx neosql-mcp`)                                                                                                                      |

> 본체(electron-main / renderer) 변경은 Phase 2-4에서 진행한다. 대상은 UDS/Named Pipe HTTP 서버, renderer IPC 연결, Node MCP에서 호출하는 9개 tool 대응 HTTP method 구현이다. HTTP 메서드 명세는 Phase 2-2 의 contract 문서로 확정한다 (socket path / HTTP path 는 본 문서의 상수 규칙을 따름).

### upstream 채널을 HTTP 로 정한 근거 요약

기존 embedded-server MCP tool 들의 사용 패턴을 6 축(메시지 패턴 / push 빈도 / 격리 요구 / 장애 모델 / 세션 의미 / 응답 형태 다양성) 으로 평가했을 때, **6 항목 모두 HTTP 가 우세하거나 명확 우세**.

핵심 근거:

- 어떤 도구도 server→client push 를 사용하지 않음 (DDL approval 도 UI 측 모달).
- execute-query / erd-create-tables / erd-modify-tables 가 60 s timeout 의 long-running 도구 → **요청 단위 격리** 가 안전.
- 명시적 context payload 와 session id 를 분리해 전달하는 모델이 "연결=세션" 모델보다 정합.
- 응답 크기 편차가 큼 (μs 작은 JSON ~ 향후 code generation 수십 KB) → 요청별 응답 형태 선택(단일 JSON / SSE) 이 future-proof.

WS 가 우세해질 시점(진행 알림·취소·서버 발신 이벤트 일상화) 이 오면 SSE 채널로 흡수 가능.

### transport 를 UDS / Named Pipe 로 정한 근거 요약

TCP loopback 대신 **Unix Domain Socket (POSIX) / Named Pipe (Windows)** 를 채택. protocol(JSON-RPC over HTTP) 결정은 그대로 유지하고 transport 레이어만 교체.

이유:

- **포트 충돌·방화벽 회피**: 동적 포트 관리, 사용자 보안 SW 의 loopback 차단 가능성 등에서 자유.
- **외부 노출 0**: TCP loopback 도 외부 접근은 막혀있지만 listen 자체는 보임. UDS/Named Pipe 는 OS 레벨에서 file path / pipe name 으로 격리 (POSIX 는 `chmod 0600` 으로 동일 호스트 내 다른 사용자도 차단 가능).
- **Node 표준 API 동일 추상화**: `http.createServer().listen(socketPath)` / `http.request({ socketPath })` 로 두 OS 모두 동일하게 처리. 코드 분기는 socket path 결정만.
- **POC 실측 통과**: macOS 환경에서 S1 (POST/JSON 왕복) / S2 (SSE 5 이벤트) / S3 (3 client × 100 round-trip) 모두 PASS. POC 산출물은 `poc/` 디렉토리 (gitignore).

비용:

- POSIX 는 비정상 종료 시 socket file 잔존 → 본체 기동 시 unlink 필수 (Windows Named Pipe 는 OS 자동 cleanup).
- POSIX 는 `chmod 0600`, Windows 는 Named Pipe ACL 별도 적용 (Node 표준 API 미제공, win32 native 처리 필요) — 본체 작업 시 보강.
- POSIX `sun_path` 길이 제한 (~104 byte) 회피 위해 socket path 는 `os.tmpdir()` 등 짧은 위치에 둠.

## 기술 스택

| 항목                | 선택                                                                                                                                | 선택 이유                                                                                                                                                          |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 런타임              | **Node 20+**                                                                                                                        | MCP SDK 최소 요구. `http`/`net` 모듈이 UDS/Named Pipe 를 표준 지원.                                                                                                |
| 언어                | **TypeScript** (strict)                                                                                                             | MCP SDK 자체가 TS·타입 완비.                                                                                                                                       |
| MCP SDK             | **`@modelcontextprotocol/sdk` v1**                                                                                                  | 공식. stdio Server transport + 도구 정의 모델을 그대로 사용. v2는 pre-alpha.                                                                                       |
| 테스트              | **Vitest**                                                                                                                          | TS 네이티브, ESM 친화, mock API 내장.                                                                                                                              |
| 빌드                | **tsup**                                                                                                                            | esbuild 기반. `bin` 진입점 번들링 → `npx neosql-mcp` 배포 적합.                                                                                                    |
| HTTP/SSE 클라이언트 | **Node 내장 `http.request({ socketPath })` + 자체 SSE 파서**, 또는 `undici` 패키지의 `Agent({ connect: { socketPath } })` + `fetch` | 글로벌 `fetch` 는 dispatcher 옵션 미지원이라 UDS/Named Pipe 사용 불가. 의존성 0 인 `http` 모듈 직접 사용이 기본, ergonomics 가 필요하면 `undici` 패키지 명시 설치. |
| Lint/Format         | **ESLint + Prettier**                                                                                                               | 생태계 성숙.                                                                                                                                                       |
| 로깅                | **pino (stderr)**                                                                                                                   | MCP 는 stdout 이 JSON-RPC → **로그는 반드시 stderr**.                                                                                                              |
| 배포                | npm publish (`bin: neosql-mcp`)                                                                                                     | `npx neosql-mcp` 실행                                                                                                                                              |

### 아키텍처 개념도

```
[mcp-client] ── stdio ──▶ [neosql-mcp (Node)] ── HTTP+SSE over UDS/Named Pipe ──▶ [electron-main] ── IPC ──▶ [electron-renderer]
              JSON-RPC                          JSON-RPC                                                  method invocation
              (MCP)                             (neosql 자체 RPC)

  Node 내부:
    ├─ MCP Server (StdioServerTransport)
    ├─ Tools 카탈로그 + 핸들러 (도구 정의 보유)
    └─ neosql RPC client (http.request({ socketPath, ... }) + SSE)
```

- **클라이언트 ↔ Node**: MCP 표준 (JSON-RPC over stdio). MCP Server SDK 가 처리.
- **Node ↔ electron-main**: 자체 RPC over HTTP, transport 는 **UDS (POSIX) / Named Pipe (Windows)**. POST 요청/응답이 기본. 서버 push 가 필요한 경우 GET SSE 채널 별도 오픈. HTTP path 하나, 그 위에서 method 로 분기 (예: `list-connections`, `execute-query`, `erd-create-tables`). 메시지·메서드 정의는 도구 정의에 따라 추가. **MCP 도구 ↔ HTTP 메서드는 1:1 매핑이 보장되지 않는다** — 핸들러가 여러 HTTP 메서드를 조합하거나 단순 forward 하는 형태가 도구별로 혼합될 수 있다.
- **electron-main ↔ renderer**: 기존 IPC. main 의 핸들러가 받은 메서드 중 renderer 데이터·UI 가 필요한 것은 IPC 로 위임, main 안에서 끝나는 것은 직접 처리.
- **도구 카탈로그는 Node 가 보유**. 클라이언트가 `tools/list` 를 요청하면 Node 가 자체 카탈로그로 응답. `tools/call` 시 Node 의 핸들러가 실행되며 필요에 따라 HTTP 메서드를 호출.

### 참고 링크

- MCP 스펙: https://modelcontextprotocol.io/specification/latest
- MCP 문서: https://modelcontextprotocol.io/docs
- TS SDK GitHub: https://github.com/modelcontextprotocol/typescript-sdk
- TS SDK API (v1): https://modelcontextprotocol.github.io/typescript-sdk/
- Server 가이드: https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md
- Transport 스펙: https://modelcontextprotocol.io/specification/2025-03-26/basic/transports
- npm: https://www.npmjs.com/package/@modelcontextprotocol/sdk
- 통신 계층 정리: `docs/research/rpc-vs-transport.md`

---

## Phase 0 · 프로젝트 부트스트랩 — 완료

`npx neosql-mcp` 가 실행되는 최소 MCP 서버 스켈레톤 확보 완료. 산출물·테스트 결과는 `CHECKLIST.md` Phase 0 섹션 참조.

---

## Phase 1 · electron-main 엔드포인트 검출 (고정 socket path)

**목표**: 고정 규칙으로 산출한 socket path 에 connect 를 시도해 neosql Electron 앱이 실행 중인지 판정한다. config 파일·환경변수·프로세스 탐색은 사용하지 않는다.

### 경로 산출 규칙

- **POSIX**: `path.join(os.tmpdir(), 'neosql-mcp' + suffix + '.sock')`
  - macOS / Windows 의 `os.tmpdir()` 은 OS 가 이미 user-isolated 경로를 반환 (`/var/folders/.../T/`, `%TEMP%`).
  - Linux `os.tmpdir()` 이 공유 `/tmp` 일 경우의 보정은 본체 작업 시 결정 (XDG_RUNTIME_DIR 또는 `${HOME}/.cache/neosql/` 등).
- **Windows**: `\\.\pipe\neosql-mcp` + suffix
- `suffix` (profile 구분):
  - prod (npm 배포본): 빈 문자열
  - non-prod: `-${profile}` (`-dev`, `-local`, `-stage`)
  - mcp 는 `--profile=<prod|dev|local|stage>` CLI 인자로 profile 인지. electron 도 해당 profile 실행 시 동일 suffix 로 listen 한다는 전제 (본체 작업 시 확정).

### 산출물

- `endpointResolver` 모듈
  - profile (prod, dev, local, stage) → socket path 산출.
  - HTTP path 상수 (`/mcp/rpc`) 보유.
- `healthCheck` 모듈: 산출된 socket path 로 connect 시도. 결과:
  - `running`: connect 성공.
  - `not_running`: socket 부재 (POSIX `ENOENT` / Windows pipe 부재).
  - `stale_socket`: `ECONNREFUSED` (POSIX 비정상 종료 후 socket file 잔존). Windows Named Pipe 는 OS 가 auto-cleanup 하므로 N/A.

### 테스트 (TDD)

- prod, dev, local, stage profile 각각 OS 별 path 산출이 정확.
- mock listener listen 중 → `running`.
- listener 없음 (file / pipe 부재) → `not_running`.
- POSIX: socket file 잔존 + listener 없음 → `stale_socket`.
- (Windows 환경 테스트는 CI 단계에서 추가 — 단위 테스트는 path 산출까지 검증).

### 본체 작업 분리

- electron-main 의 socket listen / 종료 시 unlink / 권한 적용 등 lifecycle 은 **본 리포 범위 밖**.
- Phase 1 의 단위·통합 테스트는 mock UDS / Named Pipe listener 로 검증.

### 완료 조건

- mock listener 환경에서 `running` 판정 성공.
- listener 없음 환경에서 명확한 에러 메시지 노출 ("NeoSQL Desktop 실행중이지 않습니다.").
- "앱 미설치 vs 미실행" 정밀 구분은 본 Phase 의 범위가 아님 → 후속 Phase 로 이월.

---

## Phase 2 · embedded-server MCP 도구 Node 이관

**목표**: neosql 본체 `embedded-server` 의 Spring AI MCP 도구를 Node MCP 로 전면 이관한다. 최종 구조는 `mcp client (stdio) → neosql-mcp (Node) → UDS → electron-main → renderer` 이고, 본 Phase 완료 후 본체의 Spring AI MCP 는 사용하지 않는다.

### 이관 대상 도구

`~/workspace/neosql/embedded-server/src/main/java/com/unvus/neosql/embedded/mcp/tool/` 기준.

| 카테고리        | 파일                       | 도구                                         |
| --------------- | -------------------------- | -------------------------------------------- |
| Code Generation | `CodeGenerationTools.java` | `generate-code`                              |
| Schema          | `SchemaTools.java`         | `list-tables`, `get-table-details`           |
| Context         | `ContextTools.java`        | `get-context-help`                           |
| ERD             | 기존 `DdlTools.java` 입력 계약 | `erd-create-tables`, `erd-modify-tables`  |
| SQL             | `SqlTools.java`            | `execute-query`                              |

### 구현 전략

Node 측 핸들러를 일괄 구현(mock UDS 대상)한 뒤, Phase 2-4에서 본체 HTTP method 구현과 as-is/to-be 비교 검증을 도구별로 진행한다.

근거:

- Node 핸들러는 인자 검증 → upstream RPC 호출 → 응답 포매팅의 얇은 wrapper. 9개 일괄 구현 부담 적음.
- Electron 측은 HTTP 서버 부팅·공용 IPC·세션·에러 매핑 등 공유 인프라 비중이 커서 Phase 2 안에서 공통 인프라와 tool method 구현을 이어서 처리하는 게 효율적.
- 도구 단위 양쪽 동시(Option B) 는 cross-repo PR 페어가 5회 발생 — 1인 작업 흐름에 비효율.

### Sub-phase 구조

| Sub-phase | 산출                                                                                                                  | 본체 변경 |
| --------- | --------------------------------------------------------------------------------------------------------------------- | --------- |
| **2-1**   | 채널 인프라(`httpClient` + SSE 파서 + error-map) + 9개 도구 시그니처 + mock UDS 라운드트립 테스트                     | 없음      |
| **2-2**   | Java tool 5개 파일 분석 → 분석 문서 + 도구별 Node/Electron 분할 결정 + upstream RPC contract 문서 + 도구별 체크리스트 | 없음      |
| **2-3**   | Node 핸들러 9개 실 구현 (Phase 2-2 contract 기반, mock UDS 대상 e2e green)                                            | 없음      |
| **2-4**   | 본체 UDS/Named Pipe HTTP 서버 + renderer IPC 연결 + 9개 tool HTTP method 구현 + as-is/to-be 비교 검증                 | 있음      |

각 sub-phase 시작 시 `docs/testing.md` 워크플로(test list 제안 → 사람 리뷰 → red → impl → green) 준수.

### 채널 인프라 상세 (Phase 2-1 범위)

- `httpClient` 모듈 — Node 내장 `http.request({ socketPath, ... })` 기반. Phase 1 의 `endpointResolver` 결과 사용. JSON-RPC over HTTP — POST 가 기본, 서버 push 메서드는 GET SSE 채널. 요청 단위 timeout, SSE 끊김 시 `Last-Event-ID` 로 재개.
- SSE 파서 모듈 — `\n\n` 블록 단위, 멀티라인 `data:` 누적, `:` comment 무시.
- error-map 모듈 — HTTP 4xx/5xx / 타임아웃 / `ENOENT`/`ECONNREFUSED`/`ENOTSOCK` / JSON-RPC `error` → MCP `tools/call` 에러 응답.

### 본체 작업 분리

- Phase 2-1 ~ 2-3: electron-main / renderer 변경 없음. 단위·통합 테스트는 mock UDS 서버로 검증.
- Phase 2-4: 본체 변경 도입. 대상은 UDS listen + `chmod 0600` + stale unlink + dev/prod suffix + `/mcp/rpc` dispatcher + renderer IPC 연결 + 9개 tool 대응 HTTP method 구현.

### 완료 조건

- Phase 2-1 완료: mock UDS 서버 환경에서 stdio 클라이언트가 9개 도구 호출 왕복 성공.
- Phase 2-2 완료: Java tool 분석 + `docs/upstream-rpc-contract.md` + 도구별 체크리스트 작성.
- Phase 2-3 완료: 9개 Node 핸들러가 contract 기반으로 mock UDS 라운드트립 green.
- Phase 2-4 완료: 9개 tool 이 real electron-main 환경에서 as-is embedded-server MCP 대비 응답 정합성 비교 검증을 통과.
- Phase 2-4 종료 시점에 **Phase 3 Desktop lifecycle UX 착수 여부 재검토**. Phase 3 이후
  운영 안정화·보안·배포 UX·multi-instance 범위는 별도 Phase 로 재정렬한다.

---

## Cross-cutting · Active project runtime context migration

NeoSQL runtime context의 원본은 MCP client나 Node process가 아니라 NeoSQL Desktop의
현재 활성 프로젝트다. 상위 cross-repo 계약은 NeoSQL 본체의
`docs/plan/mcp-runtime-context.html`을 기준으로 하고, 이 저장소는 아래 Node 경계를
소유한다.

- 공개 MCP client config는 `npx -y neosql-mcp`만 포함하는 universal config다.
- `--project`, `--default-connection`, `--default-database`, `--default-schema`는 기존
  설정 기동 호환을 위해 오류·경고 없이 무시한다.
- Node는 project/default context store를 보유하거나 좌표를 병합하지 않는다.
- DB 도구는 `connectionId`, `database`, `schema`를 모두 명시하거나 모두 생략한다.
  `database: null`은 database 계층이 없는 DBMS의 유효한 명시 값이다.
- 좌표는 도구 입력의 존재 여부를 유지해 upstream `params.input`으로 전달한다.
  Electron main은 이전 Node 버전을 위해 `params.context` fallback을 유지하지만 새 Node는
  이를 보내지 않는다.
- 전체 생략 좌표는 Renderer가 활성 프로젝트의 enabled Default로 해석한다. 일부 명시,
  Default 없음, 중복/손상 Default, 존재하지 않거나 허용되지 않은 명시 좌표는 Renderer의
  공통 검증에서 실패한다.
- `list-connections`는 현재 활성 프로젝트의 MCP-enabled 좌표를 찾는 선택적 탐색
  도구다.
- `project-not-selected`는 Renderer가 현재 locale로 만든 message를 Node가 변형하지 않고
  반환한다.

Node와 Electron의 정확한 wire shape는 `docs/upstream-rpc-contract.md`, legacy CLI 동작은
`docs/mcp-client-config.md`, 진행 상태는 `CHECKLIST.md`를 각각 단일 진실의 원천으로 삼는다.

---

## Phase 3 · Desktop lifecycle UX

**목표**: `neosql-mcp` 사용자가 NeoSQL Desktop 실행 여부 때문에 막히는 상황을
MCP tool 흐름 안에서 진단하고, Desktop 이 꺼져 있으면 실행을 요청할 수 있게 한다.
`neosql-mcp` 는 Electron app 을 직접 소유하지 않고, 요청 시점 실행 상태 확인·미실행 시
OS-level app activation request·설치 안내·프로젝트 준비 대기와 진행 알림을 담당한다.

### Phase 3 진행 원칙 (2026-09-15 갱신)

앱 준비 대기·진행 알림 설계로 기존 activation 직후 반환 정책을 대체한다.
사용자 상태/메시지의 SSOT는 본체 `docs/plan/mcp-startup-progress.html`,
기술 계약은 같은 디렉터리의 `mcp-startup-progress-implementation.md` §4다.
본체 W1·W2 검토 통과본은 `2ffef514d`이며 외부 MCP의 구현/검증 기록은
`docs/mcp-startup-progress-completion.md`를 따른다. 실제 Desktop W5는 별도 검증이다.

- `callUpstreamTool()` → `ensureDesktopReady()`에서 내부 `get-runtime-status`를 조회한다.
  GET health의 HTTP 응답만으로 준비 완료를 판단하지 않는다.
- 최초 확인부터 전체 20초, 조회마다 최대 1초, 조회 종료 후 0.5초 간격을 사용한다.
  설치 조회·OS 실행 명령·HTTP·진행 알림도 같은 기한과 취소 신호를 따른다.
- 연결 부재이면 설치 검사 후 0.5초 뒤 재확인한다. 여전히 연결 부재일 때만 OS 실행을
  호출당 1회 요청한다. macOS `open`, Windows `cmd /c start`의 exit 0을 관찰한다.
- 이번 호출에서 실행 전달 완료 또는 Renderer/project loading을 관찰했을 때만
  연결 부재·HTTP/IPC timeout을 재조회한다. 근거 없는 timeout이나 명확한 통신 오류는
  `status_check_failed`, 전체 기한 소진은 `readiness_timeout`이다.
- 매 조회의 현재 프로젝트를 따른다. 프로젝트 변경으로 기한을 갱신하거나 처음 프로젝트에
  작업을 고정하지 않는다. ready 뒤 취소·기한을 다시 검사하고 원 작업을 최대 1회 보낸다.
- 설치 미발견과 조회 오류를 구분한다. Windows `reg query` 실패만으로 키 부재를
  확정하지 않고 .NET registry 조회의 null 결과로 확인한다. 미지원 OS는 기존
  `not_checked`를 유지하고 공통 경로에서 설치 확인 실패로 안내한다.
- 토큰이 있으면 상태 전이 시 영어 progress를 전송한다. 토큰 0을 보존하고 total을
  보내지 않는다. 알림 실패는 원 작업을 실패시키지 않으며 취소 뒤 새 작업을 시작하지 않는다.
- 준비 종료만 `status/message/nextAction/requestSent=false` 네 필드로 반환한다.
  전송 후 오류·method별 실행 timeout은 기존 처리대로 유지하고 자동 재전송하지 않는다.
- deterministic UDS/Named Pipe endpoint와 Electron singleton은 유지한다.
  자동 설치·프로젝트 선택·로그인·공유 실행 제어·TCP·전송 후 취소 확장은 범위 밖이다.

아래 Phase 3-1/3-2는 최초 구현 이력이다. 준비 결과 형식·재조회·설치 조회 오류에 관한
이전 설명과 충돌하면 위 갱신 정책 및 현재 RPC 계약을 우선한다.

### Phase 3-1 · 미실행 감지와 app activation request

**목표**: 모든 upstream 의존 tool 이 원 요청 실행 전에 동일한 Desktop 실행 상태 확인
흐름을 거치게 한다. `ensureDesktopReady()` 가 `not_running` 또는 `stale_socket` 을
확인하면 OS-level app activation request 를 보내고, 원 요청은 실행하지 않은 채 activation
요청 결과를 반환한다.

산출물:

- health check 상태 정책: `running`, `not_running`, `stale_socket`, `timeout`,
  `app_not_ready`.
- `timeout` 을 미실행으로 간주하지 않는 error/result mapping.
- upstream 의존 tool 공통 wrapper 또는 `postRpc` 진입 전 실행 상태 확인 경계.
- `running` 에서만 원 요청을 실행하고, activation request 를 보낸 경우에는 원 요청을
  실행하지 않는 control flow.
- OS 별 app activation request 모듈.
  - macOS: 설치된 `.app` 또는 `open -a NeoSQL` / `NeoSQLDev` 계열 검토.
  - Windows: 설치된 exe 또는 `cmd /c start` 계열 검토.
  - Linux: 설치된 executable / AppImage 등 배포 방식 확인 후 결정.
- 결과 상태: `activation_requested`, `unresponsive` 등. 정밀 `not_installed` 판정은
  Phase 3-2 범위로 둔다.
- stale POSIX socket 과 listener 부재의 사용자-facing UX 통합, 로그/진단 구분 유지.
- MCP host 별 수동 UX 확인 절차 (`docs/e2e-manual.md` 확장).

완료 조건:

- upstream 의존 tool 이 `ensureDesktopReady()` 에서 `running` 을 확인한 뒤에만 upstream RPC 를 호출한다.
- `running` 은 바로 원 요청 실행으로 이어진다.
- `timeout` 은 activation request 로 이어지지 않고 unresponsive/timeout 응답으로 종료된다.
- 이미 upstream 에 전달된 요청의 timeout 은 자동 재시도하지 않는다.
- `not_running` / `stale_socket` 에서 OS-level app activation request 를 보낸다.
- activation request 를 보낸 경우 원 tool 요청은 실행하지 않고 `activation_requested`
  계열 응답을 반환한다.

### Phase 3-2 · 미설치 감지와 설치 안내

**목표**: NeoSQL Desktop 이 설치되지 않은 상태를 미실행 상태와 구분하고, 사용자가 설치를
완료할 수 있는 안내를 제공한다.

이번 단계의 설치 판별은 macOS 와 Windows 에 적용한다. Windows 는 portable 배포를
지원하지 않고 `.exe` NSIS installer 설치만 지원하므로, 설치 위치 스캔 대신 HKCU
Uninstall registry 를 기준으로 판별한다. Linux 는 현재 범위에서 제외한다.

산출물:

- OS 별 설치 위치 탐색 정책.
  - macOS prod: `/Applications/NeoSQL.app/Contents/MacOS/NeoSQL`,
    `~/Applications/NeoSQL.app/Contents/MacOS/NeoSQL`
  - macOS non-prod: `/Applications/NeoSQL<Profile>.app/Contents/MacOS/NeoSQL<Profile>`,
    `~/Applications/NeoSQL<Profile>.app/Contents/MacOS/NeoSQL<Profile>`
  - macOS 에서 기본 위치에 앱이 없으면 NeoSQL Desktop 이 시작 시 기록하는
    `~/.{packageName}/mcp-config.json` 의 `appPath` 를 fallback hint 로 사용한다.
    `packageName` 은 custom URL scheme 과 동일하게 prod 는 `neosql`, non-prod 는
    `neosql-<profile>` 이다. record 는 hint 이므로 실제 `.app` bundle 또는 executable
    존재를 파일시스템으로 검증한다.
  - Windows: `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\<guid>`
    registry. `<guid>` 는 electron-builder NSIS 규칙인
    `UUIDv5(appId, 50e065bc-3134-11e6-9bab-38c9862bdaf3)` 로 산출한다.
    HKLM/WOW6432Node fallback 은 두지 않는다. 향후 본체 installer 가 perMachine 으로
    바뀌면 그 변경과 같은 작업 단위에서 MCP 도 HKLM 기준으로 확장한다.
- profile 기반 product name, app id, custom URL scheme 기준 정리.
  - prod: `NeoSQL`, `com.unvus.neosql`, `neosql://`
  - non-prod: `NeoSQL<CapitalizedProfile>`, `com.unvus.neosql.<profile>`,
    `neosql-<profile>://`
  - 현재 neosql main app 이 prod/dev 산출물만 빌드하더라도 MCP activation target 은
    profile 을 그대로 반영한다. local/stage 실행 시 dev app 으로 fallback 하지 않고,
    해당 profile 앱을 찾지 못하면 명확히 실패해야 한다.
- 미설치 시 다운로드/설치 안내 메시지와 설치 안내 링크.
  - 설치 안내: `https://neosql.unvus.com/ko/docs/install`
- 자동 다운로드/설치 여부는 별도 결정 전까지 범위 밖으로 둔다. 현재는 MCP 응답에
  설치 안내 링크만 제공한다.

완료 조건:

- 미설치와 미실행을 사용자-facing 응답에서 구분한다.
- macOS 에서 기본 설치 위치와 `mcp-config.json` record 경로 모두에서 실행 파일을 찾지
  못하면 원 tool 요청과 activation request 를 실행하지 않고 `not_installed` 응답을
  반환한다.
- Windows 에서 HKCU Uninstall registry 가 없거나 registry 의 `DisplayIcon` 실행 파일을
  확인할 수 없으면 원 tool 요청과 activation request 를 실행하지 않고 `not_installed`
  응답을 반환한다.

## Phase 4 이상 (Phase 3 이후 재정렬)

- **multi-instance 처리** — 여러 npx 클라이언트가 동시에 같은 socket 에 접속하는 경우 인증·세션·격리 정책 (요청 단위 헤더 기반 식별). UDS/Named Pipe 자체는 N:1 multi-connection 을 표준 지원 (POC 검증 완료).
- **Windows Named Pipe 보강** — POSIX `chmod 0600` 와 동등한 권한 격리를 위해 win32 native 호출로 ACL 적용 (본체 작업 시 진행).
- **인증·권한** — JWT/OAuth 처리, projectId 별 권한 체크 위치.
- **안정화·UX** — 구조화 로그 확장, CLI 옵션, lazy launch, E2E 시나리오 테스트.


## Optional project targeting · 2026-09-20

The active-project policy above remains the default when `--project-id` is absent.
When present, project tools share startup's 20-second budget for one internal
`open-project` RPC, target readiness polling, and the pre-dispatch check. Every
operation carries `context.expectedProjectId`; Desktop rejects mismatches. No public
tool arguments, automatic retry, UI, or initialization lifecycle changes are added.

[Approved design](../neosql/docs/plan/mcp-project-targeting.html) and
[implementation / verification](../neosql/docs/plan/mcp-project-targeting-implementation.md)
record the cross-repo contract. CLI details: [internal configuration](docs/mcp-client-config.md).
