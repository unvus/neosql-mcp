# Repository Guidelines

## Project Context

This repository is the TypeScript ESM package for `neosql-mcp`, a local MCP relay
server run by stdio MCP clients through `npx neosql-mcp`.

The intended architecture is:

```text
[mcp-client] -- stdio MCP --> [neosql-mcp Node]
  -- JSON-RPC over HTTP on UDS/Named Pipe --> [electron-main]
  -- IPC --> [electron-renderer]
```

Important boundaries:

- Client to Node uses standard MCP JSON-RPC over stdio.
- Node to electron-main uses neosql's own JSON-RPC over HTTP endpoint.
- The upstream transport is Unix Domain Socket on POSIX and Named Pipe on Windows.
  Do not introduce TCP ports unless the architecture docs are explicitly changed.
- Tool catalog and MCP handlers live in this Node package. Handlers may delegate one
  or more upstream HTTP methods to electron-main; MCP tools and upstream methods are
  not guaranteed to map 1:1.
- electron-main, renderer, and embedded-server changes are outside this repository
  unless a task explicitly includes the neosql main app.

Current status:

- Phase 0 is complete: package scaffold, MCP server, `ping` tool, logger, build,
  unit tests, and spawn integration test.
- Phase 1 is next: endpoint resolution from the neosql Electron app config file.
- Phase 2 follows: stdio-to-HTTP channel, upstream client, SSE support, and real
  tool catalog expansion.

Use `README.md` for the high-level direction, `PLAN.md` for architecture decisions,
`CHECKLIST.md` for phase progress, and `docs/testing.md` for the required testing
workflow.

## Project Structure & Module Organization

전체 디렉토리 레이아웃과 새 파일 배치 규칙은 `docs/project-structure.md` 를
**단일 진실의 원천**으로 삼는다. 새 파일·모듈을 추가하거나 기존 파일을 이동
할 때는 반드시 해당 문서를 먼저 참조해 분류를 확인하고, 분류가 모호하면 PR
설명에 근거를 적는다. 새 경계가 필요한 변경이라면 코드와 함께
`docs/project-structure.md` 도 같이 갱신한다.

핵심 요약:

- `src/` 는 프로덕션 코드만. `src/{cli, mcp, upstream, infra}/` 4개 경계.
  - `cli/` — 바이너리 진입점 (`cli.ts` 가 `package.json` `bin` 타깃) + CLI 인자 파싱.
  - `mcp/` — MCP stdio 서버 + tool 카탈로그(`mcp/tools/`).
  - `upstream/` — electron-main HTTP 채널 (UDS/Named Pipe). Phase 2 이후 http-client / SSE 파서가 여기 추가.
  - `infra/` — 횡단 관심사 (logger 등). pino 로그는 stdout 이 MCP stdio 전용이므로 반드시 stderr.
- `tests/` 는 모든 테스트 코드. `src/` 구조를 미러링하는 단위 테스트 (`tests/cli/`, `tests/mcp/`, `tests/upstream/`) + `tests/spawn/` (built CLI 통합) + (Phase 2+) `tests/integration/`, `tests/fixtures/`, `tests/helpers/`.
- 테스트는 `import ... from '../../src/<dir>/foo.js'` 로 src를 참조. src 는 tests 를 절대 import 하지 않는다.
- 보조 문서: `docs/testing.md` (TDD 워크플로), `docs/e2e-manual.md` (수동 MCP 호스트 검증), `docs/spawn.md` (spawn 통합 테스트).
- `poc/` 는 transport 실험 코드 (프로덕션 아님), `dist/` 는 빌드 산출물 (편집 금지).

## Build, Test, and Development Commands

Use Node.js `>=20`, as required by `package.json`.

- `npm run build` builds with `tsup` into `dist/`.
- `npm run dev` runs `tsup --watch`.
- `npm test` runs the full Vitest suite once.
- `npm run test:watch` starts Vitest watch mode.
- `npm run test:unit` excludes `*.spawn.test.ts`.
- `npm run test:integration` builds first, then runs spawn integration tests.
- `npm run lint` checks the repository with ESLint.
- `npm run typecheck` runs `tsc --noEmit`.
- `npm run format` formats the repository with Prettier.
- `npm pack --dry-run` manually verifies publish package contents.

