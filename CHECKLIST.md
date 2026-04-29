# 개발 체크리스트

Phase별 세부 작업 상태. Phase마다 섹션을 추가·갱신한다.

| 문서 | 역할 |
|------|------|
| `PLAN.md` | 전략·설계·아키텍처 결정 (안정적, 드물게 바뀜) |
| `CHECKLIST.md` (이 문서) | Phase별 작업 체크박스 (세션 간 영속적 진척 기록) |
| 에이전트 TaskCreate | 세션 내 휘발성 트래킹 |

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
- [x] `endpointResolver` 모듈 — profile (prod / dev) → socket path 산출, HTTP path 상수 (`/rpc`) 보유
- [x] profile 인지: `--dev` / `--prod` CLI 플래그 파싱 (`src/cli-args.ts`)
- [x] `healthCheck` 모듈 — `http.request({ socketPath })` 로 connect + HTTP response 시도. 결과: `running` / `not_running` / `stale_socket` / `timeout`
- [x] 테스트: prod·dev path 산출(3) / cli-args(6) / health-check 5건 (running·not_running·timeout 양 OS, stale_socket 2건은 POSIX-only `it.skipIf`)
- [x] `docs/endpoint-resolver.md` (경로 산출 규칙, profile suffix, OS 별 차이, sun_path 한계)
- [ ] (보류) neosql 본체 PR — 본체 작업 시점에 별도 진행 (동일 규칙으로 socket listen + chmod 0600 / Named Pipe ACL, stale unlink, dev/prod suffix 일치)

---

## Phase 2 · embedded-server MCP 도구 Node 이관 — 예정

`PLAN.md` Phase 2 참조. embedded-server 의 9개 도구(5 카테고리)를 Node 로 전면 이관한다. **Option A + pilot** 전략 — Node 일괄 구현 후 ContextTools 로 real Electron pilot.

### Phase 2-1 · 채널 인프라 + 9개 시그니처 + mock 라운드트립

- [ ] **test list 제안 → 사람 리뷰 → 합의**
- [ ] `httpClient` 모듈 (`endpointResolver` 결과 사용, `http.request({ socketPath })` 기반, JSON-RPC over HTTP POST, 요청 단위 timeout)
- [ ] SSE 파서 (자체 구현, `\n\n` 블록 단위, 멀티라인 `data:` 누적, `:` comment 무시)
- [ ] error-map (HTTP 4xx/5xx / 타임아웃 / `ENOENT`/`ECONNREFUSED`/`ENOTSOCK` / JSON-RPC `error` → MCP error code)
- [ ] 도구 시그니처 9개 이관 (placeholder 핸들러 = `httpClient` 호출):
  - [ ] `code-generation/generate-code`
  - [ ] `schema/list-tables`
  - [ ] `schema/get-table-details`
  - [ ] `context/set-context`
  - [ ] `context/get-context`
  - [ ] `context/get-context-help`
  - [ ] `ddl/create-tables`
  - [ ] `ddl/alter-tables`
  - [ ] `sql/execute-query`
- [ ] `tests/helpers/mock-uds-server.ts` (재사용 fixture)
- [ ] `tests/integration/round-trip.test.ts` — 9개 도구 mock UDS 라운드트립 green
- [ ] `CHECKLIST.md` / `docs/project-structure.md` 갱신

### Phase 2-2 · Java tool 분석 + contract + 도구별 체크리스트

- [ ] `CodeGenerationTools.java` 분석 (의존성·상태·에러·응답 페이로드)
- [ ] `ContextTools.java` 분석
- [ ] `DdlTools.java` 분석
- [ ] `SchemaTools.java` 분석
- [ ] `SqlTools.java` 분석
- [ ] 도구별 Node ↔ Electron 분할 결정
- [ ] `docs/upstream-rpc-contract.md` — 도구별 HTTP 메서드 명세 (이름, request/response schema, 에러 코드)
- [ ] Phase 2-3 / 2-4 / Phase 3+ 도구별 체크리스트 추가 (`Node 핸들러` / `Electron HTTP 메서드` / `IPC/renderer 연결` / `e2e 검증`)

### Phase 2-3 · Node 핸들러 일괄 구현 (mock UDS)

- [ ] **test list 제안 → 사람 리뷰 → 합의** (각 도구별 시나리오)
- [ ] Phase 2-1 placeholder 핸들러를 contract 기반 실 핸들러로 교체 (9개)
- [ ] mock UDS 서버를 contract 기반으로 강화 (메서드별 fixture dispatcher)
- [ ] 도구별 단위 테스트에 contract 시나리오(정상/에러/스키마) 추가

### Phase 2-4 · ContextTools real Electron pilot

- [ ] **test list 제안 → 사람 리뷰 → 합의**
- [ ] (본체 PR) electron-main UDS HTTP 서버 — listen + `chmod 0600` + stale unlink + dev/prod suffix + `/rpc` dispatcher
- [ ] (본체 PR) ContextTools 3개 메서드 구현 (`setContext` / `getContext` / `getContextHelp`)
- [ ] (본체 PR) renderer IPC 연결 (필요 시)
- [ ] 본 리포: `tests/e2e/` 신설 + 실 electron 기동 후 도구 호출
- [ ] `docs/e2e-manual.md` 절차 보강
- [ ] contract 불일치 발견 시 Phase 2-2 contract / Phase 2-3 Node / Electron 코드 동시 보정

---

## Phase 3 이상

Phase 2-4 pilot 완료 시점에 범위·우선순위 재검토 (`PLAN.md` 참조). 핵심: 나머지 Electron 카테고리 일괄(Schema → SQL → DDL → CodeGeneration), 미설치/미실행 구분, multi-instance, 인증, Windows ACL 등.
