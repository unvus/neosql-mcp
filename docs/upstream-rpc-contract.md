# Upstream RPC Contract

`neosql-mcp` Node 패키지와 neosql Electron main/app 사이의 JSON-RPC over HTTP
계약이다. Phase 2-3 Node handler와 Phase 2-4 이후 Electron HTTP dispatcher는 이
문서를 기준으로 맞춘다. 앱 준비·선택적 프로젝트 이동·상태 메시지의 교차 저장소 동작 기준은
[런타임 수명](../../neosql/docs/mcp/runtime-lifecycle.html), 실행 컨텍스트는
[아키텍처](../../neosql/docs/mcp/architecture.html#context)를 따른다.

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
  context?: { expectedProjectId: string }; // --project-id 지정 시에만
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
- app store, renderer-facing state, SQL Editor, ERD, code generation 처리
- 실제 DDL 실행은 `execute-query` 경로에서만 처리
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
| -32002 | `project-mismatch`     | expectedProjectId와 화면·활성·저장소 ID 불일치      |
| -32002 | `project-not-selected` | Desktop 활성 프로젝트 또는 준비된 session 없음  |
| -32002 | `unavailable`          | project session 초기화 timeout 등 일시 처리 불가 |
| -32003 | `forbidden`            | 현재 사용자에게 project 권한 없음                |

현재 Electron dispatcher는 `connection-not-found`, `schema-not-found`, `execution-failed`
같은 domain-specific kind를 별도 code로 세분화하지 않는다. handler가 `errorKind` 없이
`success: false`를 반환하면 `handler-error` / `-32000`으로 감싼다. Node는 code보다
`error.data.kind`를 기준으로 lifecycle/access error를 분기한다.

## Internal runtime status and preparation

`get-runtime-status`는 공개 MCP tool이 아닌
내부 `POST /mcp/rpc` method이며 params는 `{}`다. Node가 요청별 JSON-RPC ID를
보내고 Main이 같은 ID와 자신의 앱 식별·profile을 반환한다.

```json
{"jsonrpc":"2.0","id":1,"method":"get-runtime-status","params":{}}
{"jsonrpc":"2.0","id":1,"result":{"app":"neosql","profile":"local","renderer":"responsive","project":{"state":"loading","projectId":"A"}}}
```

- `app`: `neosql`; `profile`: 요청 MCP의 `prod/dev/local/stage`와 일치해야 한다.
- `renderer: not_ready`이면 `project: null`.
- `renderer: responsive`이면 project는 다음 중 하나다.
  - `not_selected`: projectId null
  - `loading/ready/authentication_required`: projectId 문자열
  - `failed`: projectId 문자열, reason은 `storage_unavailable/initial_sync_failed/initialization_failed/missing_project_config`
  - `user_action_required`: projectId 문자열, reason은 `unlock_project/cleanup_connections/cleanup_members/resolve_missing_driver/project_access_blocked/acknowledge_notice`

조회는 메모리 상태만 읽는다. 인증·프로젝트 선택·초기화·모달·DB 연결을 시작하지 않는다.
Renderer 미준비는 정상 결과이며 Main의 1초 IPC timeout은 `error.data.kind: timeout`이다.
HTTP 연결 종료는 Main의 상태 관찰 pending을 정리하며 늦은 응답을 폐기한다.
Node는 JSON-RPC envelope/ID 및 앱/profile/상태 조합을 검증한다.

준비는 최초 확인부터 전체 40초를 공유하고 상태 조회는 최대 1초, 조회 종료 후 간격은
0.5초다. 설치 조회·OS 실행 명령·HTTP·알림에 취소/기한을 적용한다. 연결 부재 시 설치를
확인하고 짧은 재확인 뒤 OS 실행을 1회 요청한다. 실행 명령 exit 0, Renderer 미준비, 프로젝트 loading 또는 이동 완료를
이번 호출에서 관찰한 경우만 연결 부재·조회 timeout을 재시도한다. 명확한 오류는
`status_check_failed`, 전체 기한은 `readiness_timeout`으로 종료한다. 프로젝트 전환도
기한을 초기화하지 않는다. ready 뒤 원 작업을 1회 보내며 작업 실행 timeout은 별도다.

준비 실패는 `isError: true`의 content text JSON에 `status/message/nextAction/requestSent`
네 필드만 포함한다. status는 `installation_not_found`, `installation_check_failed`,
`activation_failed`, `project_not_selected`, `project_load_failed`, `authentication_required`,
`readiness_timeout`, `user_action_required`, `status_check_failed`, `target_unavailable`,
`project_lookup_failed`, `project_navigation_failed`, `project_mismatch`; requestSent는 false다.
토큰이 있으면 상태 전이 시 `notifications/progress`를 보낸다. 0도 유효한 토큰이며
progress는 증가하는 단계 번호이고 total은 없다. 알림 거절 자체로 작업을 실패시키지 않는다.

원 작업 수신 시 본체가 현재 프로젝트를 다시 검사한다. ready 조회 직후 프로젝트가 바뀌어
`unavailable` 등으로 거부되더라도 이미 전송한 작업의 기존 오류 경로를 유지한다.
이를 requestSent=false 준비 결과로 바꾸거나 재전송하지 않는다.

## Internal project navigation

`open-project`는 공개 도구가 아니다. Renderer가 응답 가능하지만 대상 ID가 다를 때
프로젝트 도구의 공통 준비 흐름에서 한 번만 보낸다. 같은 대상이면 이동 RPC 없이 상태를 판정한다.

```ts
// POST /mcp/rpc, method: 'open-project'
type OpenProjectParams = {
  input: { projectId: string };
  preparationDeadlineAt: number; // Date.now() + remaining preparation milliseconds
};
type OpenProjectResult = {
  projectId: string;
  status: 'navigated' | 'authentication_required' | 'target_unavailable'
    | 'user_action_required' | 'lookup_failed' | 'navigation_failed';
  reason?: 'unsaved_changes'; // user_action_required일 때
};
```

- Main과 Renderer는 절대 시각에서 남은 시간을 계산하며 상한은 40초다. Node HTTP에는
  전체 준비의 남은 시간을 적용한다. 일반 도구 실행 기한과 코드 생성 권한은 별도다.
- 앱의 일반 프로젝트 준비 게이트보다 먼저 처리한다. 로컬 우선 대상 조회·접근 확인 후
  기존 router.push를 기다리고 실제 route ID 및 nextTick을 확인해 navigated를 반환한다.
  데이터 로딩 완료는 이후 get-runtime-status로 확인한다.
- 미저장 변경은 user_action_required/unsaved_changes. 자동 저장·폐기·확인창 대기 없음.
- lookup_failed는 project_lookup_failed, navigation_failed·응답 유실/형식 오류는
  project_navigation_failed로 종료한다. 전체 기한 소진은 readiness_timeout이다.
  이동을 재전송하거나 다른 프로젝트에서 대신 실행하지 않는다.
- HTTP 연결 종료·기한 만료·Renderer 종료는 요청 취소 IPC로 이어진다. 이동 초기 가드와
  beforeResolve에서 취소·기한·dirty를 재검사하며 라우터 완료까지 취소 표식을 유지한다.
- 실제 작업의 context.expectedProjectId는 화면·활성·store ID와 비교한다. 불일치는
  JSON-RPC project-mismatch(-32002)이며 Node 결과는 requestSent:true, operationStarted:false다.
  준비 과정에서 대상 이탈을 발견했으면 project_mismatch, requestSent:false다.
- 이동 RPC 전송은 원래 작업의 requestSent로 계산하지 않는다. 원래 작업 직전에도
  취소·기한을 확인하고 한 번만 전송한다.

상태 메시지·사유 매핑·익명 local 및 배포 지원 범위는
[런타임 수명 계약](../../neosql/docs/mcp/runtime-lifecycle.html#navigation)을 따른다.

## Methods

| MCP tool             | RPC method           | Electron 호출 | Timeout |
| -------------------- | -------------------- | ------------- | ------: |
| (internal only)     | `get-runtime-status` | yes           |      1s |
| `list-connections`   | `list-connections`   | yes           |     30s |
| `list-tables`        | `list-tables`        | yes           |     30s |
| `get-table-details`  | `get-table-details`  | yes           |     30s |
| `erd-create-tables`  | `erd-create-tables`  | yes           |     60s |
| `erd-modify-tables`  | `erd-modify-tables`  | yes           |     60s |
| `execute-query`      | `execute-query`      | yes           |     60s |
| (internal only) | `get-code-generation-policy` | yes (main only) | 1s |
| `generate-code` | `generate-code` | yes | policy + 5s (65s) |
| `get-context-help`   | N/A                  | no            |     N/A |

`erd-create-tables`와 `erd-modify-tables`는 NeoSQL ERD 모델만 저장한다. SQL을 생성하거나
실행하지 않으며 연결된 데이터베이스를 변경하지 않는다. `create-tables`와
`modify-tables` 구 이름은 MCP catalog와 Electron RPC whitelist에 등록하지 않는다.
실제 DDL 실행은 `execute-query`를 사용한다.

이 표는 upstream RPC를 호출하거나 upstream context contract와 직접 관련된 MCP tool만
다룬다. `ping`, `get-mcp-session-id`, `get-context-help`는 Node-local tool이다.
`generate-code`는 준비 확인 후 내부 정책 조회와 생성 RPC를 순서대로 호출한다.

## Database Coordinate Contract

현재 MCP tool인 `list-tables`, `get-table-details`, `erd-create-tables`,
`erd-modify-tables`, `execute-query`는
`connectionId`, `database`, `schema`를 모두 명시하거나 모두 생략한다.

- 전체 명시: Node가 세 필드의 존재 여부를 유지해 `params.input`으로 전달한다.
- 전체 생략: Node는 좌표 필드를 만들지 않는다. Renderer가 활성 프로젝트의 enabled
  Default를 해석한다.
- 일부 명시: Node에서 MCP `invalid-params`로 거부하고 upstream을 호출하지 않는다.
- `database: null`: database 계층이 없는 DBMS의 유효한 명시 값이다.
- 명시 좌표가 무효여도 프로젝트 Default로 fallback하지 않는다.

Electron main은 이전 Node 패키지 호환을 위해 기존 `params.context` fallback을 당분간
허용한다. 새 Node는 DB 좌표를 context에 넣지 않지만, --project-id 지정 시
context.expectedProjectId를 별도로 보낸다. Renderer는 어떤 경로로 들어온
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

## `erd-create-tables`

Input:

```ts
interface ErdCreateTablesInput {
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
- Electron main이 좌표를 renderer request field로 추출하고 ERD payload에서는 제거한다.
- 새 테이블은 `isAdded: true`인 가상 모델로 저장하며 실제 SQL/DDL은 생성하거나 실행하지 않는다.
- 성공한 테이블은 `MCP: {sessionId}` ERD에 배치한다.

Result:

```ts
interface ErdCreateTablesResult {
  summary: {
    requested: number;
    createdInErd: number;
    failed: number;
  };
  created: Array<{ name: string }>;
  failed?: Array<{ name: string; error: string }>;
}
```

## `erd-modify-tables`

Input:

```ts
interface ErdModifyTablesInput {
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
- Electron main이 좌표를 renderer request field로 추출하고 ERD payload에서는 제거한다.
- 기존 테이블은 dirty 모델로만 저장하며 실제 SQL/DDL은 생성하거나 실행하지 않는다.
- 인덱스, FK, UNIQUE/CHECK/EXCLUSION 변경은 기존 ERD 모델 동작과 동일하게 저장한다.
- 성공한 테이블은 `MCP: {sessionId}` ERD에 배치한다.

Result:

```ts
interface ErdModifyTablesResult {
  summary: {
    requested: number;
    modifiedInErd: number;
    failed: number;
  };
  modified: Array<{ name: string; warnings?: string[] }>;
  failed?: Array<{ name: string; error: string }>;
}
```

## `generate-code`

Input: `{ tableNames: string[], connectionId?, database?, schema? }`. The table array
must be nonempty with nonblank names; there is no table-count cap. Coordinates follow
the existing all-or-none rule. Packs come from project settings; no pack selector or
preview-only option is exposed.

After Desktop readiness, Node calls `get-code-generation-policy` with `{}` and a 1s
request timeout. Main responds without consulting Renderer:

```json
{"version":1,"executionTimeoutMs":60000,"responseGraceMs":5000}
```

Node validates version and timer bounds, then calls `generate-code` once:

```json
{"sessionId":"<stdio-session>","expectedTimeoutMs":60000,"input":{"tableNames":["users","orders"]}}
```

The request timeout is executionTimeoutMs + responseGraceMs. Main rejects a missing or
mismatched expectedTimeoutMs before dispatch. There is no cached/fallback 60s constant in
Node and no automatic operation retry. Older Desktop versions without the policy RPC
return `policy-unavailable` with no generation started.

Renderer prepares metadata and entities, applies project packs and uses the shared GUI
installer. Anonymous local projects use the same pack-consumption policy as GUI. The
`paid` template value is `sessionStore.account?.paid ?? false`.

Completed execution returns JSON in MCP text content:

```ts
interface GenerateCodeResult {
  status: 'completed' | 'partial' | 'failed' | 'skipped' | 'needs-configuration';
  message: string;
  files: Array<{ tableName: string; packKey: string; templateId?: number; path: string }>;
  skipped: Array<Target & { reason: string; message: string }>;
  failures: Array<Target & { stage: 'metadata' | 'entity' | 'pack' | 'render' | 'install'; reason: string; message: string }>;
  configurationRequired?: Array<{ key: string; message: string; settingsPath: string }>;
}
interface Target { tableName?: string; packKey?: string; templateId?: number; path?: string; }
```

`files` reports actual absolute paths, including alternate paths. Render failures are
not installed. Disabled installs, disabled overwrites, empty packs/results and missing
needle markers are skips. A write followed by chmod/gitAdd failure appears in both
files and failures. Possible remaining work continues after ordinary failures.

Success + failure is `partial`; failures without writes are `failed`; only skips are
`skipped`. Only `failed` sets MCP isError among these execution statuses. Missing root,
packs or declared required global variables returns `needs-configuration` before
rendering/writing, with empty outcome arrays and instructions. Internal handler success
means the result was delivered, while the nested status describes generation outcome.
Input/access/lifecycle errors continue to use existing RPC errors.

Main assigns an internal UUID and a monotonic deadline to every generation request.
Timeout, HTTP disconnect or Renderer closure deactivates it. Renderer checks cancellation
between awaits; the dedicated MCP installation IPC verifies the sender and active UUID
before each filesystem mutation. GUI entry points keep their existing template rules.
An OS operation already started may finish after expiry; existing changes are not rolled
back. Late results do not reactivate the request.

Electron timeout maps to `timed-out`; Node timeout, unreliable HTTP response, invalid
result, or app-not-ready/unavailable/handler-error after the operation request maps to
`outcome-unknown`. Both set isError and resultsComplete:false, omit an
unverified files list, and instruct the caller to inspect IDE/Git changes before retrying.
They never claim zero files changed. Full progress persistence/resume is outside this MVP.

## Open Items

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
