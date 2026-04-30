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
- [x] profile 인지: `--dev` / `--prod` CLI 플래그 파싱 (`src/cli-args.ts`)
- [x] `healthCheck` 모듈 — `http.request({ socketPath })` 로 connect + HTTP response 시도. 결과: `running` / `not_running` / `stale_socket` / `timeout`
- [x] 테스트: prod·dev path 산출(3) / cli-args(6) / health-check 5건 (running·not_running·timeout 양 OS, stale_socket 2건은 POSIX-only `it.skipIf`)
- [x] `docs/endpoint-resolver.md` (경로 산출 규칙, profile suffix, OS 별 차이, sun_path 한계)
- [ ] (보류) neosql 본체 PR — 본체 작업 시점에 별도 진행 (동일 규칙으로 socket listen + chmod 0600 / Named Pipe ACL, stale unlink, dev/prod suffix 일치)

---

## Phase 2 · embedded-server MCP 도구 Node 이관 — 진행 중

`PLAN.md` Phase 2 참조. embedded-server 의 9개 도구(5 카테고리)를 Node 로 전면 이관한다. **Option A + pilot** 전략 — Node 일괄 구현 후 SchemaTools 로 real Electron pilot.

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
- [x] Phase 2-3 / 2-4 / Phase 3+ 도구별 체크리스트 추가 (`Node 핸들러` / `Electron HTTP 메서드` / `IPC/renderer 연결` / `e2e 검증`)

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

### Phase 2-4 · SchemaTools real Electron pilot

- [ ] **test list 제안 → 사람 리뷰 → 합의**
- [ ] (본체 PR) electron-main UDS/Named Pipe HTTP 서버 — listen + `chmod 0600` + stale unlink + dev/prod suffix + `/mcp/rpc` dispatcher
- [ ] (본체 PR) `schema.listTables` 메서드 구현
- [ ] (본체 PR) `schema.getTableDetails` 메서드 구현
- [ ] (본체 PR) renderer IPC 연결 (필요 시)
- [ ] 본 리포: `tests/e2e/` 신설 + 실 electron 기동 후 도구 호출
- [ ] `docs/e2e-manual.md` 절차 보강
- [ ] contract 불일치 발견 시 Phase 2-2 contract / Phase 2-3 Node / Electron 코드 동시 보정
- [ ] 분석 결과 open item 확인: DDL restriction branch의 `response` 참조, `templatePackId` 처리 정책

---

## Phase 3 이상

Phase 2-4 pilot 완료 시점에 범위·우선순위 재검토 (`PLAN.md` 참조). 핵심: 나머지 Electron 카테고리 일괄(SQL → DDL → CodeGeneration), 미설치/미실행 구분, multi-instance, 인증, Windows ACL 등.

- [ ] SQL Electron 구현/e2e (`sql.executeQuery`)
- [ ] DDL Electron 구현/e2e (`ddl.createTables`, `ddl.modifyTables`)
- [ ] CodeGeneration Electron 구현/e2e (`codeGeneration.generateCode`)
- [ ] `templatePackId` contract 지원 여부 확정
- [ ] DDL `executeImmediately=true` 권한 제한 branch 검증
- [ ] multi-instance / session identity 정책 확정
- [ ] Windows Named Pipe ACL hardening
