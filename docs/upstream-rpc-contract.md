# Upstream RPC Contract

`neosql-mcp` Node 패키지와 neosql Electron main/app 사이의 JSON-RPC over HTTP
계약이다. Phase 2-3 Node handler와 Phase 2-4 이후 Electron HTTP dispatcher는 이
문서를 기준으로 맞춘다.

## Transport

- HTTP path: `/mcp/rpc`
- HTTP method: `POST`
- macOS transport: Unix Domain Socket
- Windows transport: Named Pipe
- TCP port는 사용하지 않는다.
- Body encoding: UTF-8 JSON

현재 Electron 구현은 `process.platform !== 'win32'`에서 Unix Domain Socket을 사용한다.
지원 대상은 NeoSQL Desktop 지원 범위에 맞춰 macOS와 Windows로 문서화한다.

HTTP status 원칙:

| Status | 의미                                                        |
| -----: | ----------------------------------------------------------- |
|    200 | JSON-RPC success 또는 JSON-RPC error                        |
|    400 | HTTP body가 JSON이 아니거나 body를 읽을 수 없음             |
|    404 | `/mcp/rpc`가 아닌 path                                      |
|    405 | POST 외 method                                              |
|    500 | dispatcher crash 등 JSON-RPC error로 만들 수 없는 서버 오류 |

JSON-RPC envelope validation, 도구 실행 실패, validation 실패,
project/connection/schema 미존재는 HTTP 200 + JSON-RPC error로 반환한다.

이 표는 Electron dispatcher 계약이다. Node test helper는 일부 negative HTTP case를
단순화할 수 있으므로 dispatcher 구현 시 이 표를 기준으로 맞춘다.

## JSON-RPC Envelope

Request:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "list-tables",
  "params": {
    "sessionId": "mcp-session-id",
    "input": {
      "connectionId": "0",
      "database": null,
      "schema": "public"
    }
  }
}
```

Success response:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {}
}
```

