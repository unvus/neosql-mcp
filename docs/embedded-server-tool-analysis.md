# Embedded Server Tool Analysis

Phase 2-2 분석 기록. 대상은 neosql 본체의 기존 Spring AI MCP tool 구현과 현재
Electron app 측 WebSocket MCP handler다.

분석 기준 파일:

- `~/workspace/neosql/embedded-server/src/main/java/com/unvus/neosql/embedded/mcp/tool/CodeGenerationTools.java`
- `~/workspace/neosql/embedded-server/src/main/java/com/unvus/neosql/embedded/mcp/tool/ContextTools.java`
- `~/workspace/neosql/embedded-server/src/main/java/com/unvus/neosql/embedded/mcp/tool/DdlTools.java`
- `~/workspace/neosql/embedded-server/src/main/java/com/unvus/neosql/embedded/mcp/tool/SchemaTools.java`
- `~/workspace/neosql/embedded-server/src/main/java/com/unvus/neosql/embedded/mcp/tool/SqlTools.java`
- `~/workspace/neosql/app/src/services/mcp-handler/*.ts`

Context/session 분석 및 설계는 별도 문서
[`mcp-context-holder-analysis.md`](mcp-context-holder-analysis.md)에 정리한다.

## 공통 구조

기존 Java tool 중 `ContextTools`를 제외한 6개 tool은 같은 wrapper 패턴이다.

1. `McpContextHolder.getContext()`로 `projectId`, `connectionId`, `schema`,
   `ddlExecute`, `autoCommit`을 읽는다.
2. tool 파라미터가 있으면 context보다 우선한다.
3. `McpRequest`를 만든다.
4. `McpWebSocketService.sendAndWait(request, timeoutSeconds)`로 Electron app에
   요청한다.
5. `McpResponse.success`가 true면 `response.data`를 pretty JSON string으로
   반환한다.
6. 실패나 예외도 throw하지 않고 `{ success: false, message: ... }` JSON string으로
   반환한다.

기존 WebSocket envelope:

```json
{
  "requestId": "uuid",
  "sessionId": "mcp-session-id",
  "projectId": "project-id",
  "connectionId": "0",
  "schema": "public",
  "action": "listTables",
  "payload": {}
}
```

Electron app 응답 envelope:

```json
{
  "requestId": "same-id",
  "success": true,
  "data": {},
  "error": null
}
```

## Context Summary

`McpContext` 필드:

| 필드           | 타입    | 의미                                                                         |
| -------------- | ------- | ---------------------------------------------------------------------------- |
| `projectId`    | string  | NeoSQL project ID                                                            |
| `connectionId` | string  | project connection index/id. app handler에서는 `Number(connectionId)`로 변환 |
| `schema`       | string  | schema name                                                                  |
| `ddlExecute`   | boolean | DDL tool의 기본 즉시 실행 여부                                               |
| `autoCommit`   | boolean | SQL DML의 기본 auto commit 여부                                              |

기존 우선순위:

1. tool 파라미터 명시값
2. 세션 context (`setContext`)
3. 요청 header context
4. 빈 context

새 Node MCP 구조에서는 MCP stdio transport가 세션의 실제 소유자이므로 `setContext`,
`getContext`, `getContextHelp`는 Node-local tool로 유지하는 것이 자연스럽다.
Electron app에는 나머지 tool 호출 시 resolved context만 전달한다.

## Tool Summary

| Tool              | 기존 Java action  | Timeout | Electron 의존 | DB/UI 영향                         | Node/Electron 분할         |
| ----------------- | ----------------- | ------: | ------------- | ---------------------------------- | -------------------------- |
| `setContext`      | 없음              |     N/A | 없음          | Node 세션 상태만 변경              | Node 전담                  |
| `getContext`      | 없음              |     N/A | 없음          | Node 세션 상태 조회                | Node 전담                  |
| `getContextHelp`  | 없음              |     N/A | 없음          | 정적 도움말                        | Node 전담                  |
| `listTables`      | `listTables`      |     30s | 있음          | project/session store 조회         | Node 검증 + Electron 처리  |
| `getTableDetails` | `getTableDetails` |     30s | 있음          | table metadata lazy load 가능      | Node 검증 + Electron 처리  |
| `executeQuery`    | `executeQuery`    |     60s | 있음          | SQL 실행, SQL Editor tab 생성/갱신 | Node guard + Electron 처리 |
| `createTables`    | `createTables`    |     60s | 있음          | ERD/table 저장, optional DDL 실행  | Node guard + Electron 처리 |
| `modifyTables`    | `modifyTables`    |     60s | 있음          | ERD/table 수정, optional DDL 실행  | Node guard + Electron 처리 |
| `generateCode`    | `generateCode`    |     60s | 있음          | template pack 로드, 파일 생성/설치 | Node 검증 + Electron 처리  |

