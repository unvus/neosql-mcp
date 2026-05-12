# endpoint-resolver

`neosql-mcp` 와 `electron-main` 양쪽이 같은 규칙으로 산출하는 upstream 채널 endpoint 정의.

## 목적

- `neosql-mcp` 가 어디로 connect 할지 알아야 한다.
- 양쪽 코드가 **config 파일·환경변수·프로세스 탐색 없이** 동일 규칙으로 path 를 계산한다.
- 결과: `neosql-mcp` 측 `resolveSocketPath(profile)` 가 반환하는 단일 문자열 + 고정 HTTP path 상수 `'/mcp/rpc'`.

## 경로 산출 규칙

### macOS

```
path.join(os.tmpdir(), `neosql-mcp${suffix}.sock`)
```

- `suffix`:
  - prod 빌드(npm 배포본 / `npx neosql-mcp`): `''`
  - non-prod profile(`--profile=dev|local|stage`): `'-' + profile`
- macOS 의 `os.tmpdir()` 은 OS 가 user-isolated 경로(`/var/folders/.../T/`) 를 반환하므로 다른 사용자와 충돌하지 않는다.
- Linux 는 NeoSQL Desktop 지원 대상이 아니므로 public support 범위에서 제외한다.

### Windows

```
\\.\pipe\neosql-mcp{suffix}
```

- `suffix` 규칙은 macOS 와 동일.
- Named Pipe path 는 파일시스템 경로가 아니라 win32 IPC 식별자.
- `chmod 0600` 동등 권한 격리는 Node 표준 API 미제공 — Named Pipe ACL 은 **본체 작업 시 win32 native 처리로 보강**. 본 모듈은 path 산출까지만 책임.

## profile 인지

- mcp 측: CLI 인자에서 `--profile=<prod|dev|local|stage>` 값으로 구분 (`parseCliArgs`).
  - default `prod`.
  - 충돌 시 마지막 유효 profile 값 우선.
  - 알 수 없는 인자는 무시.
- electron-main 측: 본체 dev 실행 규칙과 대칭(본체 작업 시 확정).

## HTTP path

```
HTTP_PATH = '/mcp/rpc'
```

- 양쪽 코드의 상수로 보유. config 미저장.
- 단일 path 위에서 JSON-RPC method 로 분기 (`schema.listTables`, `sql.executeQuery`, …).
- `/mcp/` 네임스페이스로 묶어 향후 `/health`, `/version` 등 비-RPC endpoint 또는 다른 RPC 묶음과 충돌하지 않도록 한다.
- 서버 push 가 필요한 경우 같은 path 의 GET SSE 채널 별도 오픈 (Phase 2).

## 호출 예

```ts
import { resolveSocketPath, HTTP_PATH } from './endpoint-resolver.js';
import http from 'node:http';

const socketPath = resolveSocketPath('prod');
const req = http.request({ socketPath, method: 'POST', path: HTTP_PATH });
```

## 알려진 제약

| 항목                                    | 내용                                                         | 완화                                                   |
| --------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------ |
| macOS `sun_path` 길이 ~104 byte          | macOS `os.tmpdir()` 만으로도 ~50 char 차지                   | path 단편이 짧아야 함 (테스트는 `nm-test-{8hex}.sock`) |
| macOS socket file 잔존                   | 비정상 종료 시 unlink 안 됨 → 다음 listen `EADDRINUSE`       | electron-main 기동 시 unlink 후 listen (본체 작업)     |
| Windows Named Pipe 권한                 | `\\.\pipe\name` 의 ACL 기본값은 다른 사용자 접근 가능성 있음 | win32 native 호출로 SDDL 적용 (본체 작업 시 보강)      |

## 관련 모듈

- `src/endpoint-resolver.ts` — `resolveSocketPath(profile)`, `HTTP_PATH`
- `src/cli-args.ts` — `parseCliArgs(argv)`
- `src/health-check.ts` — `checkHealth(socketPath)` (산출된 path 로 connect 시도)
- `src/cli.ts` — 위 셋을 결합한 엔트리
