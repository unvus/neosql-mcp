# 개발 체크리스트

Phase별 세부 작업 상태. Phase마다 섹션을 추가·갱신한다.

| 문서                     | 역할                                             |
| ------------------------ | ------------------------------------------------ |
| `PLAN.md`                | 전략·설계·아키텍처 결정 (안정적, 드물게 바뀜)    |
| `CHECKLIST.md` (이 문서) | Phase별 작업 체크박스 (세션 간 영속적 진척 기록) |
| 에이전트 TaskCreate      | 세션 내 휘발성 트래킹                            |

---

## Phase 0 · 프로젝트 부트스트랩 — 완료 (2026-04-24)

- [x] `package.json` (name `neosql-mcp`, bin, Node 20+, ESM)
- [x] TypeScript (strict, NodeNext) + tsup 빌드
- [x] Vitest 구성
- [x] ESLint + Prettier
- [x] `pino` → stderr 로거 (`src/logger.ts`)
- [x] ping 툴 (`src/tools/ping.ts`)
- [x] MCP 서버 팩토리 (`src/server.ts`)
- [x] CLI 진입점 (`src/cli.ts`, shebang 포함)
- [x] 단위 테스트: InMemoryTransport 로 tools/list, ping 응답 (`src/server.test.ts`, 2건)
- [x] 통합 테스트: dist/cli.js spawn (`src/cli.spawn.test.ts`, 1건)
- [x] `npm pack --dry-run` 배포 패키지 검증
- [x] `npm link` → `which neosql-mcp` 확인

> 수동 e2e 검증 절차(Inspector / Claude Code / Codex 연동) → `docs/e2e-manual.md`

---

## Phase 1 · endpointResolver (고정 socket path) — 완료 (2026-04-29)

- [x] **test list 제안 → 사람 리뷰 → 합의** (`docs/testing.md` 워크플로 1–2단계)
- [x] `endpointResolver` 모듈 — profile (prod / dev) → socket path 산출, HTTP path 상수 (`/mcp/rpc`) 보유
- [x] profile 인지: `--profile <prod|dev>` CLI 인자 파싱 (`src/cli-args.ts`)
- [x] `healthCheck` 모듈 — `http.request({ socketPath })` 로 connect + HTTP response 시도. 결과: `running` / `not_running` / `stale_socket` / `timeout`
- [x] 테스트: prod·dev path 산출(3) / cli-args(6) / health-check 5건 (running·not_running·timeout 양 OS, stale_socket 2건은 POSIX-only `it.skipIf`)
- [x] `docs/endpoint-resolver.md` (경로 산출 규칙, profile suffix, OS 별 차이, sun_path 한계)
- [ ] (보류) neosql 본체 PR — 본체 작업 시점에 별도 진행 (동일 규칙으로 socket listen + chmod 0600 / Named Pipe ACL, stale unlink, dev/prod suffix 일치)

---

## Phase 2 · embedded-server MCP 도구 Node 이관 — 진행 중

`PLAN.md` Phase 2 참조. embedded-server 의 9개 도구(5 카테고리)를 Node 로 전면 이관한다. Node 핸들러 일괄 구현 후 Phase 2 안에서 본체 HTTP tool 구현과 as-is/to-be 비교 검증까지 진행한다.

### Phase 2-1 · 채널 인프라 + 9개 시그니처 + mock 라운드트립 — 완료 (2026-04-29)

- [x] **test list 제안 → 사람 리뷰 → 합의**
- [x] `httpClient` 모듈 (`endpointResolver` 결과 사용, `http.request({ socketPath })` 기반, JSON-RPC over HTTP POST, 요청 단위 timeout)
- [x] SSE 파서 (자체 구현, `\n\n` 블록 단위, 멀티라인 `data:` 누적, `:` comment 무시)
- [x] error-map (HTTP 4xx/5xx / 타임아웃 / `ENOENT`/`ECONNREFUSED`/`ENOTSOCK` / JSON-RPC `error` → MCP tool error result)
- [x] 도구 시그니처 9개 이관:
  - [x] `code-generation/generate-code`
  - [x] `schema/list-tables`
  - [x] `schema/get-table-details`
  - [x] `context/set-context`
  - [x] `context/get-context`
  - [x] `context/get-context-help`
  - [x] `ddl/create-tables`
  - [x] `ddl/modify-tables`
  - [x] `sql/execute-query`
- [x] `tests/helpers/mock-uds-server.ts` (재사용 fixture)
- [x] `tests/integration/round-trip.test.ts` — 9개 도구 mock UDS 라운드트립 green
- [x] `CHECKLIST.md` / `docs/project-structure.md` 갱신

### Phase 2-2 · Java tool 분석 + contract + 도구별 체크리스트 — 완료 (2026-04-29)

