# Repository Guidelines

## 프로젝트 맥락

이 저장소는 `neosql-mcp`의 TypeScript ESM 패키지다. stdio MCP 클라이언트가
`npx neosql-mcp`로 실행하는 로컬 MCP 중계 서버를 구현한다.

목표 아키텍처:

```text
[mcp-client] -- stdio MCP --> [neosql-mcp Node]
  -- JSON-RPC over HTTP on UDS/Named Pipe --> [electron-main]
  -- IPC --> [electron-renderer]
```

중요한 경계:

- 클라이언트 ↔ Node 구간은 표준 MCP JSON-RPC over stdio를 사용한다.
- Node ↔ electron-main 구간은 neosql 자체 JSON-RPC over HTTP endpoint를 사용한다.
- upstream transport는 POSIX에서는 Unix Domain Socket, Windows에서는 Named Pipe다.
  아키텍처 문서가 명시적으로 바뀌기 전까지 TCP port를 도입하지 않는다.
- Tool catalog와 MCP handler는 이 Node 패키지에 둔다. handler는 하나 이상의
  upstream HTTP method를 electron-main에 위임할 수 있으며, MCP tool과 upstream
  method는 1:1 매핑을 보장하지 않는다.
- electron-main, renderer, embedded-server 변경은 이 저장소 범위 밖이다. 단, 작업이
  neosql main app 변경을 명시적으로 포함하면 예외다.

현재 상태와 로드맵:

- Phase 0 완료: package scaffold, MCP server, `ping` tool, logger, build, unit test,
  spawn integration test.
- Phase 1 완료: endpoint resolution은 config file, environment variable, process
  discovery가 아니라 deterministic socket path 규칙을 사용한다.
- Phase 2: embedded-server MCP tool을 이 Node 패키지로 이관한다. 순서는 Phase 2-1
  channel infrastructure + 9개 tool signature + mock UDS round-trip, Phase 2-2
  contract analysis, Phase 2-3 Node handler, Phase 2-4 `ContextTools` real Electron
  pilot이다.
- Phase 3+는 Phase 2-4 pilot 결과를 확인한 뒤 범위와 우선순위를 다시 정한다.

문서 기준:

- `CLAUDE.md`: Claude로 진행해온 neosql 고수준 맥락.
- `README.md`: npm/GitHub에 노출되는 end-user 문서. 공개 설정 예시와 사용자-facing
  설명은 README에 둔다.
- `PLAN.md`: 아키텍처 결정과 phase 전략의 단일 진실의 원천.
- `CHECKLIST.md`: 현재 진행 상태의 단일 진실의 원천.
- `docs/project-structure.md`: 파일 배치 규칙의 단일 진실의 원천.
- `docs/testing.md`: 필수 테스트 워크플로.
- `docs/mcp-client-config.md`: 내부 개발자용 CLI option, profile, legacy HTTP header
  → stdio/npx CLI arg 매핑 참고 문서. end-user용 설정 예시는 README를 우선 갱신한다.

`AGENTS.md`는 Codex-facing repository guide다. `CLAUDE.md`와 일관성을 유지하되,
세부 내용이 다르면 더 구체적인 계획 문서(`PLAN.md`, `CHECKLIST.md`,
`docs/project-structure.md`)를 우선한다. `CLAUDE.md`가 참조하는
`~/workspace/neosql/docs/` 하위 외부 문서는 main-app 맥락이 필요한 작업에서만 읽는다.

## neosql main app 참조 규칙

neosql Electron app 설치 감지, 앱 실행, readiness 확인, Node ↔ electron-main RPC
계약, renderer IPC 연결, embedded-server 기존 동작 비교처럼 main app 동작에 의존하는
작업은 문서만 보고 추측하지 않는다. 반드시 sibling clone의 실제 소스코드를 먼저
확인한다.

- 기본 참조 경로는 이 저장소 기준 `../neosql`이며, 동일 위치를 가리키는
  `~/workspace/neosql`도 사용할 수 있다.
- 우선 확인할 본체 소스:
  - `../neosql/app/src-electron/`: Electron main, MCP RPC server, app lifecycle,
    preload/IPC 경계.
  - `../neosql/app/src/services/mcp-handler/`: 기존 Electron-side MCP action 처리.
  - `../neosql/embedded-server/src/main/java/com/unvus/neosql/embedded/mcp/`:
    기존 Spring AI MCP tool, context/session 처리.
  - `../neosql/app/quasar.config.ts`, `../neosql/app/package.json`,
    `../neosql/package.json`: product name, app id, dev/build 실행 방식, packaging 설정.
  - `../neosql/web/`: 설치/다운로드 안내나 배포 URL을 구현해야 할 때만 확인.
