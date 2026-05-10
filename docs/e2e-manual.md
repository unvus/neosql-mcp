# 수동 e2e 검증 (실제 MCP 클라이언트 연동)

자동화된 단위/통합 테스트(`docs/testing.md`)로는 잡지 못하는 영역 — 실제 MCP Host와의 stdio 핸드셰이크, 툴 호출 왕복 — 을 사람이 검증하는 절차.

> Phase 0 시점에서는 `ping` 툴 하나만 응답한다. Phase가 진행되면 같은 자리에 시나리오만 추가한다.

## 사전 준비

```bash
npm run build       # dist/cli.js 생성 (shebang + 실행권한 포함)
npm link            # neosql-mcp 명령을 글로벌 PATH에 등록 (1회)
which neosql-mcp    # 경로 확인 (예: ~/.nvm/.../bin/neosql-mcp)
```

코드 수정 후에는 `npm run build` 만 다시 돌리면 된다 (link는 symlink라 재실행 불필요).

## 1. MCP Inspector — LLM 없이 빠른 검증 (권장 첫 단계)

```bash
# prod profile (기본)
npx @modelcontextprotocol/inspector neosql-mcp

# dev profile + initial context
npx @modelcontextprotocol/inspector neosql-mcp --profile dev \
  --project 6c9fede500f949079f7c553cfd96ec72 \
  --connection 88 \
  --schema appdb \
  --ddl-execute false \
  --auto-commit false
```

- 브라우저 UI가 자동으로 열린다.
- prod profile 은 `neosql-mcp.sock` / `\\.\pipe\neosql-mcp` 로 연결한다.
- dev profile 은 `neosql-mcp-dev.sock` / `\\.\pipe\neosql-mcp-dev` 로 연결한다.
- 초기 context 옵션(`--project`, `--connection`, `--schema`, `--ddl-execute`,
  `--auto-commit`)의 상세 mapping과 MCP host 설정 예시는
  [`docs/mcp-client-config.md`](mcp-client-config.md)를 기준으로 한다.
- **Tools** 탭 → `ping` 선택 → **Run Tool** → 응답 `"pong"` 확인.
- 핸드셰이크 / `tools/list` / `tools/call` 셋을 한 화면에서 본다. 어디서 끊겼는지 즉시 보이므로 디버깅 효율이 가장 좋다.

## 2. Claude Code

**방법 A — CLI 등록 (사용자 단위)**

```bash
claude mcp add neosql-ping neosql-mcp
```

**방법 B — 프로젝트 단위 (`.mcp.json`)**

프로젝트 설정 예시는 [`docs/mcp-client-config.md`](mcp-client-config.md)를 단일
진실의 원천으로 삼는다.

검증:

- 세션에서 `/mcp` → `neosql` 가 connected 로 보이는지.
- 대화에서 "ping 툴 호출해줘" → `pong` 반환 확인.
- `getContext` 툴 호출 → `.mcp.json` 의 project/connection/schema/default 값이
  들어왔는지 확인.

## 3. Codex CLI

`~/.codex/config.toml` 에 추가:

Codex 설정 예시는 [`docs/mcp-client-config.md`](mcp-client-config.md)를 단일 진실의
원천으로 삼는다.

검증: 세션에서 `ping` 툴 호출 가능한지 확인.

## Phase별 추가 시나리오

| Phase | 추가될 절차                                                                                                                                                                |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | config 파일이 (a) 정상, (b) 없음, (c) pid dead, (d) socket path not bound (UDS/Named Pipe connect 실패) 인 각 상태에서 client 연결을 시도해 동작 확인                      |
| 2     | mock UDS 서버 또는 (본체 작업 후) 실제 neosql Desktop 을 띄운 상태에서 `tools/list` / `tools/call` 왕복 — Node 도구 핸들러가 HTTP 메서드를 호출하여 결과를 반환하는지 확인 |
| 3     | 아래 Desktop readiness UX 시나리오 확인                                                                                                                                   |
| 4+    | 미설치 흐름 시나리오, Windows Named Pipe ACL 검증                                                                                                                          |

## Phase 3-1. Desktop readiness UX

대상 MCP host는 Inspector, Claude Code, Codex CLI 중 하나 이상을 사용한다. host별 설정은
[`docs/mcp-client-config.md`](mcp-client-config.md)를 따른다.

### 3-1-A. Desktop 실행 중