Error response:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32000,
    "message": "Schema not found: 'public' in connection 'local'",
    "data": {
      "kind": "handler-error"
    }
  }
}
```

## Common Params

```ts
interface UpstreamToolParams<TInput> {
  sessionId: string;
  input: TInput;
}
```

Node responsibility:

- MCP tool input schema validation
- DB 도구의 전체 좌표 명시 또는 전체 생략 검증
- 도구 입력의 좌표 존재 여부를 `params.input`에 보존
- JSON-RPC method 호출
- JSON-RPC error를 MCP `tools/call` response로 변환
  - 기본 upstream tool은 `isError: true` tool result로 변환한다.
  - `execute-query`는 SQL editor UX 호환을 위해 RPC error와 DDL rejection을 정상
    tool result의 `{ success: false, message }` JSON으로 반환한다.
  - desktop lifecycle/access 계열 error(`app-not-ready`, `unavailable`,
    `unauthenticated`, `timeout`)는
    공통 사용자-facing JSON error result로 변환한다.
  - `project-not-selected`는 Renderer가 현재 locale로 생성한 message를 변형하지 않고
    그대로 MCP error text로 반환한다.

Electron responsibility:

- 현재 활성 프로젝트와 project session 일치 여부 검증
- 프로젝트 Default 또는 전체 명시 좌표 해석
- connection/database/schema lookup
- app store, renderer-facing state, SQL Editor, ERD, code generation, DDL 실행 처리
- domain validation과 domain error 반환

## Error Codes

현재 구현 기준:

|   Code | Kind                   | 의미                                             |
| -----: | ---------------------- | ------------------------------------------------ |
| -32600 | `invalid-request`      | JSON-RPC request 형식 오류                       |
| -32601 | `method-not-found`     | 알 수 없는 RPC method                            |
| -32602 | `invalid-params`       | params schema 오류                               |
| -32000 | `handler-error`        | handler가 구체 kind 없이 실패를 반환             |
| -32000 | `dispatch-error`       | main → renderer dispatch 중 예상 못한 예외       |
| -32000 | `duplicate-request-id` | renderer bridge pending request id 충돌          |
| -32001 | `unauthenticated`      | NeoSQL Desktop 로그인 필요                       |
| -32001 | `timeout`              | renderer response timeout                        |
| -32002 | `app-not-ready`        | renderer target 또는 renderer handler 준비 안 됨 |
| -32002 | `project-not-selected` | Desktop 활성 프로젝트 또는 준비된 session 없음  |
| -32002 | `unavailable`          | project session 초기화 timeout 등 일시 처리 불가 |
| -32003 | `forbidden`            | 현재 사용자에게 project 권한 없음                |

현재 Electron dispatcher는 `connection-not-found`, `schema-not-found`, `execution-failed`
같은 domain-specific kind를 별도 code로 세분화하지 않는다. handler가 `errorKind` 없이
`success: false`를 반환하면 `handler-error` / `-32000`으로 감싼다. Node는 code보다
`error.data.kind`를 기준으로 lifecycle/access error를 분기한다.

## Methods

| MCP tool            | RPC method          | Electron 호출 | Timeout |
| ------------------- | ------------------- | ------------- | ------: |
| `list-connections`  | `list-connections`  | yes           |     30s |
| `list-tables`       | `list-tables`       | yes           |     30s |
| `get-table-details` | `get-table-details` | yes           |     30s |
| `execute-query`     | `execute-query`     | yes           |     60s |
| ~~`create-tables`~~ | `create-tables`     | yes           |     60s |
| ~~`modify-tables`~~ | `modify-tables`     | yes           |     60s |
| `get-context-help`  | N/A                 | no            |     N/A |

`create-tables` / `modify-tables`는 **더 이상 MCP tool로 등록되지 않는다.** Electron
화이트리스트와 renderer handler는 남아 있어 구버전 `neosql-mcp` 패키지가 보내는 요청은
계속 처리되지만, 신규 클라이언트는 이 method를 호출하지 않는다. LLM이 실행하는 DDL은
`execute-query`로 간다. handler 제거 시점은 최소 지원 `neosql-mcp` 버전이 이 두 tool을
등록하지 않는 릴리스 이상으로 올라간 뒤다.

이 표는 upstream RPC를 호출하거나 upstream context contract와 직접 관련된 MCP tool만
다룬다. `ping`, `get-mcp-session-id`, `get-context-help`, `generate-code`는 Node-local
tool이므로 Electron RPC method를 만들지 않는다. `generate-code`는 현재 개발중
placeholder로 `개발중입니다`를 반환한다.

## Database Coordinate Contract

`list-tables`, `get-table-details`, `execute-query`, `create-tables`, `modify-tables`는
`connectionId`, `database`, `schema`를 모두 명시하거나 모두 생략한다.

- 전체 명시: Node가 세 필드의 존재 여부를 유지해 `params.input`으로 전달한다.
- 전체 생략: Node는 좌표 필드를 만들지 않는다. Renderer가 활성 프로젝트의 enabled
  Default를 해석한다.
- 일부 명시: Node에서 MCP `invalid-params`로 거부하고 upstream을 호출하지 않는다.
- `database: null`: database 계층이 없는 DBMS의 유효한 명시 값이다.
- 명시 좌표가 무효여도 프로젝트 Default로 fallback하지 않는다.

Electron main은 이전 Node 패키지 호환을 위해 기존 `params.context` fallback을 당분간
허용하지만, 새 Node 요청은 `context`를 보내지 않는다. Renderer는 어떤 경로로 들어온
요청이든 같은 전체 좌표/Default 및 MCP 정책 검증을 수행한다.

## `list-connections`

Input:

```ts
type ListConnectionsInput = Record<string, never>;
```

Rules:

- 파라미터 없이 현재 NeoSQL Desktop 활성 프로젝트를 사용한다.
- Only connections that are not disabled and have at least one MCP-enabled schema are returned.
- Only schemas with matching `(databaseName, schemaName)` MCP config `enabled === true` are
  returned under each connection.
- Returned `connectionId` values are stringified `Connection.id` values and can be passed as
  per-tool `connectionId` arguments.
- Returned `databaseName` / `schemaName` values can be passed as per-tool `database` / `schema`
  arguments. SQLServer connections additionally expose database-grouped coordinates under
  `databases`.

Result:

```ts
interface ListConnectionsResult {
  connections: ConnectionInfo[];
}

interface ConnectionInfo {
  connectionId: string;
  name: string;
  description: string;
  dataSource: string;
  dbVersion: string;
  profile: ConnectionProfileInfo | null;
  schemas: SchemaInfo[];
  databases?: DatabaseInfo[];
}

interface ConnectionProfileInfo {
  envPreset: string;
  label: string | null;
  protection: string;
}

interface SchemaInfo {
  databaseName: string | null;
  schemaName: string;
  autoCommit: boolean;
}

interface DatabaseInfo {
  databaseName: string | null;
  schemas: SchemaInfo[];
}
```

## `list-tables`

Input:

```ts
interface ListTablesInput {
  connectionId?: string;
  database?: string | null;
  schema?: string;
  search?: string;
}
```

Rules:

- 세 좌표를 모두 명시하거나 모두 생략한다.
- Node는 좌표와 `search`를 모두 `params.input`에 유지한다.
- Electron main이 좌표를 renderer request field로 추출하고 실제 tool payload에서는 제거한다.

Result:

```ts
interface TableInfo {
  tableName: string;
  tableType: string;
  comment: string;
}