- [x] `CodeGenerationTools.java` 분석 (의존성·상태·에러·응답 페이로드)
- [x] `ContextTools.java` 분석
- [x] `DdlTools.java` 분석
- [x] `SchemaTools.java` 분석
- [x] `SqlTools.java` 분석
- [x] [`McpContextHolder` 분석/설계](docs/mcp-context-holder-analysis.md) (context 우선순위·session 저장소·Node 이관 정책)
- [x] HTTP `Mcp-Session-Id` 대응값 설계 반영 — Node process 최초 로드 시 `mcpSessionId` 생성, `getMcpSessionId` 테스트용 툴로 확인
- [x] `docs/embedded-server-tool-analysis.md` — Java tool / app handler 분석 결과
- [x] 도구별 Node ↔ Electron 분할 결정
- [x] `docs/upstream-rpc-contract.md` — 도구별 HTTP 메서드 명세 (이름, request/response schema, 에러 코드)
- [x] Phase 2-3 / 2-4 도구별 체크리스트 추가 (`Node 핸들러` / `Electron HTTP 메서드` / `IPC/renderer 연결` / `e2e 검증`)

### Phase 2-3 · Node 핸들러 일괄 구현 (mock UDS) — 완료 (2026-04-30)

- [x] **test list 제안 → 사람 리뷰 → 합의** (각 도구별 시나리오)
- [x] Phase 2-1 placeholder 핸들러를 contract 기반 실 핸들러로 교체 (9개)
- [x] mock UDS 서버를 contract 기반으로 강화 (메서드별 fixture dispatcher)
- [x] 도구별 단위 테스트에 contract 시나리오(정상/에러/스키마) 추가
- [x] `context/set-context` — Node-local schema/default merge 구현
- [x] `context/get-context` — Node-local response를 분석 문서 기준으로 보정
- [x] `context/get-context-help` — stdio MCP 구조에 맞게 도움말 보정
- [x] 기존 HTTP header 기반 초기 context를 stdio/npx CLI 옵션으로 대응
- [x] `schema/list-tables` — `schema.listTables` contract 기반 forward 구현
- [x] `schema/get-table-details` — `schema.getTableDetails` contract 기반 forward 구현
- [x] `sql/execute-query` — DDL guard + `sql.executeQuery` contract 기반 forward 구현
- [x] `ddl/create-tables` — `ddlExecute` default merge + `ddl.createTables` forward 구현
- [x] `ddl/modify-tables` — `ddlExecute` default merge + `ddl.modifyTables` forward 구현
- [x] `code-generation/generate-code` — `tableName` → `tableNames[]` 변환 + `codeGeneration.generateCode` forward 구현

### Phase 2-4 · Real Electron MCP tool migration

- [x] **test list 제안 → 사람 리뷰 → 합의**
- [x] (본체 PR) electron-main UDS/Named Pipe HTTP 서버 — listen + `chmod 0600` + stale unlink + dev/prod suffix + `/mcp/rpc` dispatcher
- [x] (본체 PR) renderer IPC 연결

#### SchemaTools

- [x] (본체 PR) `schema.listTables` 구현
- [x] as-is embedded-server MCP vs to-be neosql-mcp 동일 tool/parameter 비교 테스트: `listTables`
- [x] (본체 PR) `schema.getTableDetails` 구현
- [x] as-is embedded-server MCP vs to-be neosql-mcp 동일 tool/parameter 비교 테스트: `getTableDetails`

#### ContextTools

- [x] (본 리포) `setContext` Node context store 구현 확인
- [x] as-is embedded-server MCP vs to-be neosql-mcp 동일 tool/parameter 비교 테스트: `setContext`
- [x] (본 리포) `getContext` Node context store 구현 확인
- [x] as-is embedded-server MCP vs to-be neosql-mcp 동일 tool/parameter 비교 테스트: `getContext`
- [x] (본 리포) `getContextHelp` Node context help 구현 확인
- [x] as-is embedded-server MCP vs to-be neosql-mcp 동일 tool/parameter 비교 테스트: `getContextHelp`

#### SqlTools

- [x] (본체 PR) `sql.executeQuery` 구현
- [x] as-is embedded-server MCP vs to-be neosql-mcp 동일 tool/parameter 비교 테스트: `executeQuery` SELECT
- [x] as-is embedded-server MCP vs to-be neosql-mcp 동일 tool/parameter 비교 테스트: `executeQuery` INSERT (`autoCommit=false`)
- [x] as-is embedded-server MCP vs to-be neosql-mcp 동일 tool/parameter 비교 테스트: `executeQuery` INSERT (`autoCommit=true`)

#### DdlTools

