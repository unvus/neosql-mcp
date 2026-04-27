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
- [x] 단위 테스트: InMemoryTransport로 tools/list, ping 응답 (`src/server.test.ts`, 2건)
- [x] 통합 테스트: dist/cli.js spawn (`src/cli.spawn.test.ts`, 1건)
- [x] `npm pack --dry-run` 배포 패키지 검증
- [x] `npm link` → `which neosql-mcp` 확인

> 수동 e2e 검증 절차(Inspector / Claude Code / Codex 연동) → `docs/e2e-manual.md`

---

## Phase 1 · portResolver (포트 파일 단독) — 예정

- [ ] **test list 제안 → 사람 리뷰 → 합의** (`docs/testing.md` 워크플로 1–2단계)
- [ ] 포트 파일 스키마 정의 (zod)
- [ ] `portResolver` 모듈 기본 read 흐름
- [ ] stale 판정: pid 생존 확인
- [ ] stale 판정: port listen 확인
- [ ] 테스트: 정상 / 파일없음 / pid dead / port not listening / 스키마 불일치
- [ ] `docs/port-file.md` (경로·스키마·수명 주기·neosql 본체 PR 범위 정리)
- [ ] neosql 본체 PR (electron-main에 파일 write/delete 로직) — **별도 리포**

---

## Phase 2 · stdio ↔ HTTP MCP 중계 — 예정

Phase 1 완료 후 test list부터 시작.

---

## Phase 3 이상

Phase 2 완료 시점에 범위·우선순위 재검토 (`PLAN.md` 참조).
