# neosql-mcp

[English](https://github.com/unvus/neosql-mcp/blob/main/README.md) | **한국어**

> `npx`로 NeoSQL Desktop의 데이터베이스 도구를 MCP 호스트(Claude Code, Codex, Gemini CLI, Cursor 등)에서 사용하세요.

[![npm version](https://img.shields.io/npm/v/neosql-mcp.svg)](https://www.npmjs.com/package/neosql-mcp)
[![license](https://img.shields.io/npm/l/neosql-mcp.svg)](LICENSE)
[![node](https://img.shields.io/node/v/neosql-mcp.svg)](https://nodejs.org)

`neosql-mcp`는 MCP 호스트가 `npx`를 통해
[NeoSQL Desktop](https://neosql.unvus.com)의 도구를 사용할 수 있게 하는 로컬 stdio MCP
서버입니다.

독립적인 데이터베이스 서버나 데이터베이스 CLI가 아니며, NeoSQL Desktop을 대체하지 않습니다.
MCP 호스트가 실행하는 프로세스로 동작하며, 표준 MCP stdio로 NeoSQL 도구를 제공합니다.
데이터베이스와 UI 작업은 macOS의 Unix Domain Socket 또는 Windows의 Named Pipe에서
HTTP 기반 JSON-RPC를 통해 실행 중인 NeoSQL Desktop에 위임합니다.

```text
+-------------------+    +-------------------+    +-------------------+
|                   |    |                   |    |                   |
|  Claude Code      +--->+                   +--->+  NeoSQL Desktop   |
|                   |    |                   |    |                   |
|                   |    |                   |    +---------+---------+
|  Codex            |    |                   |              |
|                   |    |                   |              v
|                   |    |                   |    +-------------------+
|  Gemini CLI       |    |     neosql-mcp    |    |                   |
|                   |    |                   |    |  PostgreSQL       |
|                   |    |                   |    |  MySQL            |
|  Cursor           |    |                   |    |  MariaDB          |
|                   |    |                   |    |  Oracle           |
|                   |    |                   |    |  SQL Server       |
|  Other MCP hosts  |    |                   |    |  ... and more     |
|                   |    |                   |    |                   |
+-------------------+    +-------------------+    +-------------------+
     MCP hosts             stdio MCP server            Databases
```

## neosql-mcp를 사용하는 이유

- AI 코딩 도우미가 컬럼 이름과 테이블 구조를 추측하는 대신, 실제 스키마를 읽고 쿼리를 실행해
  코드를 작성할 수 있습니다. 팀이 NeoSQL Desktop에 구성한 데이터베이스를 MCP 호스트에서
  활용할 수 있습니다.
- 실행 중인 NeoSQL Desktop과 `npx` 명령으로 Claude Code, Codex, Gemini CLI, Cursor 등 MCP 호스트에서
  기존 연결과 스키마를 사용할 수 있습니다. 데이터베이스 연결은 MCP 호스트마다 별도로
  구성하지 않고 Desktop에서 관리합니다.

## 지원 데이터베이스

PostgreSQL, Supabase, MySQL, MariaDB, Oracle, SQL Server, SQLite, H2, Databricks.

데이터베이스 연결은 NeoSQL Desktop이 담당하므로 `neosql-mcp`는 Desktop이 지원하는 모든
DBMS에서 동작합니다. 버전 요구사항과 DBMS별 연결 방법은
[DBMS별 연결 가이드](https://neosql.unvus.com/ko/docs/database/dbms)를 참고하세요.

## 보안

neosql-mcp와 NeoSQL Desktop 사이의 통신은 로컬 머신의 Unix Domain Socket(macOS) 또는
Named Pipe(Windows)를 사용합니다. 이 통신 구간은 TCP 포트를 열지 않으며, 환경 변수나
설정 파일로 엔드포인트를 덮어쓸 수 없습니다. 데이터베이스 접근은 Desktop의 MCP Access
Control 설정을 따릅니다. MCP 호스트 설정에 데이터베이스 인증 정보를 넣을 필요는 없습니다.

스키마 정보와 쿼리 결과는 MCP 호스트에 전달됩니다. 호스트의 데이터 처리 방식과 Desktop의
데이터베이스 연결은 이 로컬 통신 구간과 별개입니다. `execute-query`는 DDL을 포함한 SQL을
실행할 수 있고, `generate-code`는 파일을 쓸 수 있으므로 요청한 작업과 Desktop의 접근
설정을 확인하고 사용하세요.

데이터 처리, 저장, 보관 및 삭제에 관한 사항은
[NeoSQL MCP 개인정보 처리방침(영문)](https://github.com/unvus/neosql-mcp/blob/main/PRIVACY.md)을
참고하세요.

## 사전 준비

- macOS 또는 Windows.
- Node.js 20 이상.
- 같은 머신에 설치된 NeoSQL Desktop.
- Claude Code, Codex, Gemini CLI, Cursor 등 stdio 서버를 실행할 수 있는 MCP 호스트.
- MCP 접근이 허용된 데이터베이스 연결과 스키마가 있는 NeoSQL 프로젝트.

## 빠른 시작

전역 설치는 필요하지 않습니다. MCP 호스트가 `npx`로 패키지를 실행하도록 설정하세요.

```bash
npx -y neosql-mcp
```

stdio MCP 서버이므로 터미널에서 직접 실행하면 입력을 기다리는 것처럼 보일 수 있습니다.
정상적인 동작입니다.

## MCP 호스트 설정

neosql-mcp는 Claude Code, Codex, Gemini CLI, Cursor에서 테스트했습니다. stdio 서버를
실행할 수 있는 MCP 호스트라면 같은 명령과 인자를 사용할 수 있습니다.

| 호스트      | 설정 파일                                                         |
| ----------- | ----------------------------------------------------------------- |
| Claude Code | 프로젝트의 `.mcp.json` 또는 사용자 홈의 `~/.claude.json`          |
| Codex       | 프로젝트의 `.codex/config.toml` 또는 `~/.codex/config.toml`       |
| Gemini CLI  | 프로젝트의 `.gemini/settings.json` 또는 `~/.gemini/settings.json` |
| Cursor      | 프로젝트의 `.cursor/mcp.json` 또는 `~/.cursor/mcp.json`           |

### Claude Code, Gemini CLI, Cursor

세 호스트는 `mcpServers` 아래에 같은 JSON 형태를 사용합니다.

```json
{
  "mcpServers": {
    "neosql": {
      "command": "npx",
      "args": ["-y", "neosql-mcp"]
    }
  }
}
```

### Codex

```toml
[mcp_servers.neosql]
command = "npx"
args = [
  "-y",
  "neosql-mcp",
]
```

## CLI 옵션

| 옵션                                         | 기본값 | 용도                                                                                             |
| -------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------ |
| `--project-id=<id>` 또는 `--project-id <id>` | 미지정 | 앱에 의존하는 도구 실행 전에 지정한 프로젝트를 열고, 활성 프로젝트가 일치하지 않으면 실패합니다. |

특정 프로젝트를 대상으로 하려면 MCP 호스트의 인자에 프로젝트 ID를 추가하세요.

```json
"args": ["-y", "neosql-mcp", "--project-id=<your-project-id>"]
```

`<your-project-id>`를 대상 프로젝트의 ID로 바꾸세요. 표시 이름이 아닌 ID를 사용합니다.
옵션을 생략하면 Desktop에서 선택한 프로젝트를 사용합니다. 지정하면 앱에 의존하는 도구를
실행하기 전에 Desktop 창이 요청한 프로젝트로 이동할 수 있습니다. MCP 호스트 연결,
도구 목록 조회, `ping`, `get-mcp-session-id`, `get-context-help` 호출만으로는 프로젝트를
전환하지 않습니다.

저장하지 않은 변경사항이 이동을 막으면 Desktop에서 저장하거나 폐기하세요. 로그인,
프로젝트 접근 권한, 기타 필수 확인은 Desktop에서 처리합니다. 준비 중 프로젝트가 바뀌거나
Desktop이 요청을 검사할 때 프로젝트가 일치하지 않으면 다른 프로젝트에서 조용히 실행하지 않고
실패합니다. 프로젝트 대상 지정을 지원하는 Desktop 버전을 사용하세요.

## Desktop 준비 확인

앱에 의존하는 도구를 실행하기 전에 neosql-mcp가 Desktop과 프로젝트의 상태를 확인합니다.
macOS와 Windows에서 Desktop이 설치돼 있지만 연결되지 않으면 앱 활성화를 한 번 요청하고,
전체 40초의 준비 제한 시간 안에서 준비 완료를 기다립니다. 앱 활성화, 선택적인 프로젝트
이동, 프로젝트 로딩은 이 제한 시간을 공유합니다. 준비가 완료되면 같은 도구 호출 안에서
원래 작업을 한 번 실행합니다. 사용자 조치가 필요하면 반환된 안내에 따라 Desktop에서
처리한 뒤 도구를 다시 호출하세요.

진행 토큰을 제공하는 MCP 호스트에는 영어 진행 알림을 보냅니다. 토큰이 없어도 준비 확인은
같은 방식으로 동작합니다. 화면 표시 방식과 전체 요청 제한 시간은 호스트가 결정합니다. 준비를
취소하면 추가 확인과 작업 요청 전송을 중단하지만 이미 실행한 Desktop 앱은 종료하지
않습니다. 준비 오류는 `isError: true`와 함께 `status`, `message`, `nextAction`,
`requestSent: false`가 담긴 JSON 텍스트를 반환합니다. 이미 전송한 작업은 기존 결과
형식을 유지하며 자동으로 재전송하지 않습니다.

## 실행 컨텍스트 결정

NeoSQL 도구는 Desktop에서 현재 선택되어 로딩이 완료된 프로젝트를 사용합니다.
`--project-id`를 지정하면 Node 프로세스가 이동과 프로젝트 검증에 사용할 프로젝트 ID를
보관합니다. 활성 프로젝트와 Default 연결 대상은 여전히 Desktop이 관리합니다.

데이터베이스 도구의 연결 대상은 다음 두 방식 중 하나로 전달합니다.

1. `connectionId`, `database`, `schema`를 모두 생략하면 활성 프로젝트의 NeoSQL MCP
   Access Control에서 선택한 Default를 사용합니다.
2. `list-connections`가 반환한 MCP 접근 가능 대상을 사용하려면 세 값을 모두 전달합니다.
   데이터베이스 계층이 없는 DBMS에는 `database: null`을 사용합니다.

세 필드 중 한두 개만 전달하면 유효하지 않습니다. 명시한 대상이 유효하지 않더라도
프로젝트 Default로 자동 대체하지 않습니다.

명시적 연결 대상을 받는 도구는 [제공 도구](#제공-도구) 표에 표시했습니다.

## 제공 도구

| 도구                 | 연결 대상 | 용도                                                                                                                                                                        |
| -------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ping`               |           | 간단한 MCP 상태 확인을 위해 `pong`을 반환합니다.                                                                                                                            |
| `get-mcp-session-id` |           | 이 프로세스가 upstream에 사용하는 세션 ID를 반환하는 진단 도구입니다.                                                                                                       |
| `list-connections`   |           | 현재 프로젝트에서 MCP 접근이 허용된 NeoSQL 연결과 스키마를 조회합니다.                                                                                                      |
| `get-context-help`   |           | 활성 프로젝트의 Default와 명시적 대상 사용 방법을 안내합니다.                                                                                                               |
| `list-tables`        | 예        | 테이블을 조회합니다.                                                                                                                                                        |
| `get-table-details`  | 예        | 컬럼, 키, 인덱스 등 테이블 메타데이터를 반환합니다.                                                                                                                         |
| `erd-create-tables`  | 예        | 실제 데이터베이스를 변경하지 않고 ERD에 가상 테이블을 추가합니다.                                                                                                           |
| `erd-modify-tables`  | 예        | 실제 데이터베이스를 변경하지 않고 ERD의 가상 테이블 모델을 수정합니다.                                                                                                      |
| `execute-query`      | 예        | DDL을 포함한 SQL을 실행합니다.                                                                                                                                              |
| `generate-code`      | 예        | 지정한 테이블의 소스 파일을 생성·저장합니다. 프로젝트 설정에서 템플릿 팩, 필수 변수, 출력 폴더(Location)를 설정해야 하며, 별도 확인 창 없이 기존 파일을 덮어쓸 수 있습니다. |

**연결 대상** 열에 표시된 도구는 [실행 컨텍스트 결정](#실행-컨텍스트-결정)에서 설명한
`connectionId`, `database`, `schema` 필드를 받습니다.

## 통신 방식

`neosql-mcp`는 정해진 규칙으로 계산한 로컬 엔드포인트를 통해 NeoSQL Desktop과 통신합니다.
경로는 다음과 같습니다.

- macOS: `getconf DARWIN_USER_TEMP_DIR`로 얻은 사용자별 임시 디렉토리의 `neosql-mcp.sock`
- Windows: `\\.\pipe\neosql-mcp`

## 문제 해결

### Desktop 설치를 찾을 수 없는 경우

설치하지 않았다면 NeoSQL Desktop을 먼저 설치하세요. 이미 설치했는데 감지에 실패하면
앱을 직접 실행한 뒤 도구를 다시 호출하세요. macOS에서는 `/Applications`와 `~/Applications`의
표준 위치를 먼저 확인합니다. 찾지 못하면 Desktop을 한 번 이상 실행한 뒤
`~/.neosql/mcp-config.json`에 기록된 앱 경로를 확인합니다. Windows에서는 HKCU의
사용자별 NSIS 제거 정보 레지스트리 항목을 확인합니다.

### Desktop이 자동으로 실행되지 않는 경우

Desktop이 연결되지 않았고 설치가 확인되면 neosql-mcp가 앱 활성화를 한 번 요청하고
준비 완료를 기다립니다. 설치 확인이나 활성화에 실패하면 Desktop을 직접 실행하고
로딩이 끝난 뒤 도구를 다시 호출하세요.

### Desktop이 응답하지 않거나 준비 시간이 초과된 경우

준비 단계에서 `readiness_timeout`이 반환되면 작업을 전송하기 전에 준비 제한 시간
40초가 지난 것입니다. Desktop의 로딩 오류나 대기 중인 안내를 확인하고 프로젝트가
준비된 뒤 재시도하세요. 앱이 응답하지 않으면 재시작하세요.

이미 전송한 작업의 응답 시간이 초과됐다면 데이터나 파일이 변경됐을 수 있습니다.
실제 결과를 확인한 뒤 재시도하세요. neosql-mcp가 작업을 자동으로 되돌리거나
재시도하지는 않습니다.

### 실행 컨텍스트가 필요한 도구가 실패하는 경우

Desktop에서 프로젝트를 선택하고 사용할 연결과 스키마의 MCP 접근을 허용하세요.
MCP Access Control에서 Default를 설정하고 대상 필드 세 개를 모두 생략하거나,
`list-connections`가 반환한 `connectionId`, `databaseName`, `schemaName`을 각각
`connectionId`, `database`, `schema`로 함께 전달하세요. 명시적 대상을 사용하면
Default는 필요하지 않습니다. 데이터베이스 계층이 없으면 `database: null`을 사용하세요.
대상을 일부만 전달하면 유효하지 않습니다.

응답에서 로그인이나 사용자 조치를 요청하면 Desktop에서 해당 절차를 완료하세요.
프로젝트 잠금 해제, 누락된 드라이버 처리, 안내 확인 등이 해당합니다.
프로젝트 로딩에 실패했다면 Desktop에 표시된 오류를 해결한 뒤 재시도하세요.

### `npx`가 패키지를 찾거나 실행하지 못하는 경우

MCP 호스트에서 `npx`에 접근할 수 있는지, Node.js 버전이 20 이상인지 확인하세요.

### 지정한 프로젝트를 열 수 없는 경우

`--project-id`에 전달한 ID와 Desktop에서 해당 프로젝트에 접근할 권한이 있는지 확인하세요.
저장하지 않은 변경사항을 저장하거나 폐기하고, 로그인이나 프로젝트 안내를 처리한 뒤
재시도하세요. 요청 도중 활성 프로젝트가 바뀌었다면 의도한 프로젝트로 돌아간 뒤 다시
시도하세요.

## 참고 자료

- [NeoSQL 웹사이트](https://neosql.unvus.com)
- [NeoSQL MCP 문서](https://neosql.unvus.com/ko/docs/mcp/intro)
- [NeoSQL Desktop 설치](https://neosql.unvus.com/ko/docs/install)
- [지원 DBMS 및 연결 가이드](https://neosql.unvus.com/ko/docs/database/dbms)
- [NeoSQL MCP 개인정보 처리방침(영문)](https://github.com/unvus/neosql-mcp/blob/main/PRIVACY.md)

## 개발

```bash
npm ci
npm run build
npm test
```

로컬 빌드를 MCP 호스트에서 테스트하려면 `npm link`로 실행 파일을 등록하고, 끝나면
`npm unlink`로 해제하세요.

```bash
npm run build
npm link
# ... MCP 호스트에서 테스트 ...
npm unlink -g neosql-mcp
```

전체 수동 검증 절차는 `docs/e2e-manual.md`를 참고하세요.