- [x] (본체 PR) `ddl.createTables` 구현
- [x] as-is embedded-server MCP vs to-be neosql-mcp 동일 tool/parameter 비교 테스트: `createTables` (`executeImmediately` 생략)
- [x] as-is embedded-server MCP vs to-be neosql-mcp 동일 tool/parameter 비교 테스트: `createTables` (`executeImmediately=false`)
- [x] as-is embedded-server MCP vs to-be neosql-mcp 동일 tool/parameter 비교 테스트: `createTables` (`executeImmediately=true`)
- [x] (본체 PR) `ddl.modifyTables` 구현
- [x] as-is embedded-server MCP vs to-be neosql-mcp 동일 tool/parameter 비교 테스트: `modifyTables` (`executeImmediately` 생략)
- [x] as-is embedded-server MCP vs to-be neosql-mcp 동일 tool/parameter 비교 테스트: `modifyTables` (`executeImmediately=false`)
- [x] as-is embedded-server MCP vs to-be neosql-mcp 동일 tool/parameter 비교 테스트: `modifyTables` (`executeImmediately=true`)

#### CodeGenerationTools

- [ ] (본체 PR) `codeGeneration.generateCode` 구현
- [ ] as-is embedded-server MCP vs to-be neosql-mcp 동일 tool/parameter 비교 테스트: `generateCode`

- [ ] `docs/e2e-manual.md`에 as-is/to-be 비교 검증 절차와 결과 기록
- [ ] contract 불일치 발견 시 Phase 2-2 contract / Phase 2-3 Node / Electron 코드 동시 보정
- [ ] 분석 결과 open item 확인: DDL restriction branch의 `response` 참조, `templatePackId` 처리 정책

---

## Phase 3 · Desktop lifecycle UX

Phase 2-4에서 9개 tool의 본체 HTTP method 구현과 as-is/to-be 비교 검증까지 진행한 뒤
착수한다. Phase 3은 NeoSQL Desktop 미실행/미설치 UX와 app activation request 흐름 제공을
목표로 한다.

### Phase 3-1 · 미실행 감지와 app activation request

- [x] **test list 제안 → 진행 지시를 합의로 간주**
- [x] upstream 의존 tool 공통 error/result 상태 정리: `not_running` / `stale_socket` / `timeout` / `app_not_ready`
- [x] `timeout` 은 미실행으로 보지 않고 unresponsive/timeout UX 로 반환
- [x] upstream 의존 tool 호출 전 요청 시점 `ensureDesktopReady()` 공통 흐름 추가
- [x] `running` 이면 추가 작업 없이 원 tool 요청 실행
- [x] `not_running` / `stale_socket` 에서 activation request 를 보내면 원 tool 요청은 실행하지 않음
- [x] 이미 upstream 에 전달된 요청의 timeout 은 자동 재시도하지 않도록 검증
- [x] OS 별 app activation request 모듈 추가
- [x] NeoSQL Desktop singleton model 명시: `neosql-mcp` N개 → Electron app 0..1개
- [x] `not_running` / `stale_socket` 에서만 activation request 전송
- [x] `timeout` 에서는 activation request 를 보내지 않도록 검증
- [x] activation 후 readiness polling 없이 `activation_requested` 계열 응답 반환
- [x] 결과 상태 정리: `ready` / `activation_requested` / `unresponsive`
- [x] 정밀 `not_installed` 판정은 Phase 3-2 범위로 유지
- [x] stale POSIX socket 과 listener 부재를 사용자 UX 에서는 같은 미실행 범주로 매핑
- [x] 로그/진단 정보에서는 `not_running` 과 `stale_socket` 을 구분 가능하게 유지
- [x] MCP host 별 Desktop readiness UX 수동 검증 절차를 `docs/e2e-manual.md`에 추가

### Phase 3-2 · 미설치 감지와 설치 안내

- [ ] **test list 제안 → 사람 리뷰 → 합의**
- [ ] OS 별 NeoSQL Desktop 설치 위치 탐색 정책 정리
- [ ] prod/dev product name 및 app id 기준 반영 (`NeoSQL`, `NeoSQLDev`, `com.unvus.neosql`, `com.unvus.neosql.dev`)
- [ ] 미설치 사용자-facing 설치 안내 메시지 정리
- [ ] 자동 다운로드/설치 여부는 별도 결정 전까지 범위 밖으로 명시
- [ ] 설치 위치를 확정할 수 없는 환경에서 추측 실행하지 않고 안내만 반환하도록 검증

## Phase 4 이상

- [ ] multi-instance 처리 정책 검토
- [ ] 인증/권한 모델 필요 여부 검토
- [ ] Windows Named Pipe ACL hardening
- [ ] 구조화 로그와 진단 정보 확장
- [ ] 실제 MCP host별 장기 e2e 시나리오 정리