## Tool Details

### `setContext`

입력:

| 필드           | 필수 | 설명                       |
| -------------- | ---- | -------------------------- |
| `projectId`    | no   | 빈 문자열이면 기존 값 유지 |
| `connectionId` | no   | 빈 문자열이면 기존 값 유지 |
| `schema`       | no   | 빈 문자열이면 기존 값 유지 |
| `ddlExecute`   | no   | null이면 기존 값 유지      |
| `autoCommit`   | no   | null이면 기존 값 유지      |

반환:

```json
{
  "success": true,
  "message": "Context updated successfully",
  "context": {
    "projectId": "...",
    "connectionId": "0",
    "schema": "public",
    "ddlExecute": false,
    "autoCommit": false
  }
}
```

결정: Node-local. Electron main RPC method를 만들지 않는다.

### `getContext`

입력 없음.

반환:

```json
{
  "context": {
    "projectId": "...",
    "connectionId": "0",
    "schema": "public",
    "ddlExecute": false,
    "autoCommit": false
  },
  "source": "Session context (set via set_context tool)"
}
```

결정: Node-local.

### `getContextHelp`

입력 없음. 기존 Java 도움말에는 HTTP MCP header 예시가 포함되어 있지만 새 구조는 stdio
MCP이므로 `.mcp.json` HTTP header 예시는 제거하거나 Node context tool 중심으로
바꿔야 한다.

결정: Node-local.

### `listTables`

Java 입력:

| 필드     | 필수 | 설명                                       |
| -------- | ---- | ------------------------------------------ |
| `schema` | no   | 없으면 context schema                      |
| `search` | no   | table name/comment case-insensitive filter |

Java WebSocket payload:

```json
{
  "search": "keyword"
}
```

Electron app handler 검증:

- `projectId` 필수
- `connectionId` 필수
- `schema` 필수
- connection 존재
- schema 존재

Electron app 반환 data:

```json
[
  {
    "tableName": "users",
    "tableType": "TABLE",
    "comment": "..."
  }
]
```

결정: Node는 connection/schema override와 context merge, 기본 인자 검증을 수행하고,
Electron은 project/session store에서 table 목록을 조회한다.

### `getTableDetails`

Java 입력:

| 필드         | 필수 | 설명                  |
| ------------ | ---- | --------------------- |
| `tableNames` | yes  | table name list       |
| `schema`     | no   | 없으면 context schema |

Java WebSocket payload:

```json
{
  "tableNames": ["users", "orders"]
}
```

Electron app handler 검증:

- `projectId`, `connectionId`, `schema` 필수
- `payload.tableNames` non-empty array 필수
- connection/schema 존재

Electron app 반환 data:

```json
{
  "tables": [
    {
      "tableName": "users",
      "tableType": "TABLE",
      "comment": "...",
      "columns": [
        {
          "columnName": "id",
          "dataType": "BIGINT",
          "size": null,
          "decimalDigits": null,
          "nullable": false,
          "defaultValue": "",
          "primaryKey": true,
          "comment": ""
        }
      ],
      "indexes": [{ "indexName": "idx_users_name", "unique": false, "columns": ["name"] }],
      "foreignKeys": [
        {
          "fkName": "fk_orders_user",
          "fkColumnName": "user_id",
          "pkTableName": "users",
          "pkColumnName": "id"
        }
      ],
      "constraints": [
        {
          "name": "ck_users_age",
          "type": "CHECK",
          "columns": [],
          "expression": "age >= 0"
        }
      ]
    }
  ],
  "notFound": ["missing_table"]
}
```