type ListTablesResult = TableInfo[];
```

Node handler는 upstream result shape를 변환하지 않고 JSON text로 반환한다. 현재
Electron handler는 배열을 직접 반환한다.

## `get-table-details`

Input:

```ts
interface GetTableDetailsInput {
  tableNames: string[];
  connectionId?: string;
  database?: string | null;
  schema?: string;
}
```

Rules:

- 세 좌표를 모두 명시하거나 모두 생략한다.
- Node는 좌표와 `tableNames`를 모두 `params.input`에 유지한다.
- Electron main이 좌표를 renderer request field로 추출하고 실제 tool payload에서는 제거한다.

Result:

```ts
interface TableDetail {
  tableName: string;
  tableType: string;
  comment: string;
  columns: Array<{
    columnName: string;
    dataType: string;
    size: number | null;
    decimalDigits: number | null;
    nullable: boolean;
    defaultValue: string;
    primaryKey: boolean;
    comment: string;
  }>;
  indexes: Array<{
    indexName: string;
    unique: boolean;
    columns: string[];
  }>;
  foreignKeys: Array<{
    fkName: string;
    fkColumnName: string;
    pkTableName: string;
    pkColumnName: string;
  }>;
  constraints: Array<{
    name: string;
    type: string;
    columns?: string[];
    expression?: string;
    exclusionClause?: string;
    deferrable?: boolean;
    initiallyDeferred?: boolean;
  }>;
}

interface GetTableDetailsResult {
  tables: TableDetail[];
  notFound?: string[];
}
```

## `execute-query`

Input:

```ts
interface ExecuteQueryInput {
  sql: string;
  connectionId?: string;
  database?: string | null;
  schema?: string;
}
```

Rules:

- DDL (`CREATE`, `ALTER`, `DROP`, `TRUNCATE`, ...)은 허용되지만 NeoSQL 쪽 승인 게이트를
  거친다. 정책에 따라 즉시 실행 / 사용자 확인 다이얼로그 / 즉시 거절 중 하나이며, 거절
  사유는 **에러 메시지 문자열로만** 전달된다 — Node가 RPC 에러를 `{success:false, message}`로
  변환하면서 error code와 `data.kind`를 버리기 때문이다. 문구가 재시도 가능 여부를 명시한다.
- 확인 다이얼로그는 동시에 하나만 뜬다. 대기 중인 확인이 있으면 다음 DDL 요청은 모달 없이
  즉시 거절된다.
- SELECT/EXPLAIN returns up to 200 rows.
- 세 좌표를 모두 명시하거나 모두 생략하며 Node는 이를 `params.input`에 유지한다.
- Electron main이 좌표를 renderer request field로 추출하고 SQL payload에서는 제거한다.

Result:

```ts
type ExecuteQueryResult =
  | {
      type: 'SELECT';
      sql: string;
      executionTimeMs: number;
      columns: string[];
      columnTypes: string[];
      rows: unknown[][];
      rowCount: number;
      truncated: boolean;
    }
  | {
      type: 'UPDATE';
      sql: string;
      executionTimeMs: number;
      affectedRows: number;
      autoCommit: boolean;
      message?: string;
    }
  | {
      type: string;
      sql: string;
      executionTimeMs: number;
    };
```

## `create-tables`

Input:

```ts
interface CreateTablesInput {
  tableDefinitions: McpTableDef[];
  connectionId?: string;
  database?: string | null;
  schema?: string;
}

interface McpTableDef {
  name: string;
  remarks: string;
  columns: McpColumnDef[];
  primaryKeys: string[];
  importedKeys: McpImportedKeyDef[];
  indexes: McpIndexDef[];
  constraints: McpConstraintDef[];
}

interface McpColumnDef {
  name: string;
  type: string;
  size: number;
  decimalDigits: number;
  nullable: boolean;
  autoIncrement: boolean;
  defaultValue: string;
  remarks: string;
}

interface McpImportedKeyDef {
  fkName: string;
  fkColumnName: string;
  pkTableName: string;
  pkColumnName: string;
  deferrable: boolean;
  initiallyDeferred: boolean;
}

interface McpIndexDef {
  indexName: string;
  columnNames: string[];
  unique: boolean;
}

interface McpConstraintDef {
  name: string;
  type: 'UNIQUE' | 'CHECK' | 'EXCLUSION' | string;
  columns: string[];
  expression: string;
  exclusionClause: string;
  deferrable: boolean;
  initiallyDeferred: boolean;
  comment: string;
}
```

Rules:

- 세 좌표를 모두 명시하거나 모두 생략하며 Node는 이를 `params.input`에 유지한다.
- Electron main이 좌표를 renderer request field로 추출하고 DDL payload에서는 제거한다.

Result:

```ts
interface CreateTablesResult {
  created: Array<{ name: string }>;
  failed?: Array<{ name: string; error: string }>;
  ddlExecution?: DdlExecutionResult;
}

