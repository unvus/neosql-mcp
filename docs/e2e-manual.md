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
npx @modelcontextprotocol/inspector neosql-mcp
```

- 브라우저 UI가 자동으로 열린다.
- **Tools** 탭 → `ping` 선택 → **Run Tool** → 응답 `"pong"` 확인.
- 핸드셰이크 / `tools/list` / `tools/call` 셋을 한 화면에서 본다. 어디서 끊겼는지 즉시 보이므로 디버깅 효율이 가장 좋다.

## 2. Claude Code

**방법 A — CLI 등록 (사용자 단위)**

```bash
claude mcp add neosql-ping neosql-mcp
```

**방법 B — 프로젝트 단위 (`.mcp.json`)**

```json
{
  "mcpServers": {
    "neosql": {
      "command": "npx",
      "args": [
        "-y",
        "neosql-mcp",
        "--project",
        "6c9fede500f949079f7c553cfd96ec72",
        "--connection",
        "88",
        "--schema",
        "appdb",
        "--ddl-execute",
        "false",
        "--auto-commit",
        "false"
      ]
    }
  }
}
```

검증:

- 세션에서 `/mcp` → `neosql` 가 connected 로 보이는지.
- 대화에서 "ping 툴 호출해줘" → `pong` 반환 확인.
- `getContext` 툴 호출 → `.mcp.json` 의 project/connection/schema/default 값이
  들어왔는지 확인.

## 3. Codex CLI

`~/.codex/config.toml` 에 추가:

```toml
[mcp_servers.neosql]
command = "npx"
args = [
  "-y",
  "neosql-mcp",
  "--project",
  "6c9fede500f949079f7c553cfd96ec72",
  "--connection",
  "88",
  "--schema",
  "appdb",
  "--ddl-execute",
  "false",
  "--auto-commit",
  "false",
]
```

검증: 세션에서 `ping` 툴 호출 가능한지 확인.

## Phase별 추가 시나리오

| Phase | 추가될 절차                                                                                                                                                                |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | config 파일이 (a) 정상, (b) 없음, (c) pid dead, (d) socket path not bound (UDS/Named Pipe connect 실패) 인 각 상태에서 client 연결을 시도해 동작 확인                      |
| 2     | mock UDS 서버 또는 (본체 작업 후) 실제 neosql Desktop 을 띄운 상태에서 `tools/list` / `tools/call` 왕복 — Node 도구 핸들러가 HTTP 메서드를 호출하여 결과를 반환하는지 확인 |
| 3+    | electron-app 자동 기동 / 미설치 흐름 시나리오, Windows Named Pipe ACL 검증                                                                                                 |

## 트러블슈팅

| 증상                                      | 확인                                                                                                                                                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `neosql-mcp: command not found`           | `npm link` 미실행 또는 글로벌 bin 디렉터리가 PATH에 없음 (`npm bin -g` 로 경로 확인)                                                                                                                    |
| 옛 동작이 그대로 나옴                     | `npm run build` 누락 — dist 가 갱신되지 않은 채 실행됨                                                                                                                                                  |
| Inspector/클라이언트에서 응답 없이 끊김   | 로그는 stdout이 아니라 **stderr**로 나간다 (pino 정책). Inspector 의 stderr 패널 또는 `neosql-mcp 2>/tmp/mcp.log` 로 분리해서 확인                                                                      |
| `initialize` 실패                         | SDK 버전 불일치 가능성. `package.json` 의 `@modelcontextprotocol/sdk` 버전과 클라이언트 SDK 버전 점검                                                                                                   |
| upstream 호출이 `ENOENT` / `ECONNREFUSED` | electron-main 미기동 또는 socket path 불일치. config 파일의 `mcpSocketPath` 와 실제 socket 파일/Named Pipe 존재 여부 확인. POSIX 는 `ls -la <socketPath>`, Windows 는 `Get-ChildItem \\.\pipe\` 로 확인 |
| upstream socket 직접 호출 디버깅          | POSIX: `curl --unix-socket <socketPath> http://localhost/<path>`. Windows: `Invoke-WebRequest` 가 Named Pipe 미지원 → PowerShell 별도 도구 (e.g. `npipe-curl`) 사용                                     |
