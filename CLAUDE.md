# neosql 참고 문서

이 디렉토리(`mcp/`)는 neosql MCP 개발을 위한 실습 공간입니다.
아래 문서들은 neosql 프로젝트의 전체 방향성·아키텍처·진행 중 계획으로, 항상 세션 context에 로드됩니다.
세부 구현 문서(backend/frontend/sql/research/infra/payment 등)는 필요할 때 `~/workspace/neosql/docs/` 하위에서 직접 읽으세요.

## neosql-mcp 방향성

- **실행 방식 전환**: 기존 HTTP 직접 호출 방식에서 `npx` 로컬 실행 방식으로 변경한다.
- **배포 패키지**: `npx` 로 실행할 node 모듈명은 `neosql-mcp` 로 한다. (향후 변경 가능)
- **도구 위치**: 도구 카탈로그·핸들러는 mcp Node 모듈이 보유한다 (기존 embedded-server tool 명세를 Node 로 가져옴).
- **중계 구조**: Node 의 도구 핸들러는 electron-main 이 호스트하는 HTTP 엔드포인트(JSON-RPC over HTTP POST + 필요 시 GET SSE) 로 데이터·UI 트리거를 위임한다. transport 는 **Unix Domain Socket (POSIX) / Named Pipe (Windows)** — TCP 포트 미사용. main → renderer 는 기존 IPC.
- **소스 구조**: 새 파일 추가/이동 시 `docs/project-structure.md` 를 반드시 먼저 참조한다. `src/{cli,mcp,upstream,infra}/` 4개 경계 중 분류가 모호하거나 새 경계가 필요하면 코드 변경과 함께 해당 문서도 갱신한다.
- **Commit 메시지**: `docs/commit-style.md` 규칙을 따른다 (`<type>[(<scope>)]: <subject>` 형식, 6 type: feat/fix/refactor/test/docs/chore).

상세한 기능 개발 우선순위는 `README.md`, 단계별 구현 계획은 `PLAN.md` 참조.

## 개발 지침

- **TDD 필수**: 기능 추가·변경은 "실패하는 테스트 작성 → 구현 → 리팩터링" 순서로 진행한다.
- **회귀 방지**: 코드 수정 시 관련 테스트 스위트를 반드시 실행하여 **통과 확인 후** 다음 단계로 넘어간다. 테스트가 깨진 상태로 커밋하지 않는다.
- **경계**: 외부 I/O(파일 시스템, HTTP, 프로세스 spawn)는 mock 가능한 모듈 경계로 분리한다. 단위 테스트는 mock, 통합 테스트는 실제 호출 대상으로 구분한다.
- **에이전트 협업 워크플로**: Phase 1부터 모든 기능은 **구현 착수 전 test list 제시 → 사람 리뷰 → red → impl → green** 사이클을 따른다. 상세는 `docs/testing.md`.
- **진척 기록**: Phase별 체크박스는 `CHECKLIST.md`에서 관리한다. 전략·설계는 `PLAN.md`, 세션 내 작업은 TaskCreate.
- **스택 확정 (Phase 0 완료 시점)**: TypeScript + tsup + Vitest + ESLint + Prettier + pino (stderr). MCP SDK는 `@modelcontextprotocol/sdk` v1.

## 개요
@~/workspace/neosql/docs/README.md

## 아키텍처
@~/workspace/neosql/docs/architecture/README.md
@~/workspace/neosql/docs/architecture/data-flow.md
@~/workspace/neosql/docs/architecture/module-dependencies.md
@~/workspace/neosql/docs/architecture/execution-modes.md
@~/workspace/neosql/docs/architecture/dialect-pattern.md
@~/workspace/neosql/docs/architecture/credential-encryption.md
@~/workspace/neosql/docs/architecture/datetime-type-handling.md
@~/workspace/neosql/docs/architecture/erd-visibility.md
@~/workspace/neosql/docs/architecture/schema-change-tracking.md
@~/workspace/neosql/docs/architecture/sync-server-couchdb-schema.md
@~/workspace/neosql/docs/architecture/sync-server-pouchdb.md
@~/workspace/neosql/docs/architecture/table-name-collision.md

## 진행 중 계획
@~/workspace/neosql/docs/plan/ddl-restrict-sync-conflict.md
@~/workspace/neosql/docs/plan/mcp-improvement-discussion-source.md
@~/workspace/neosql/docs/plan/table-name-collision.md
@~/workspace/neosql/docs/plan/watermark-permissions-ddl-restriction.md
