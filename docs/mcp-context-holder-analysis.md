# McpContextHolder Analysis And Design

Phase 2-2 보조 문서. 기존 embedded-server의 context/session 모델을 분석하고,
`neosql-mcp` Node stdio 구조에서 어떻게 대체할지 설계한다.

분석 기준 파일:

- `~/workspace/neosql/embedded-server/src/main/java/com/unvus/neosql/embedded/mcp/context/McpContext.java`
- `~/workspace/neosql/embedded-server/src/main/java/com/unvus/neosql/embedded/mcp/context/McpContextHolder.java`
- `~/workspace/neosql/embedded-server/src/main/java/com/unvus/neosql/embedded/mcp/context/McpContextFilter.java`
- `~/workspace/neosql/embedded-server/src/main/java/com/unvus/neosql/embedded/mcp/tool/ContextTools.java`
- `~/workspace/neosql/docs/backend/mcp-server.md`

참고:

- MCP Streamable HTTP transport의 `Mcp-Session-Id`는 HTTP transport session 관리용 header다.
- `neosql-mcp`는 MCP client와는 stdio transport로 통신하므로 이 header를 직접 받지 않는다.

## As-Is: Context Model

기존 embedded-server MCP는 HTTP MCP endpoint 위에서 동작했고, context는 두 계층으로
관리됐다.

| 계층               | 저장소                                  | 수명                      | 설정 위치                                             |
| ------------------ | --------------------------------------- | ------------------------- | ----------------------------------------------------- |
| request context    | `ThreadLocal<McpContext>`               | HTTP request 1회          | `McpContextFilter`가 HTTP headers에서 추출            |
| current session id | `ThreadLocal<String>`                   | HTTP request 1회          | `McpContextFilter`가 `Mcp-Session-Id` header에서 추출 |
| session context    | `ConcurrentHashMap<String, McpContext>` | MCP session 또는 JVM 수명 | `ContextTools.setContext`                             |

`McpContext` 필드:

| 필드           | 타입      | 의미                                                             |
| -------------- | --------- | ---------------------------------------------------------------- |
| `projectId`    | `String`  | NeoSQL project id                                                |
| `connectionId` | `String`  | NeoSQL connection id/index. Electron app handler는 number로 변환 |
| `schema`       | `String`  | database schema name                                             |
| `ddlExecute`   | `Boolean` | DDL 도구의 기본 즉시 실행 여부                                   |
| `autoCommit`   | `Boolean` | SQL DML의 기본 auto commit 여부                                  |

## As-Is: Header Inputs

`McpContextFilter`는 `/mcp` request에서 아래 header를 읽는다.

| Header                 | Context field      |
| ---------------------- | ------------------ |
| `x-neosql-project`     | `projectId`        |
| `x-neosql-connection`  | `connectionId`     |
| `x-neosql-schema`      | `schema`           |
| `x-neosql-ddl-execute` | `ddlExecute`       |
| `x-neosql-auto-commit` | `autoCommit`       |
| `Mcp-Session-Id`       | current session id |

Boolean header는 문자열이 `"true"`일 때만 true고, header가 없으면 null이다.

## As-Is: `Mcp-Session-Id` Generation And Use

확인 결과:

- neosql의 `McpContextFilter`, `McpContextHolder`, tool code는 `Mcp-Session-Id`를
  생성하지 않는다.
- embedded-server는 header 값을 읽어 `ThreadLocal currentSessionId`에 저장한다.
- `ContextTools.setContext`는 이 session id를 key로
  `ConcurrentHashMap<String, McpContext>`에 context를 저장한다.
- `ContextTools.getContext`는 이 session id로 session context 존재 여부를 판단한다.
- `SchemaTools`, `DdlTools`, `SqlTools`, `CodeGenerationTools`는
  `McpContextHolder.getSessionId()` 값을 `McpRequest.sessionId`에 담아 Electron app으로
  전달한다.
- Electron app은 `sessionId`를 요청 로그 grouping, `MCP: <sessionId>` SQL tab/ERD title,
  manual-commit SQL session grouping에 사용한다.

즉 as-is에서 `Mcp-Session-Id`는 두 가지 역할을 겸한다.

1. MCP HTTP transport session의 식별자
2. NeoSQL app 내부 작업 grouping key

기존 프로젝트 문서(`neosql/docs/backend/mcp-server.md`)는 Claude Code 대화 종료 시
새 session id가 발급된다고 설명한다. 다만 neosql 코드 관점에서는 이 값은 외부 MCP
transport layer가 준 opaque string이며, 생성 주기는 직접 통제하지 않는다.

## As-Is: Resolution Order

소스 코드 주석의 의도:

1. tool parameter explicit value
2. session context set by `setContext`
3. request header context
4. empty context

구현상 `McpContextHolder.getContext()`는 2와 3만 처리한다. 1번인 tool parameter
override는 각 tool에서 직접 처리한다.

`getContext()` 동작:

1. current session id가 있고 session context가 있으면 session context를 primary로 둔다.
2. request context도 있으면 field 단위로 merge한다.
3. primary field가 null이 아니면 primary 값을 사용한다.
4. primary field가 null이면 request context 값을 사용한다.
5. session context가 없고 request context가 있으면 request context를 반환한다.
6. 둘 다 없으면 `McpContext.empty()`를 반환한다.

세부사항:

- merge는 null 여부만 본다. 빈 문자열은 값으로 취급한다.
- `McpContext.hasProjectId()` 같은 helper는 blank check를 하지만 merge에는 사용되지 않는다.
- `clear()`는 request `ThreadLocal`과 current session id만 지운다.
- `clearSession(sessionId)`를 명시 호출하지 않으면 `sessionContextMap` entry는 JVM에 남는다.

