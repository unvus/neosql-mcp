# neosql-mcp 구현 계획

단계별 목표·산출물·TDD 관점 테스트 포인트·완료 조건을 정리한다.
각 Phase는 테스트가 모두 통과한 상태에서 다음 Phase로 진입한다.

> **진행 방식**: Phase 0 → 1 → 2-1 ~ 2-4 까지 먼저 완성한다. Phase 2 는 embedded-server 의 Spring AI MCP 도구를 Node MCP 로 전면 이관하는 것이 목표이며, Sub-phase 2-1(인프라+시그니처+mock) → 2-2(분석+contract) → 2-3(Node 핸들러 일괄) → 2-4(본체 HTTP tool 구현 + as-is/to-be 비교 검증) 순으로 진행한다. Phase 3 이상은 tool 이관 완료 후 운영 안정화·보안·배포 UX 범위로 재검토한다.

## 확정 사항

| 항목                  | 확정                                                                                                                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 기술 스택             | 아래 "기술 스택" 표 그대로                                                                                                                                                                                          |
| 도구 정의 위치        | **mcp Node 모듈** (기존 embedded-server 의 tool 명세를 Node 로 가져옴)                                                                                                                                              |
| upstream 채널         | **electron-main 이 호스트하는 HTTP 엔드포인트 1개** (POST 요청/응답 + GET SSE 서버 푸시). JSON-RPC over HTTP 로 메서드 분기                                                                                         |
| upstream transport    | **Unix Domain Socket (POSIX) / Named Pipe (Windows)** — TCP 포트 미사용. Node `http`/`net` 이 동일 API 로 추상화                                                                                                    |
| renderer 호출         | electron-main 이 IPC 로 위임                                                                                                                                                                                        |
| 엔드포인트 검출       | **고정 socket path 에 connect 시도** (config 파일·환경변수·프로세스 탐색 미사용). 양쪽 코드(electron-main / neosql-mcp) 가 동일 규칙으로 path 산출                                                                  |
| socket path 규칙      | POSIX: `${os.tmpdir()}/neosql-mcp${suffix}.sock` · Windows: `\\\\.\\pipe\\neosql-mcp${suffix}`. `suffix` = prod 빈 문자열 / dev `-dev`. mcp 는 `--profile <prod|dev>` CLI 인자로 profile 인지 (electron 의 dev 실행 규칙과 대칭) |
| HTTP path             | `/mcp/rpc` 고정. 양쪽 코드의 상수로 보유 (config 미저장). `/mcp/` 네임스페이스로 묶어 향후 비-RPC endpoint 또는 다른 RPC 묶음 추가 여지 확보                                                                        |
| 미설치 vs 미실행 구분 | Phase 1 에서는 합친 메시지로 처리. 정밀 구분은 후속 Phase 에서 Supabase 등 데스크톱 앱 사례 참고하여 재검토                                                                                                         |
| Phase 순서            | Phase 0 → 1 → 2-1 ~ 2-4 선행, Phase 3 이상은 9개 tool 이관 완료 후 재검토                                                                                                                                            |
| Phase 2 전략          | Node 9개 핸들러 일괄 구현(mock UDS) → 본체 HTTP method 구현 → as-is embedded-server MCP vs to-be neosql-mcp 비교 검증                                                                                               |
| 배포                  | **npm public registry** (`npx neosql-mcp`)                                                                                                                                                                          |

> 본체(electron-main / renderer) 변경은 Phase 2-4에서 진행한다. 대상은 UDS/Named Pipe HTTP 서버, renderer IPC 연결, Node MCP에서 호출하는 9개 tool 대응 HTTP method 구현이다. HTTP 메서드 명세는 Phase 2-2 의 contract 문서로 확정한다 (socket path / HTTP path 는 본 문서의 상수 규칙을 따름).

### upstream 채널을 HTTP 로 정한 근거 요약

기존 embedded-server MCP tool 들의 사용 패턴을 6 축(메시지 패턴 / push 빈도 / 격리 요구 / 장애 모델 / 세션 의미 / 응답 형태 다양성) 으로 평가했을 때, **6 항목 모두 HTTP 가 우세하거나 명확 우세**.

핵심 근거:

- 어떤 도구도 server→client push 를 사용하지 않음 (DDL approval 도 UI 측 모달).
- executeQuery / createTables / modifyTables 가 60 s timeout 의 long-running 도구 → **요청 단위 격리** 가 안전.
- `setContext`/`getContext` 가 명시적 세션 컨텍스트를 관리 → "연결=세션" 모델보다 명시적 세션 헤더가 정합.
- 응답 크기 편차가 큼 (μs 작은 JSON ~ generateCode 수십 KB) → 요청별 응답 형태 선택(단일 JSON / SSE) 이 future-proof.

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
- **Node ↔ electron-main**: 자체 RPC over HTTP, transport 는 **UDS (POSIX) / Named Pipe (Windows)**. POST 요청/응답이 기본. 서버 push 가 필요한 경우 GET SSE 채널 별도 오픈. HTTP path 하나, 그 위에서 method 로 분기 (예: `connection.list`, `sql.execute`, `ddl.requestApproval`). 메시지·메서드 정의는 도구 정의에 따라 추가. **MCP 도구 ↔ HTTP 메서드는 1:1 매핑이 보장되지 않는다** — 핸들러가 여러 HTTP 메서드를 조합하거나 단순 forward 하는 형태가 도구별로 혼합될 수 있다.
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
- 통신 계층 정리: `docs/통신 스택 계층 (RPC vs Transport).md`

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
  - dev (로컬 개발): `-dev`
  - mcp 는 `--profile dev` CLI 인자로 profile 인지. electron 도 dev 실행 시 동일 suffix 로 listen 한다는 전제 (본체 작업 시 확정).