- Electron dev 실행은 현재 본체 소스 기준 `../neosql/app`에서 `npm run dev:e`를
  우선 확인한다. 실행 명령, product name, app id, socket suffix는 본체 소스가 바뀔 수
  있으므로 작업 시점에 다시 검증한다.
- `neosql-mcp`는 embedded-server JAR을 직접 실행하거나 설치하지 않는다. app 설치
  여부 감지, 사용자-facing 안내, 필요 시 Electron app detached 실행, upstream
  readiness polling만 담당한다.
- 설치 위치, 다운로드 URL, OS별 앱 실행 방법은 하드코딩하기 전에 반드시 본체 packaging
  설정과 web/download 소스를 확인한다. 확인되지 않은 경로는 문서화된 fallback 또는
  명확한 error 안내로 처리한다.
- main app 소스와 이 저장소의 계획 문서가 충돌하면, 현재 구현 사실은 main app 소스에서
  확인하고, `PLAN.md`/`CHECKLIST.md`/contract 문서는 함께 갱신해야 한다. 단,
  TCP port 도입처럼 아키텍처 결정을 바꾸는 변경은 명시적 계획 변경 없이는 하지 않는다.

## 프로젝트 구조와 모듈 배치

전체 디렉토리 레이아웃과 새 파일 배치 규칙은 `docs/project-structure.md`를
**단일 진실의 원천**으로 삼는다. 새 파일·모듈을 추가하거나 기존 파일을 이동할 때는
반드시 해당 문서를 먼저 참조해 분류를 확인한다. 분류가 모호하면 PR 설명에 근거를
적고, 새 경계가 필요한 변경이면 코드와 함께 `docs/project-structure.md`도 갱신한다.

핵심 요약:

- `src/`는 프로덕션 코드만 둔다. 경계는 `src/{cli,mcp,upstream,infra}/` 4개다.
  - `cli/`: binary entry point (`cli.ts`가 `package.json#bin` target)와 CLI arg parsing.
  - `mcp/`: MCP stdio server와 tool catalog(`mcp/tools/`).
  - `upstream/`: electron-main HTTP channel. endpoint resolver, health check,
    HTTP client, SSE parser 같은 UDS/Named Pipe transport/RPC 인프라.
  - `infra/`: logger 등 횡단 관심사. MCP stdio가 stdout을 사용하므로 pino log는 반드시 stderr.
- `tests/`는 모든 테스트 코드다. `src/` 구조를 미러링하는 unit test
  (`tests/cli/`, `tests/mcp/`, `tests/upstream/`)와 `tests/spawn/`,
  `tests/integration/`, `tests/fixtures/`, `tests/helpers/`를 둔다.
- 테스트는 `import ... from '../../src/<dir>/foo.js'` 형태로 `src`를 참조한다.
  `src`는 `tests`를 절대 import하지 않는다.
- 보조 문서: `docs/testing.md`, `docs/e2e-manual.md`, `docs/spawn.md`.
- Supabase CLI 참조 분석 문서는 `docs/supabase-cli/`에 둔다. 분석 대상 원본
  소스는 이 저장소 기준 sibling clone인 `../cli`다.
- `poc/`는 transport 실험 코드이며 프로덕션 코드가 아니다.
- `dist/`는 빌드 산출물이다. 직접 편집하지 않는다.

## 코딩 스타일과 네이밍

TypeScript ESM imports/exports를 사용한다. 기존 스타일을 따른다.

- 2-space indentation
- semicolons
- single quotes
- trailing commas
- LF endings
- 100-character print width
- 가능한 곳은 named exports

외부 I/O는 unit test에서 mock할 수 있도록 명확한 모듈 경계 뒤에 둔다. 특히 socket
path resolution, process check, child process launching, HTTP/UDS call, Named Pipe
call, SSE parsing은 이 원칙을 지킨다.

테스트 파일은 대상 unit 또는 behavior 기준으로 이름 짓는다. 예: `server.test.ts`,
`cli.spawn.test.ts`. 테스트 이름은 동작을 직접 설명한다. 예:
`returns "pong" when the ping tool is called`. 모호한 `should ...` 표현은 피한다.
의도적으로 사용하지 않는 변수나 인자는 `_` prefix를 붙인다.

## 아키텍처 규칙

합의된 upstream channel을 가볍게 바꾸지 않는다. 현재 결정은 다음과 같다.

- Pattern: JSON-RPC over HTTP.
- Request/response: POST.
- Optional server push: GET SSE.
- Transport: UDS on POSIX, Named Pipe on Windows.
- TCP loopback port는 의도적으로 피한다.

endpoint resolution 규칙:

- `neosql-mcp`와 electron-main이 공유하는 deterministic socket path 계산을 사용한다.
  `PLAN.md`가 명시적으로 바뀌기 전까지 config file read, environment variable
  override, process discovery를 추가하지 않는다.
- POSIX socket path: `path.join(os.tmpdir(), 'neosql-mcp' + suffix + '.sock')`.
- Windows Named Pipe path: `\\\\.\\pipe\\neosql-mcp` + suffix.
- `suffix`는 prod에서 `''`, 그 외 profile에서 `'-' + profile`이다. 기본 profile은 prod다.
- HTTP path는 `/mcp/rpc` 상수다. config에 저장하지 않는다. `/mcp/` 네임스페이스로 묶어 향후 비-RPC endpoint나 다른 RPC 묶음 추가 여지를 확보한다.
- missing listener, stale POSIX socket file, timeout, unsupported socket state는
  명확한 사용자-facing error로 다룬다.

UDS와 Named Pipe HTTP 호출은 기본적으로 Node built-in
`http.request({ socketPath, ... })`를 사용한다. global `fetch`는 표준 API에서 필요한
socket path dispatcher 동작을 노출하지 않으므로 이 transport에는 충분하지 않다.

Phase 2 tool migration 규칙:

- Node 패키지가 MCP tool definition과 handler를 소유한다.
- handler는 얇게 유지한다. MCP input validation, upstream JSON-RPC method 호출,
  upstream error → MCP tool response mapping, result formatting에 집중한다.
- 이관 대상은 현재 7개 core tool이다: `generateCode`, `listTables`,
  `getTableDetails`, `getContextHelp`, `createTables`, `modifyTables`, `executeQuery`.
- Phase 2-1부터 2-3까지는 mock UDS/HTTP integration test로 검증한다. real
  electron-main / renderer 변경은 계획이 바뀌지 않는 한 Phase 2-4부터 시작한다.

## 테스트 지침

테스트 프레임워크는 Vitest다. Phase 1부터는 `docs/testing.md`의 워크플로를 따른다.

1. 구현 전에 test list를 제시한다.
2. 사람 리뷰와 합의를 받는다.
3. 실패하는 테스트를 작성하고 red를 확인한다.
4. 구현한다.
5. green을 확인한다.

unit test는 `tests/<src mirror>/`에 둔다. mock UDS server 기반 round-trip 검증은
`tests/integration/`에 둔다. spawn test는 `tests/spawn/`에서 built CLI 또는 child
process 동작만 다룬다. 반복 작업 중에는 `npm run test:unit`을, handoff 전에는
`npm test`를 실행한다. binary entry나 `dist`에 영향이 있는 변경은
`npm run test:integration`도 실행한다.

변경사항이 있는 작업을 완료하기 전에는 반드시 `npm run build`를 실행한다. 실행하지
못한 경우에는 그 이유를 최종 응답에 명확히 남긴다.

실제 MCP host와의 manual e2e는 `docs/e2e-manual.md`에 문서화한다. Phase 0 e2e는
`ping` tool만 확인하며, 이후 phase에서는 scenario별 검증 절차를 추가한다.

## Commit과 Pull Request

commit message는 `docs/commit-style.md` 규칙을 따른다. 새 commit을 작성할 때는 먼저
해당 문서를 확인한다.

핵심 요약:

- 형식: `<type>[(<scope>)]: <subject>` (한 줄, 50-72자, 명령형/명사형, 마침표 없음).
- type 6종: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`.
- body는 "왜(why)"가 비자명할 때만 작성한다. "무엇(what)"은 diff가 보여주므로 생략한다.
- 한 commit은 한 논리적 변경만 담는다.

Pull request에는 다음을 포함한다.

- 짧은 설명.
- 변경 이유.
- 실행한 테스트.
- 관련 있으면 수동 검증 절차.
- 관련 planning doc 또는 issue link.

## 보안과 설정

local secret, 문서화되지 않은 machine-specific path, `dist/` generated artifact를
commit하지 않는다. `.mcp.json`, socket path behavior, Named Pipe assumption,
installation assumption처럼 local environment에 따라 달라지는 동작은 문서화한다.
MCP host 공개 설정 예시를 바꿀 때는 npm landing page인 `README.md`를 먼저 갱신한다.
CLI option parsing, profile 규칙, legacy header mapping 같은 내부 개발자 참고 사항을
바꿀 때는 `docs/mcp-client-config.md`도 함께 갱신한다. `AGENTS.md`는 작업 지침이므로
README 내용을 정보 소스로 복제하지 않는다.

POSIX UDS는 비정상 종료 뒤 stale socket file이 남을 수 있으므로 main app이 listen
전에 unlink해야 한다. Windows Named Pipe ACL hardening은 plan에 남아 있는 future
item이다.