결정: Electron에서 metadata lazy load가 발생할 수 있으므로 Electron 처리.

### `executeQuery`

Java 입력:

| 필드         | 필수 | 설명                                                          |
| ------------ | ---- | ------------------------------------------------------------- |
| `sql`        | yes  | DDL 금지                                                      |
| `autoCommit` | no   | 없으면 context autoCommit. DML에 대해 사용자의 명시 동의 필요 |

Java WebSocket payload:

```json
{
  "sql": "SELECT 1",
  "autoCommit": false
}
```

Electron app handler 동작:

- `connectionId` 필수
- `payload.sql` 필수
- DDL 감지 시 거부 (`CREATE`, `ALTER`, `DROP`, `TRUNCATE`)
- connection 존재 검증
- SQL Editor tab `MCP: <sessionId>` 생성/재사용
- SELECT/EXPLAIN은 최대 200 rows 반환
- DML + `autoCommit=false`는 DB session을 유지하고 UI에서 COMMIT/ROLLBACK하도록 안내

반환 data:

```json
{
  "type": "SELECT",
  "sql": "SELECT 1",
  "executionTimeMs": 12,
  "columns": ["id"],
  "columnTypes": ["INTEGER"],
  "rows": [[1]],
  "rowCount": 1,
  "truncated": false
}
```

DML 반환:

```json
{
  "type": "UPDATE",
  "sql": "UPDATE users SET active = true",
  "executionTimeMs": 12,
  "affectedRows": 3,
  "autoCommit": false,
  "message": "3 rows affected. Transaction is open in NeoSQL SQL Editor tab 'MCP: ...'. Please review and COMMIT or ROLLBACK in NeoSQL."
}
```

결정: Node에서 DDL 1차 guard와 autoCommit 기본값 merge를 수행하고, 실제 SQL 실행과
SQL Editor UI 동기화는 Electron 처리.

### `createTables`

Java 입력:

| 필드                 | 필수 | 설명                        |
| -------------------- | ---- | --------------------------- |
| `tableDefinitions`   | yes  | `McpTableDef[]`             |
| `executeImmediately` | no   | 없으면 context `ddlExecute` |

`McpTableDef` 주요 구조:

```json
{
  "name": "users",
  "remarks": "user table",
  "columns": [
    {
      "name": "id",
      "type": "BIGINT",
      "size": null,
      "decimalDigits": null,
      "nullable": false,
      "autoIncrement": true,
      "defaultValue": null,
      "remarks": "PK"
    }
  ],
  "primaryKeys": ["id"],
  "importedKeys": [],
  "indexes": [{ "indexName": "idx_users_name", "columnNames": ["name"], "unique": false }],
  "constraints": []
}
```

Electron app handler 동작:

- `connectionId`, `schema`, non-empty `payload.tableDefinitions` 필수
- connection/schema 존재 검증
- table별 partial success
- 중복 table은 `failed`에 기록
- 성공 table은 schema store에 추가하고 `MCP: <sessionId>` ERD에 배치
- `executeImmediately=true`면 dialect DDL 생성 후 DB 실행
- FK DDL은 table create 이후 별도 실행

반환 data:

```json
{
  "created": [{ "name": "users" }],
  "failed": [{ "name": "orders", "error": "Table 'orders' already exists in schema 'public'" }],
  "ddlExecution": {
    "executed": true,
    "results": [
      {
        "name": "users",
        "success": true,
        "executedCount": 1,
        "ddlStatements": ["CREATE TABLE ..."]
      }
    ]
  }
}
```

결정: Node에서 connection/schema override와 기본 schema validation을 수행하고,
table model 변환, ERD/UI 반영, DDL 생성/실행은 Electron 처리.

주의: 현재 app handler의 DDL 제한 branch에 `return { ...response, ddlExecution }`가
있는데 `response` 식별자가 보이지 않는다. 해당 branch는 Phase 2-4 이후 본체 작업 때
확인해야 할 latent bug다.

### `modifyTables`

Java 입력:

| 필드                 | 필수 | 설명                        |
| -------------------- | ---- | --------------------------- |
| `alterations`        | yes  | `McpAlterTableDef[]`        |
| `executeImmediately` | no   | 없으면 context `ddlExecute` |