For binary entry or packaging changes, run at least:

```bash
npm run build
npm run test:integration
npm pack --dry-run
```

## Coding Style & Naming Conventions

Use TypeScript with ESM imports/exports. Follow the existing style:

- 2-space indentation
- semicolons
- single quotes
- trailing commas
- LF endings
- 100-character print width
- named exports where practical

Keep external I/O behind clear module boundaries so it can be mocked in unit tests.
This matters especially for file-system config reads, process checks, child process
launching, HTTP/UDS calls, Named Pipe calls, and SSE parsing.

Name tests after the unit or behavior, for example `server.test.ts` or
`cli.spawn.test.ts`. Test names should describe behavior directly, such as
`returns "pong" when the ping tool is called`; avoid vague `should ...` names.
Prefix intentionally unused variables or arguments with `_`.

## Architecture Rules

Do not replace the agreed upstream channel casually. The current decision is:

- Pattern: JSON-RPC over HTTP.
- Request/response: POST.
- Optional server push: GET SSE.
- Transport: UDS on POSIX, Named Pipe on Windows.
- TCP loopback ports are intentionally avoided.

For Phase 1 endpoint resolution:

- Read only the neosql Electron app config file; do not add environment variable
  overrides or process discovery unless the plan changes.
- Config path follows Electron `userData`:
  - macOS: `~/Library/Application Support/NeoSQL/neosql-config.json`
  - Windows: `%APPDATA%\NeoSQL\neosql-config.json`
- Expected minimal fields are `mcpSocketPath`, `mcpHttpPath`, and an execution-state
  PID field such as `electronAppPid`.
- Treat stale PID/socket states as explicit error cases with clear user-facing
  messages.

Use Node built-ins such as `http.request({ socketPath, ... })` by default for UDS
and Named Pipe HTTP calls. Global `fetch` is not enough for this transport because
it does not expose the required socket path dispatcher behavior in the standard API.

## Testing Guidelines

Vitest is the test framework. From Phase 1 onward, follow `docs/testing.md`:

1. Propose the test list before implementation.
2. Get human review and agreement.
3. Write failing tests and confirm red.
4. Implement.
5. Confirm green.

단위 테스트는 `tests/<src 미러>/` 에 두어 대상 모듈 구조를 그대로 따른다. spawn
테스트는 `tests/spawn/` 에서 built CLI 또는 자식 프로세스 동작만 다룬다. 이터레이션
중에는 `npm run test:unit` 을, 핸드오프 전에는 `npm test` 를 돌린다. 바이너리 진입
점이나 dist 영향이 있는 변경은 `npm run test:integration` 도 같이 돌린다.

Manual e2e with real MCP hosts is documented in `docs/e2e-manual.md`. Phase 0 e2e
checks only the `ping` tool; later phases should add scenario-specific checks there.

## Commit & Pull Request Guidelines

Commit 메시지는 `docs/commit-style.md` 의 규칙을 따른다 (Conventional Commits 의
단순화 버전). 새 commit 작성 시 해당 문서를 먼저 참조한다.

핵심 요약:

- 형식: `<type>[(<scope>)]: <subject>` (한 줄, 50–72자, 명령형/명사형, 마침표 없음).
- type 6종: `feat` / `fix` / `refactor` / `test` / `docs` / `chore`.
- body 는 "왜(why)" 가 비자명할 때만. "무엇(what)" 은 diff 가 보여주므로 생략.
- 한 commit = 한 논리적 변경.

Pull requests should include:

- short description
- reason for the change
- tests run
- manual verification steps, when relevant
- links to related planning docs or issues

## Security & Configuration Tips

Do not commit local secrets, undocumented machine-specific paths, or generated
artifacts from `dist/`. Keep `.mcp.json`, neosql config paths, socket path behavior,
Named Pipe assumptions, and installation assumptions documented when behavior depends
on the local environment.

For POSIX UDS behavior, remember that stale socket files can remain after abnormal
shutdown and the main app should unlink them before listening. For Windows Named
Pipe behavior, ACL handling is a future hardening item tracked in the plan.
