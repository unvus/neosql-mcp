# MCP Client Config

이 문서는 NeoSQL MCP host 설정의 단일 진실의 원천이다. `.mcp.json`,
Codex `config.toml`, 기존 HTTP MCP 설정과 to-be stdio/npx 설정의 매핑은 이 문서를
기준으로 유지한다.

## To-Be: stdio / npx

NeoSQL MCP host는 `neosql-mcp`를 stdio server process로 실행한다. Desktop app과의
통신은 이 Node process가 UDS/Named Pipe upstream RPC로 위임한다.

실제 CLI 호출 형태는 다음과 같다.

```bash
npx neosql-mcp --project=6c9fede500f949079f7c553cfd96ec72 --default-connection=88 --default-schema=appdb
```

### Claude Code `.mcp.json`

```json
{
  "mcpServers": {
    "neosql": {
      "command": "npx",
      "args": [
        "-y",
        "neosql-mcp",
        "--profile=prod",
        "--project=6c9fede500f949079f7c553cfd96ec72",
        "--default-connection=88",
        "--default-schema=appdb"
      ]
    }
  }
}
```

### Codex `config.toml`

```toml
[mcp_servers.neosql]
command = "npx"
args = [
  "-y",
  "neosql-mcp",
  "--profile=prod",
  "--project=6c9fede500f949079f7c553cfd96ec72",
  "--default-connection=88",
  "--default-schema=appdb",
]
```

### Local Linked Binary

개발 중 `npm link`를 사용하면 `npx` 대신 linked binary를 직접 실행할 수 있다.

```json
{
  "mcpServers": {
    "neosql": {
      "command": "neosql-mcp",
      "args": [
        "--profile=prod",
        "--project=6c9fede500f949079f7c553cfd96ec72",
        "--default-connection=88",
        "--default-schema=appdb"
      ]
    }
  }
}
```

## Dev Profile

기본 profile은 prod다. NeoSQL Desktop dev build가 `neosql-mcp-dev` socket/pipe suffix로
listen하는 경우 MCP server에도 `--profile=dev`를 전달한다.

```json
{
  "mcpServers": {
    "neosql": {
      "command": "npx",
      "args": ["-y", "neosql-mcp", "--profile=dev"]
    }
  }
}
```

`--profile=dev`와 `--profile=prod`가 둘 다 있으면 마지막 유효 profile 값이 우선한다.
기존 `--dev`와 `--prod`는 legacy alias로 유지한다.

`profile`은 다른 CLI option과 같은 `args` 배열에 넣을 수 있다. prod는 기본값이므로
생략 가능하지만, 명시하려면 `--profile=prod`를 사용한다.

## Legacy HTTP Config

기존 embedded-server MCP는 HTTP endpoint와 headers로 context를 주입했다.

```json
{
  "mcpServers": {
    "neosql": {
      "type": "http",
      "url": "http://localhost:8098/mcp",
      "headers": {
        "x-neosql-project": "6c9fede500f949079f7c553cfd96ec72",
        "x-neosql-connection": "88",
        "x-neosql-schema": "appdb"
      }
    }
  }
}
```

to-be stdio transport에는 HTTP headers가 없으므로 같은 값을 CLI initial context option으로
전달한다.

## Mapping

| Legacy HTTP header     | To-be CLI arg          | Context field  | Type    |
| ---------------------- | ---------------------- | -------------- | ------- |
| `x-neosql-project`     | `--project`            | `projectId`    | string  |
| `x-neosql-connection`  | `--default-connection` | `connectionId` | string  |
| `x-neosql-schema`      | `--default-schema`     | `schema`       | string  |

## CLI Option Rules

지원 형식:

```text
--project <value>
--project=<value>
--default-connection <value>
--default-connection=<value>
--default-schema <value>
--default-schema=<value>
--profile <prod|dev>
--profile=<prod|dev>
```

규칙:

- MCP host 설정 예시는 한 option을 한 문자열로 다루기 쉬운 `--key=value` 형식을 기본으로 쓴다.
- `project`, `default-connection`, `default-schema`는 string으로 저장한다.
- `profile`은 `prod` 또는 `dev`만 해석한다. 값이 없거나 유효하지 않으면 기존 profile을 유지한다.
- string 값이 빈 문자열이면 context store merge 단계에서 기존 값을 유지한다.
- `connectionId`는 숫자처럼 보여도 string으로 유지한다. Electron app handler가 필요한
  시점에 숫자로 변환한다.

## Context Resolution

Node MCP server의 context 우선순위:

1. tool argument explicit override
2. Node context store
   - CLI initial context로 최초 설정
   - 이후 `setContext` tool로 갱신 가능
3. empty context

예를 들어 `.mcp.json`에서 `--default-schema appdb`를 설정했더라도 `listTables` 호출에
`schema: "analytics"`가 명시되면 해당 호출은 `analytics`를 우선한다.

## Upstream Params

Electron main으로 전달되는 upstream JSON-RPC params는 아래 구조를 따른다.

```ts
interface UpstreamToolParams<TInput> {
  sessionId: string;
  context: {
    projectId?: string;
    connectionId?: string;
    schema?: string;
  };
  input: TInput;
}
```

`sessionId`는 Node process가 생성하는 upstream grouping key다. MCP Streamable HTTP의
`Mcp-Session-Id` header가 아니다.