1. NeoSQL Desktop 을 실행한다.
2. profile 에 맞는 socket 이 생겼는지 확인한다.
   - macOS/Linux prod: `ls -la "$(python -c 'import os,tempfile; print(os.path.join(tempfile.gettempdir(), "neosql-mcp.sock"))')"`
   - macOS/Linux dev: `ls -la "$(python -c 'import os,tempfile; print(os.path.join(tempfile.gettempdir(), "neosql-mcp-dev.sock"))')"`
   - Windows prod: `Get-ChildItem \\.\pipe\ | Select-String neosql-mcp`
3. MCP host 에서 `listTables` 같은 upstream 의존 tool 을 호출한다.
4. 기대 결과: tool 이 원래 upstream RPC 를 실행하고 실제 결과를 반환한다.

### 3-1-B. Desktop 미실행

1. NeoSQL Desktop 을 완전히 종료한다.
2. MCP host 에서 `listTables` 같은 upstream 의존 tool 을 호출한다.
3. 기대 결과:
   - 첫 호출은 원래 tool 요청을 실행하지 않는다.
   - 응답 JSON 에 `status: "activation_requested"` 가 포함된다.
   - NeoSQL Desktop activation request 가 OS 에 전달된다.
4. Desktop 이 뜬 뒤 같은 tool 을 다시 호출한다.
5. 기대 결과: 두 번째 호출에서 실제 upstream RPC 결과가 반환된다.

### 3-1-C. stale POSIX socket

POSIX 에서만 확인한다.

1. NeoSQL Desktop 을 종료한다.
2. socket path 에 일반 파일을 만들어 stale socket 상태를 흉내낸다.
   - prod: `touch "$(python -c 'import os,tempfile; print(os.path.join(tempfile.gettempdir(), "neosql-mcp.sock"))')"`
   - dev: `touch "$(python -c 'import os,tempfile; print(os.path.join(tempfile.gettempdir(), "neosql-mcp-dev.sock"))')"`
3. MCP host 에서 upstream 의존 tool 을 호출한다.
4. 기대 결과:
   - 사용자-facing 상태는 `activation_requested` 로 미실행과 동일하게 보인다.
   - 응답 JSON 의 `healthStatus` 는 `stale_socket` 으로 진단 가능해야 한다.
   - 원래 tool 요청은 실행되지 않는다.

### 3-1-D. unresponsive/timeout

실제 Electron hang 을 만들기 어렵다면 mock UDS 서버 또는 개발 중단점으로 HTTP listener 가
연결은 받지만 응답하지 않는 상태를 만든다.

1. MCP host 에서 upstream 의존 tool 을 호출한다.
2. 기대 결과:
   - 응답 JSON 에 `status: "unresponsive"` 가 포함된다.
   - activation request 는 전송되지 않는다.
   - 이미 upstream 에 전달된 요청 timeout 은 자동 재시도되지 않는다.

## 트러블슈팅

| 증상                                      | 확인                                                                                                                                                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `neosql-mcp: command not found`           | `npm link` 미실행 또는 글로벌 bin 디렉터리가 PATH에 없음 (`npm bin -g` 로 경로 확인)                                                                                                                    |
| 옛 동작이 그대로 나옴                     | `npm run build` 누락 — dist 가 갱신되지 않은 채 실행됨                                                                                                                                                  |
| Inspector/클라이언트에서 응답 없이 끊김   | 로그는 stdout이 아니라 OS별 로그 파일로 나간다. macOS prod: `~/Library/Logs/NeoSqlMcp/neosql-mcp.log`, macOS dev: `~/Library/Logs/NeoSqlMcpDev/neosql-mcp.log`. 파일 destination 생성 실패 시에만 stderr로 fallback 된다. |
| `initialize` 실패                         | SDK 버전 불일치 가능성. `package.json` 의 `@modelcontextprotocol/sdk` 버전과 클라이언트 SDK 버전 점검                                                                                                   |
| upstream 호출이 `ENOENT` / `ECONNREFUSED` | electron-main 미기동 또는 socket path 불일치. config 파일의 `mcpSocketPath` 와 실제 socket 파일/Named Pipe 존재 여부 확인. POSIX 는 `ls -la <socketPath>`, Windows 는 `Get-ChildItem \\.\pipe\` 로 확인 |
| upstream socket 직접 호출 디버깅          | POSIX: `curl --unix-socket <socketPath> http://localhost/<path>`. Windows: `Invoke-WebRequest` 가 Named Pipe 미지원 → PowerShell 별도 도구 (e.g. `npipe-curl`) 사용                                     |