interface DdlExecutionResult {
  executed: boolean;
  error?: string;
  results?: Array<{
    name: string;
    success: boolean;
    executedCount?: number;
    ddlStatements?: string[];
    error?: string;
    fkError?: string;
  }>;
}
```

## `modify-tables`

Input:

```ts
interface ModifyTablesInput {
  alterations: McpAlterTableDef[];
  connectionId?: string;
  database?: string | null;
  schema?: string;
}

interface McpAlterTableDef {
  tableName: string;
  newTableName: string;
  remarksOperation?: McpRemarksOperation | null;
  primaryKeyOperations?: McpPrimaryKeyOperation[] | null;
  columnOperations: McpColumnOperation[];
  indexOperations: McpIndexOperation[];
  foreignKeyOperations: McpForeignKeyOperation[];
  constraintOperations: McpConstraintOperation[];
}

interface McpRemarksOperation {
  modify?: boolean;
  remarks?: string;
}

interface McpPrimaryKeyOperation {
  action: 'ADD' | 'DROP';
  columnName: string;
}

interface McpColumnOperation {
  action: 'ADD' | 'DROP' | 'MODIFY' | 'RENAME';
  columnName: string;
  newColumnName: string;
  afterColumn: string;
  type: string;
  size: number;
  decimalDigits: number;
  nullable: boolean;
  autoIncrement: boolean;
  defaultValue: string;
  remarks: string;
}

interface McpIndexOperation {
  action: 'ADD' | 'DROP';
  indexName: string;
  columnNames: string[];
  unique: boolean;
}

interface McpForeignKeyOperation {
  action: 'ADD' | 'DROP';
  fkName: string;
  fkColumnName: string;
  pkTableName: string;
  pkColumnName: string;
  deferrable: boolean;
  initiallyDeferred: boolean;
}

interface McpConstraintOperation {
  action: 'ADD' | 'DROP';
  name: string;
  type: 'UNIQUE' | 'CHECK' | 'EXCLUSION' | string;
  columns: string[];
  expression: string;
  exclusionClause: string;
  deferrable: boolean;
  initiallyDeferred: boolean;
}
```

Remarks operation semantics:

- `null`, omitted, or `modify: false`: no table comment change.
- `{ modify: true, remarks: "..." }`: apply the comment. Empty string is an intentional
  comment update.

Primary key operation semantics:

- `null`, omitted, or `[]`: no primary key change.
- `ADD`: append the column to the current primary key.
- `DROP`: remove that column from the current primary key.
- Dropping all primary key columns requires one explicit `DROP` operation per current PK column.
- Legacy `newRemarks` and `newPrimaryKeys` inputs are rejected by the Node MCP tool schema.
- 세 좌표를 모두 명시하거나 모두 생략하며 Node는 이를 `params.input`에 유지한다.
- Electron main이 좌표를 renderer request field로 추출하고 DDL payload에서는 제거한다.

Result:

```ts
interface ModifyTablesResult {
  modified: Array<{ name: string; warnings?: string[] }>;
  failed?: Array<{ name: string; error: string }>;
  ddlExecution?: DdlExecutionResult;
}
```

## `generate-code`

`generate-code` is currently a Node-local under-development placeholder. It does not call
an upstream RPC method and returns the text response `개발중입니다`.
- Current Electron handler ignores `payload.templatePackId` and loads
  `projectConfig.templatePack.id`.

Result:

```ts
interface GenerateCodeResult {
  success: true;
  message: string;
  files: string[];
  notFound?: string[];
}
```

## Open Items

- `templatePackId`는 Node MCP tool schema에서 required이고 Node가 upstream으로
  전달하지만, 현재 Electron handler는 `projectConfig.templatePack.id`를 사용한다.
  공개 API로 template pack 선택을 지원할지, 아니면 Node surface에서 제거할지 별도 결정이
  필요하다.
- 현재 Electron은 project session 초기화 실패를 `unavailable`로 반환하고 renderer 준비
  실패를 `app-not-ready`로 반환한다. Node lifecycle mapper는 두 kind를 같은 사용자
  경험으로 처리한다. 장기적으로 두 kind를 그대로 둘지, 하나의 lifecycle kind로 통일할지
  결정이 필요하다.
- 현재 renderer timeout은 `kind: "timeout"`이지만 code가 `-32001`로
  `unauthenticated`와 겹친다. Node는 kind를 기준으로 처리하므로 동작상 문제는 작지만,
  장기적으로는 timeout 전용 code를 분리하는 편이 명확하다.
- Node generates an upstream `sessionId` once per server instance/stdio connection. This
  is not the MCP Streamable HTTP `Mcp-Session-Id` header; it is a NeoSQL upstream grouping
  key.
