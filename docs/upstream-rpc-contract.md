# Upstream RPC Contract

`neosql-mcp` Node 패키지와 neosql Electron main/app 사이의 JSON-RPC over HTTP
계약이다. Phase 2-3 Node handler와 Phase 2-4 이후 Electron HTTP dispatcher는 이
문서를 기준으로 맞춘다.

## Transport

- HTTP path: `/mcp/rpc`
- HTTP method: `POST`
- POSIX transport: Unix Domain Socket
- Windows transport: Named Pipe
- TCP port는 사용하지 않는다.
- Body encoding: UTF-8 JSON

HTTP status 원칙:

| Status | 의미                                                        |
| -----: | ----------------------------------------------------------- |
|    200 | JSON-RPC success 또는 JSON-RPC error                        |
|    400 | HTTP body가 JSON이 아니거나 JSON-RPC envelope가 아님        |
|    404 | `/mcp/rpc`가 아닌 path                                      |
|    405 | POST 외 method                                              |
|    500 | dispatcher crash 등 JSON-RPC error로 만들 수 없는 서버 오류 |

도구 실행 실패, validation 실패, project/connection/schema 미존재는 HTTP 200 +
JSON-RPC error로 반환한다.

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
    "code": -32013,
    "message": "Schema not found: 'public' in connection 'local'",
    "data": {
      "kind": "schema-not-found"
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
- JSON-RPC error를 MCP `tools/call` error result로 변환

Electron responsibility:

- project assignment/permission validation
- active project/session 준비
- connection/schema lookup
- app store, renderer-facing state, SQL Editor, ERD, code generation, DDL 실행 처리
- domain validation과 domain error 반환

## Error Codes

|   Code | Kind                   | 의미                                    |
| -----: | ---------------------- | --------------------------------------- |
| -32600 | `invalid-request`      | JSON-RPC request 형식 오류              |
| -32601 | `method-not-found`     | 알 수 없는 RPC method                   |
| -32602 | `invalid-params`       | params schema 오류                      |
| -32603 | `internal-error`       | 처리 중 예상 못한 예외                  |
| -32001 | `app-not-ready`        | Electron app/project session 준비 안 됨 |
| -32010 | `context-required`     | 필수 context 누락                       |
| -32011 | `project-not-assigned` | 현재 사용자에게 project 권한 없음       |
| -32012 | `connection-not-found` | connection 없음                         |
| -32013 | `schema-not-found`     | schema 없음                             |
| -32020 | `validation-failed`    | tool/domain validation 실패             |
| -32030 | `execution-failed`     | SQL/DDL/codegen 등 실행 실패            |
| -32040 | `permission-denied`    | DDL 제한 등 권한 정책 위반              |
| -32050 | `upstream-timeout`     | 내부 처리 timeout                       |

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

`getContextHelp`는 Node-local이다. Electron RPC method를 만들지 않는다.

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
  remarks?: string | null;
  columns: McpColumnDef[];
  primaryKeys?: string[];
  importedKeys?: McpImportedKeyDef[];
  indexes?: McpIndexDef[];
  constraints?: McpConstraintDef[];
}

interface McpColumnDef {
  name: string;
  type: string;
  size?: number | null;
  decimalDigits?: number | null;
  nullable?: boolean;
  autoIncrement?: boolean;
  defaultValue?: string | null;
  remarks?: string | null;
}

interface McpImportedKeyDef {
  fkName: string;
  fkColumnName: string;
  pkTableName: string;
  pkColumnName: string;
  deferrable?: boolean | null;
  initiallyDeferred?: boolean | null;
}

interface McpIndexDef {
  indexName: string;
  columnNames: string[];
  unique?: boolean;
}

interface McpConstraintDef {
  name: string;
  type: 'UNIQUE' | 'CHECK' | 'EXCLUSION' | string;
  columns?: string[];
  expression?: string;
  exclusionClause?: string;
  deferrable?: boolean | null;
  initiallyDeferred?: boolean | null;
  comment?: string;
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
  newTableName?: string | null;
  remarksOperation?: McpRemarksOperation | null;
  primaryKeyOperations?: McpPrimaryKeyOperation[] | null;
  columnOperations?: McpColumnOperation[] | null;
  indexOperations?: McpIndexOperation[] | null;
  foreignKeyOperations?: McpForeignKeyOperation[] | null;
  constraintOperations?: McpConstraintOperation[] | null;
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
  newColumnName?: string | null;
  afterColumn?: string | null;
  type?: string | null;
  size?: number | null;
  decimalDigits?: number | null;
  nullable?: boolean | null;
  autoIncrement?: boolean | null;
  defaultValue?: string | null;
  remarks?: string | null;
}

interface McpIndexOperation {
  action: 'ADD' | 'DROP';
  indexName: string;
  columnNames?: string[] | null;
  unique?: boolean | null;
}

interface McpForeignKeyOperation {
  action: 'ADD' | 'DROP';
  fkName: string;
  fkColumnName?: string | null;
  pkTableName?: string | null;
  pkColumnName?: string | null;
  deferrable?: boolean | null;
  initiallyDeferred?: boolean | null;
}

interface McpConstraintOperation {
  action: 'ADD' | 'DROP';
  name: string;
  type?: 'UNIQUE' | 'CHECK' | 'EXCLUSION' | string | null;
  columns?: string[] | null;
  expression?: string | null;
  exclusionClause?: string | null;
  deferrable?: boolean | null;
  initiallyDeferred?: boolean | null;
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
  templatePackId?: string;
  schema?: string;
}
```

Node transforms input for Electron:

```ts
interface GenerateCodeElectronInput {
  tableNames: string[];
  templatePackId?: string;
}
```

Rules:

- Current app handler uses the project-configured template pack.
- `templatePackId` is kept in the MCP/contract surface for compatibility. The current
  server/app behavior is acceptable as-is, so no additional code change is required for
  `CodeGenerationTools` unless the template-pack selection policy changes.

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

- `templatePackId` is accepted by the old Java tool and forwarded by Node for compatibility, but
  the current app handler uses the project-configured template pack. No separate code change is
  required for the current Phase 2 MCP server scope.
- Node generates an upstream `sessionId` once per server instance/stdio connection. This
  is not the MCP Streamable HTTP `Mcp-Session-Id` header; it is a NeoSQL upstream grouping
  key.
