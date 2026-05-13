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
  "method": "schema.listTables",
  "params": {
    "sessionId": "mcp-session-id",
    "context": {
      "projectId": "project-id",
      "connectionId": "0",
      "schema": "public"
    },
    "input": {}
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
  context: {
    projectId?: string;
    connectionId?: string;
    schema?: string;
  };
  input: TInput;
}
```

Node responsibility:

- MCP tool input schema validation
- context store merge
- JSON-RPC method 호출
- JSON-RPC error를 MCP `tools/call` response로 변환
  - 기본 upstream tool은 `isError: true` tool result로 변환한다.
  - `executeQuery`는 SQL editor UX 호환을 위해 RPC error와 DDL rejection을 정상
    tool result의 `{ success: false, message }` JSON으로 반환한다.
  - desktop lifecycle/access 계열 error(`app-not-ready`, `unavailable`,
    `unauthenticated`, `timeout`)는
    공통 사용자-facing JSON error result로 변환한다.

Electron responsibility:

- project assignment/permission validation
- active project/session 준비
- connection/schema lookup
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
| -32002 | `unavailable`          | project session 초기화 timeout 등 일시 처리 불가 |
| -32003 | `forbidden`            | 현재 사용자에게 project 권한 없음                |

현재 Electron dispatcher는 `connection-not-found`, `schema-not-found`, `execution-failed`
같은 domain-specific kind를 별도 code로 세분화하지 않는다. handler가 `errorKind` 없이
`success: false`를 반환하면 `handler-error` / `-32000`으로 감싼다. Node는 code보다
`error.data.kind`를 기준으로 lifecycle/access error를 분기한다.

## Methods

| MCP tool          | RPC method                    | Electron 호출 | Timeout |
| ----------------- | ----------------------------- | ------------- | ------: |
| `listConnections` | `connection.list`             | yes           |     30s |
| `listTables`      | `schema.listTables`           | yes           |     30s |
| `getTableDetails` | `schema.getTableDetails`      | yes           |     30s |
| `executeQuery`    | `sql.executeQuery`            | yes           |     60s |
| `createTables`    | `ddl.createTables`            | yes           |     60s |
| `modifyTables`    | `ddl.modifyTables`            | yes           |     60s |
| `generateCode`    | `codeGeneration.generateCode` | yes           |     60s |
| `getContextHelp`  | N/A                           | no            |     N/A |

이 표는 upstream RPC를 호출하거나 upstream context contract와 직접 관련된 MCP tool만
다룬다. `ping`과 `getMcpSessionId`는 Node-local diagnostic tool이므로 Electron RPC
method를 만들지 않는다. `getContextHelp`도 Node-local이다.

## Per-call Context Override

일부 MCP tool은 `connectionId`와 `schema`를 tool argument로 받을 수 있다. 이 값은
Electron payload가 아니라 upstream `params.context`에 merge된다.

우선순위:

1. tool argument `connectionId` / `schema`
2. Node context store (`--default-connection`, `--default-schema`)
3. empty context

`generateCode`는 현재 `connectionId` per-call override를 받지 않는다. 기존 호환성을 위해
`schema` override만 유지한다.

## `connection.list`

Input:

```ts
type ListConnectionsInput = Record<string, never>;
```

Context requirements:

- `projectId`

Rules:

- `connectionId` and `schema` context values are ignored.
- Only connections that are not disabled and have at least one MCP-enabled schema are returned.
- Only schemas with `mcpConfigMap[schemaName].enabled === true` are returned under each connection.
- Returned `connectionId` values are stringified `Connection.id` values and can be passed as
  per-tool `connectionId` arguments.
- Returned `schemaName` values can be passed as per-tool `schema` arguments.

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
}

interface ConnectionProfileInfo {
  envPreset: string;
  label: string | null;
  protection: string;
}

interface SchemaInfo {
  schemaName: string;
  ddlExecute: boolean;
  autoCommit: boolean;
}
```

## `schema.listTables`

Input:

```ts
interface ListTablesInput {
  connectionId?: string; // MCP input only; forwarded through params.context
  schema?: string;
  search?: string;
}
```

Context requirements:

- `projectId`
- `connectionId`
- `schema` after input override

Rules:

- `connectionId` is removed from upstream `input` and sent through `params.context`.
- `schema` remains in upstream `input` for compatibility and is also merged into
  `params.context`.

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

## `schema.getTableDetails`

Input:

```ts
interface GetTableDetailsInput {
  tableNames: string[];
  connectionId?: string; // MCP input only; forwarded through params.context
  schema?: string;
}
```

Context requirements:

- `projectId`
- `connectionId` after input override
- `schema` after input override

Rules:

- `connectionId` is removed from upstream `input` and sent through `params.context`.
- `schema` remains in upstream `input` for compatibility and is also merged into
  `params.context`.

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

## `sql.executeQuery`

Input:

```ts
interface ExecuteQueryInput {
  sql: string;
  connectionId?: string; // MCP input only; forwarded through params.context
  schema?: string; // MCP input only; forwarded through params.context
}
```

Rules:

- DDL (`CREATE`, `ALTER`, `DROP`, `TRUNCATE`) is rejected.
- SELECT/EXPLAIN returns up to 200 rows.
- `connectionId` and `schema` are removed from upstream `input` and sent through
  `params.context`.

Context requirements:

- `projectId`
- `connectionId` after input override
- `schema` after input override

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

## `ddl.createTables`

Input:

```ts
interface CreateTablesInput {
  tableDefinitions: McpTableDef[];
  connectionId?: string; // MCP input only; forwarded through params.context
  schema?: string; // MCP input only; forwarded through params.context
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

- `connectionId` and `schema` are removed from upstream `input` and sent through
  `params.context`.

Context requirements:

- `projectId`
- `connectionId` after input override
- `schema` after input override

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

## `ddl.modifyTables`

Input:

```ts
interface ModifyTablesInput {
  alterations: McpAlterTableDef[];
  connectionId?: string; // MCP input only; forwarded through params.context
  schema?: string; // MCP input only; forwarded through params.context
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
- `connectionId` and `schema` are removed from upstream `input` and sent through
  `params.context`.

Context requirements:

- `projectId`
- `connectionId` after input override
- `schema` after input override

Result:

```ts
interface ModifyTablesResult {
  modified: Array<{ name: string; warnings?: string[] }>;
  failed?: Array<{ name: string; error: string }>;
  ddlExecution?: DdlExecutionResult;
}
```

## `codeGeneration.generateCode`

Input:

```ts
interface GenerateCodeInput {
  tableName: string;
  templatePackId: string;
  schema?: string;
}
```

Node transforms input for Electron:

```ts
interface GenerateCodeElectronInput {
  tableNames: string[];
  templatePackId: string;
}
```

Rules:

- `tableName` is transformed to single-item `tableNames`.
- `schema` is removed from upstream `input` and sent through `params.context`.
- `templatePackId` is required by the Node MCP tool schema and is forwarded to upstream
  `input`.
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