`McpAlterTableDef` 주요 구조:

```json
{
  "tableName": "users",
  "newTableName": "app_users",
  "remarksOperation": { "modify": true, "remarks": "renamed" },
  "primaryKeyOperations": [{ "action": "ADD", "columnName": "code" }],
  "columnOperations": [
    {
      "action": "ADD",
      "columnName": "age",
      "type": "INTEGER",
      "nullable": true
    }
  ],
  "indexOperations": [],
  "foreignKeyOperations": [],
  "constraintOperations": []
}
```

지원 operation:

- column: `ADD`, `DROP`, `MODIFY`, `RENAME`
- primary key: `ADD`, `DROP`
- index: `ADD`, `DROP`
- foreign key: `ADD`, `DROP`
- table constraint: `ADD`, `DROP`

Electron app handler 동작:

- `connectionId`, `schema`, non-empty `payload.alterations` 필수
- connection/schema 존재 검증
- table별 partial success
- operation-level warning이 있어도 가능한 변경은 저장 시도
- 성공 table은 `MCP: <sessionId>` ERD에 포함
- `executeImmediately=true`면 existing table은 schema diff 기반 ALTER DDL, 신규 table은 CREATE DDL 실행

반환 data:

```json
{
  "modified": [{ "name": "users", "warnings": ["Column 'x' not found"] }],
  "failed": [{ "name": "orders", "error": "Table 'orders' not found in schema 'public'" }],
  "ddlExecution": {
    "executed": true,
    "results": [
      {
        "name": "users",
        "success": true,
        "executedCount": 1,
        "ddlStatements": ["ALTER TABLE ..."]
      }
    ]
  }
}
```

결정: `alterTables`가 아니라 현재 Java/app/Node 이름인 `modifyTables`를 표준명으로
쓴다.

주의: `createTables`와 동일하게 app handler의 DDL 제한 branch에 `response` 미정의
가능성이 있다.

### `generateCode`

Java 입력:

| 필드             | 필수 | 설명                                                                               |
| ---------------- | ---- | ---------------------------------------------------------------------------------- |
| `tableName`      | yes  | Java tool은 단일 table name을 받지만 payload는 `tableNames` 배열                   |
| `templatePackId` | yes  | Java signature에는 있지만 현재 app handler는 project config의 template pack을 사용 |
| `schema`         | no   | 없으면 context schema                                                              |

Java WebSocket payload:

```json
{
  "tableNames": ["users"]
}
```

Electron app handler 동작:

- `connectionId`, `schema` 필수
- project config와 project base path 필요
- connection/schema 존재 검증
- project config에 template pack 필요
- `payload.tableNames` non-empty array 필수
- table별 code generation + install

반환 data:

```json
{
  "success": true,
  "message": "Code generated and installed for 1 table(s).",
  "files": ["src/main/java/.../User.java"],
  "notFound": ["missing_table"]
}
```

결정:

- contract는 기존 Java tool 호환을 위해 MCP input에 `templatePackId`를 유지하되,
  Electron app handler가 아직 이를 사용하지 않는다는 사실을 명시한다.
- Phase 2-3에서 Node handler는 `tableName`을 `tableNames: [tableName]`으로 변환한다.

## Phase Decisions

1. `ContextTools`는 Node-local로 유지한다. Electron main RPC contract 대상에서 제외한다.
2. Phase 2-4 real Electron pilot은 `ContextTools`가 아니라 read-only인
   `SchemaTools`(`listTables`, `getTableDetails`)가 적합하다.
3. DDL 표준 tool 이름은 `modifyTables`다. `alterTables`는 오래된 명칭으로 본다.
4. 기존 Java wrapper는 실패를 JSON string payload로 반환했지만 새 Node contract에서는
   upstream 실패를 JSON-RPC error로 받고 MCP tool error result로 변환한다.
5. Electron app handler는 이미 WebSocket MCP action을 처리하므로 Phase 2-4 이후에는
   HTTP JSON-RPC dispatcher가 기존 handler를 호출하거나 같은 service logic으로 위임하면 된다.
