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

## Phase 2 · stdio↔HTTP 채널 + 도구 정의 — 예정

Phase 1 완료 후 test list 부터 시작.

- [ ] **test list 제안 → 사람 리뷰 → 합의**
- [ ] `httpClient` 모듈 (`endpointResolver` 결과 사용, `http.request({ socketPath })` 기반, JSON-RPC over HTTP POST + SSE 채널, 요청 단위 timeout/retry)
- [ ] SSE 파서 (자체 구현, `\n\n` 블록 단위)
- [ ] mcp-server 도구 카탈로그 인프라 + 첫 도구 1개 (mock UDS 서버 대상)
- [ ] 도구 핸들러 → httpClient → mock UDS 서버 라운드트립 테스트
- [ ] 에러 매핑 (HTTP 4xx/5xx / 타임아웃 / 메서드 미정의 / socket 연결 실패 → MCP error code)
- [ ] 도구 목록 추가 (별도 단계에서 작성 — 기존 embedded-server tool 명세를 Node 로 옮김)

---

## Phase 3 이상

Phase 2 완료 시점에 범위·우선순위 재검토 (`PLAN.md` 참조).
