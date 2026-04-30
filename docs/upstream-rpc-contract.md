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
      "schema": "public",
      "ddlExecute": false,
      "autoCommit": false
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
    ddlExecute?: boolean;
    autoCommit?: boolean;
  };
  input: TInput;
}
```

Node responsibility:

- MCP tool input schema validation
- context store merge
- tool parameter override 적용
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
| `listTables`      | `schema.listTables`           | yes           |     30s |
| `getTableDetails` | `schema.getTableDetails`      | yes           |     30s |
| `executeQuery`    | `sql.executeQuery`            | yes           |     60s |
| `createTables`    | `ddl.createTables`            | yes           |     60s |
| `modifyTables`    | `ddl.modifyTables`            | yes           |     60s |
| `generateCode`    | `codeGeneration.generateCode` | yes           |     60s |
| `setContext`      | N/A                           | no            |     N/A |
| `getContext`      | N/A                           | no            |     N/A |
| `getContextHelp`  | N/A                           | no            |     N/A |

`ContextTools`는 Node-local이다. Electron RPC method를 만들지 않는다.

## `schema.listTables`

Input:

```ts
interface ListTablesInput {
  schema?: string;
  search?: string;
}
```

Context requirements:

- `projectId`
- `connectionId`
- `schema` after input override

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
  schema?: string;
}
```

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
  autoCommit?: boolean;
}
```

Rules:

- DDL (`CREATE`, `ALTER`, `DROP`, `TRUNCATE`) is rejected.
- SELECT/EXPLAIN returns up to 200 rows.
- DML with `autoCommit=false` keeps a transaction open in a NeoSQL SQL Editor tab.
- Node must not set `autoCommit=true` unless the user explicitly requested it or context
  already contains `autoCommit=true`.

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
  executeImmediately?: boolean;
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

- `executeImmediately` overrides context `ddlExecute`.
- If both are absent, default is false.
- `executeImmediately=false` means ERD/schema design only. The user applies pending DB
  changes through NeoSQL UI.

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
  executeImmediately?: boolean;
}

interface McpAlterTableDef {
  tableName: string;
  newTableName?: string | null;
  newRemarks?: string | null;
  newPrimaryKeys?: string[] | null;
  columnOperations?: McpColumnOperation[] | null;
  indexOperations?: McpIndexOperation[] | null;
  foreignKeyOperations?: McpForeignKeyOperation[] | null;
  constraintOperations?: McpConstraintOperation[] | null;
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
- `templatePackId` is kept in the MCP/contract surface for compatibility, but Electron
  support must be verified or added before Phase 3 completion.

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

- Electron app DDL restriction branch references `response` in current handler code; verify
  and fix in the app repository before enabling `executeImmediately=true` through HTTP RPC.
- `templatePackId` is accepted by the old Java tool but ignored by current app handler.
- Node generates an upstream `sessionId` once per server instance/stdio connection. This
  is not the MCP Streamable HTTP `Mcp-Session-Id` header; it is a NeoSQL upstream grouping
  key.