### 산출물

- `endpointResolver` 모듈
  - profile (prod / dev) → socket path 산출.
  - HTTP path 상수 (`/mcp/rpc`) 보유.
- `healthCheck` 모듈: 산출된 socket path 로 connect 시도. 결과:
  - `running`: connect 성공.
  - `not_running`: socket 부재 (POSIX `ENOENT` / Windows pipe 부재).
  - `stale_socket`: `ECONNREFUSED` (POSIX 비정상 종료 후 socket file 잔존). Windows Named Pipe 는 OS 가 auto-cleanup 하므로 N/A.

### 테스트 (TDD)

- prod / dev profile 각각 OS 별 path 산출이 정확.
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

### 이관 대상 도구 (9개 / 5 카테고리)

`~/workspace/neosql/embedded-server/src/main/java/com/unvus/neosql/embedded/mcp/tool/` 기준.

| 카테고리        | 파일                       | 도구                                         |
| --------------- | -------------------------- | -------------------------------------------- |
| Code Generation | `CodeGenerationTools.java` | `generateCode`                               |
| Schema          | `SchemaTools.java`         | `listTables`, `getTableDetails`              |
| Context         | `ContextTools.java`        | `setContext`, `getContext`, `getContextHelp` |
| DDL             | `DdlTools.java`            | `createTables`, `modifyTables`               |
| SQL             | `SqlTools.java`            | `executeQuery`                               |

### 구현 전략

Node 측 9개 핸들러를 일괄 구현(mock UDS 대상)한 뒤, Phase 2-4에서 본체 HTTP method 구현과 as-is/to-be 비교 검증을 도구별로 진행한다.

근거:

- Node 핸들러는 인자 검증 → upstream RPC 호출 → 응답 포매팅의 얇은 wrapper. 9개 일괄 구현 부담 적음.
- Electron 측은 HTTP 서버 부팅·공용 IPC·세션·에러 매핑 등 공유 인프라 비중이 커서 Phase 2 안에서 공통 인프라와 tool method 구현을 이어서 처리하는 게 효율적.
- 도구 단위 양쪽 동시(Option B) 는 cross-repo PR 페어가 5회 발생 — 1인 작업 흐름에 비효율.

### Sub-phase 구조

| Sub-phase | 산출                                                                                                                  | 본체 변경      |
| --------- | --------------------------------------------------------------------------------------------------------------------- | -------------- |
| **2-1**   | 채널 인프라(`httpClient` + SSE 파서 + error-map) + 9개 도구 시그니처 + mock UDS 라운드트립 테스트                     | 없음           |
| **2-2**   | Java tool 5개 파일 분석 → 분석 문서 + 도구별 Node/Electron 분할 결정 + upstream RPC contract 문서 + 도구별 체크리스트 | 없음           |
| **2-3**   | Node 핸들러 9개 실 구현 (Phase 2-2 contract 기반, mock UDS 대상 e2e green)                                            | 없음           |
| **2-4**   | 본체 UDS/Named Pipe HTTP 서버 + renderer IPC 연결 + 9개 tool HTTP method 구현 + as-is/to-be 비교 검증                 | 있음           |

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
- Phase 2-2 완료: `docs/embedded-server-tool-analysis.md` + `docs/upstream-rpc-contract.md` + 도구별 체크리스트 작성.
- Phase 2-3 완료: 9개 Node 핸들러가 contract 기반으로 mock UDS 라운드트립 green.
- Phase 2-4 완료: 9개 tool 이 real electron-main 환경에서 as-is embedded-server MCP 대비 응답 정합성 비교 검증을 통과.
- Phase 2-4 종료 시점에 **Phase 3 이상 범위·우선순위 재검토** (운영 안정화·보안·배포 UX·multi-instance 등).

---

## Phase 3 이상 (tool 이관 완료 후 구체화)

Phase 2-4에서 9개 tool의 본체 HTTP method 구현과 as-is/to-be 비교 검증까지 완료한 뒤, 아래 항목의 범위·우선순위·방식을 재검토한다.

- **electron-app 실행 상태 확인·자동 기동** — Desktop 이 꺼진 상태에서 MCP 요청 시 어떻게 처리할지.
- **electron-app 설치 여부 확인·설치 안내 또는 자동 설치** — 미설치 사용자 UX. "미설치" vs "미실행" 정밀 구분 (Supabase 등 데스크톱 앱 사례 참고).
- **multi-instance 처리** — 여러 npx 클라이언트가 동시에 같은 socket 에 접속하는 경우 인증·세션·격리 정책 (요청 단위 헤더 기반 식별). UDS/Named Pipe 자체는 N:1 multi-connection 을 표준 지원 (POC 검증 완료).
- **Windows Named Pipe 보강** — POSIX `chmod 0600` 와 동등한 권한 격리를 위해 win32 native 호출로 ACL 적용 (본체 작업 시 진행).
- **인증·권한** — JWT/OAuth 처리, projectId 별 권한 체크 위치.
- **안정화·UX** — 구조화 로그 확장, CLI 옵션, lazy launch, E2E 시나리오 테스트.