## Transport Change Impact

as-is:

```text
MCP client -- Streamable HTTP /mcp --> embedded-server
```

to-be:

```text
MCP client -- stdio --> neosql-mcp Node -- JSON-RPC over HTTP on UDS/Named Pipe --> electron-main
```

중요한 차이:

- stdio transport에는 `Mcp-Session-Id` HTTP header가 없다.
- MCP client는 `npx neosql-mcp`를 subprocess로 실행한다.
- 일반적인 MCP host는 tool call마다 새 process를 띄우기보다 server process를 띄운 뒤
  stdio 연결을 유지하고 여러 tool call을 보낸다.
- 따라서 context 수명은 "HTTP MCP session"이 아니라 "Node MCP server process 또는
  stdio connection" 수명에 가까워진다.

## To-Be Design

Phase 2-3 구현 정책:

1. `createServer()` 호출마다 context store 하나를 만든다.
2. `setContext`, `getContext`, `getContextHelp`는 Node-local tool로 유지한다.
3. context resolution은 `tool parameter override > Node context store > empty context` 순서다.
4. string field(`projectId`, `connectionId`, `schema`)는 blank string이면 기존 값 유지로 처리한다.
5. boolean field(`ddlExecute`, `autoCommit`)는 false가 의미 있는 값이므로
   null/undefined와 false를 구분한다.
6. Electron upstream RPC에는 resolved context를 명시 params로 전달한다.
7. 기존 HTTP header default context는 stdio 구조에서 CLI 초기 context 옵션으로
   대응한다. MCP host 설정의 단일 진실은
   [`mcp-client-config.md`](mcp-client-config.md)다.

Context store shape:

```ts
interface NeosqlContext {
  projectId?: string;
  connectionId?: string;
  schema?: string;
  ddlExecute?: boolean;
  autoCommit?: boolean;
}

interface ContextStore {
  get(): NeosqlContext;
  set(patch: Partial<NeosqlContext>): NeosqlContext;
}
```

## To-Be Session Identity

`Mcp-Session-Id`를 그대로 받을 수 없으므로 Node가 upstream용 `sessionId`를 별도로
정한다.

Phase 2-3 정책:

- Node process에서 `crypto.randomUUID()`로 `mcpSessionId`를 1회 생성한다.
- 같은 Node server process/stdio connection 안의 모든 upstream RPC는 같은
  `mcpSessionId`를 사용한다.
- 값은 Electron app의 grouping key로만 사용한다.
- 이 값은 MCP Streamable HTTP의 `Mcp-Session-Id` header가 아니며, Node ↔ Electron
  자체 RPC params의 `sessionId`다.

권장 형식:

```text
<uuid>
```

이 방식의 효과:

- 기존 app의 `MCP: <sessionId>` SQL tab/ERD grouping 모델을 유지할 수 있다.
- DML manual commit에서 같은 MCP process 안의 후속 호출이 같은 SQL tab/session grouping을
  사용할 수 있다.
- Node process가 종료되면 context도 사라지므로 Java `ConcurrentHashMap`의 JVM 수명 누적
  문제는 Phase 2-3 기본 구조에서는 발생하지 않는다.

명시적 한계:

- MCP host가 매 tool call마다 Node process를 새로 띄우는 구현이라면 context는 호출마다
  사라진다. 이 경우 사용자는 매번 `setContext`를 다시 호출해야 한다.
- 일반적인 MCP stdio host는 process를 유지하지만, 이것을 영구 저장으로 간주하면 안 된다.
- 여러 MCP client connection을 하나의 Node process가 동시에 공유하는 구조가 생기면
  connection별 context store와 session id 분리가 필요하다.

## Contract Impact

Upstream JSON-RPC params는 HTTP header 대신 resolved context와 Node-generated
`sessionId`를 포함한다.

```ts
interface UpstreamToolParams<TInput> {
  sessionId: string;
  context: {
    projectId?: string;
    connectionId?: string;
    schema?: string;
    ddlExecute?: boolean;
    autoCommit?: boolean;
  };
  input: TInput;
}
```

Electron main/app handler는 `context`를 기존 WebSocket `McpRequestData`의 top-level
fields로 변환하거나, 새 handler에서 직접 사용하면 된다.

## Phase 2-3 Tasks

- `ContextStore`에 blank string 무시 정책 추가.
- `createServer()`에서 `upstreamSessionId` 생성.
- 모든 upstream RPC params에 `{ sessionId, context, input }` envelope 적용.
- `getContext` response에 `source`를 추가한다.
- `getContextHelp`에서 as-is HTTP header 예시를 제거하고 `setContext` 중심 안내로 바꾼다.
- `executeQuery` manual commit 시 `sessionId`가 Electron app에서 SQL tab grouping에
  사용된다는 점을 테스트 fixture에 반영한다.

## Follow-ups

- MCP SDK request `extra`에서 stdio connection을 안정적으로 구분할 수 있는지 확인한다.
- multi-client-in-one-process 구조가 필요해지면 `ContextStore`를 connection scoped로 바꾼다.
- MCP client 설정의 기존 HTTP header 값은 `--project`, `--connection`, `--schema`,
  `--ddl-execute`, `--auto-commit` CLI option 으로 주입한다. 상세 mapping은
  [`mcp-client-config.md`](mcp-client-config.md)를 따른다.
- Electron app 쪽 SQL/ERD/log grouping이 `<uuid>` 형식의 session id를 문제없이
  표시하는지 Phase 2-4 이후 e2e에서 확인한다.
