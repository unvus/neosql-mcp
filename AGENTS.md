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

- `src/cli.ts` is the `neosql-mcp` binary entry point and should stay CLI-specific.
- `src/server.ts` creates and wires the MCP server.
- `src/tools/` contains MCP tool registrations, currently including `ping.ts`.
- `src/logger.ts` configures pino logging. Logs must go to stderr because stdout is
  reserved for the MCP stdio protocol.
- `src/*.test.ts` contains Vitest tests.
- `src/*.spawn.test.ts` covers built-CLI child-process behavior.
- `docs/testing.md` defines the TDD workflow and test layers.
- `docs/e2e-manual.md` defines manual MCP host checks.
- `docs/spawn.md` explains spawn-based integration tests.
- `poc/` contains transport experiments and reference scripts, not production code.
- `dist/` is generated build output and must not be edited directly.

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

Use focused unit tests beside related source under `src/`. Use spawn tests only for
built CLI or child-process behavior. Run `npm run test:unit` during iteration and
`npm test` before handoff when practical. For binary entry changes, also run
`npm run test:integration`.

Manual e2e with real MCP hosts is documented in `docs/e2e-manual.md`. Phase 0 e2e
checks only the `ping` tool; later phases should add scenario-specific checks there.

## Commit & Pull Request Guidelines

The history uses short, imperative subjects, sometimes in Korean, such as
`e2e 문서 추가` or `neosql-config.json 경로 반영`. Keep commits focused.

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
