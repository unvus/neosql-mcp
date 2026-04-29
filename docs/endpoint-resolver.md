# endpoint-resolver

`neosql-mcp` 와 `electron-main` 양쪽이 같은 규칙으로 산출하는 upstream 채널 endpoint 정의.

## 목적

- `neosql-mcp` 가 어디로 connect 할지 알아야 한다.
- 양쪽 코드가 **config 파일·환경변수·프로세스 탐색 없이** 동일 규칙으로 path 를 계산한다.
- 결과: `neosql-mcp` 측 `resolveSocketPath(profile)` 가 반환하는 단일 문자열 + 고정 HTTP path 상수 `'/rpc'`.

## 경로 산출 규칙

### POSIX (macOS / Linux)

```
path.join(os.tmpdir(), `neosql-mcp${suffix}.sock`)
```

- `suffix`:
  - prod 빌드(npm 배포본 / `npx neosql-mcp`): `''`
  - dev 빌드(`--dev` 플래그): `'-dev'`
- macOS 의 `os.tmpdir()` 은 OS 가 user-isolated 경로(`/var/folders/.../T/`) 를 반환하므로 다른 사용자와 충돌하지 않는다.
- Linux 의 `os.tmpdir()` 은 보통 공유 `/tmp` — 다중 사용자 시 보정(예: XDG_RUNTIME_DIR 또는 `${HOME}/.cache/neosql/`) 은 **본체(electron-main) 작업 시점에 결정**. 본 모듈은 결정 전까지 `os.tmpdir()` 그대로 사용.

### Windows

```
\\.\pipe\neosql-mcp{suffix}
```

- `suffix` 규칙은 POSIX 와 동일.
- Named Pipe path 는 파일시스템 경로가 아니라 win32 IPC 식별자.
- `chmod 0600` 동등 권한 격리는 Node 표준 API 미제공 — Named Pipe ACL 은 **본체 작업 시 win32 native 처리로 보강**. 본 모듈은 path 산출까지만 책임.

## profile 인지

- mcp 측: CLI 인자에서 `--dev` / `--prod` 플래그로 구분 (`parseCliArgs`).
  - default `prod`.
  - 충돌 시(`--dev --prod`) 마지막 인자 우선.
  - 알 수 없는 인자는 무시.
- electron-main 측: 본체 dev 실행 규칙과 대칭(본체 작업 시 확정).

## HTTP path

```
HTTP_PATH = '/rpc'
```

- 양쪽 코드의 상수로 보유. config 미저장.
- 단일 path 위에서 JSON-RPC method 로 분기 (`connection.list`, `sql.execute`, …).
- 서버 push 가 필요한 경우 같은 path 의 GET SSE 채널 별도 오픈 (Phase 2).

## 호출 예

```ts
import { resolveSocketPath, HTTP_PATH } from './endpoint-resolver.js';
import http from 'node:http';

const socketPath = resolveSocketPath('prod');
const req = http.request({ socketPath, method: 'POST', path: HTTP_PATH });
```

## 알려진 제약

| 항목 | 내용 | 완화 |
|---|---|---|
| POSIX `sun_path` 길이 ~104 byte (macOS) | macOS `os.tmpdir()` 만으로도 ~50 char 차지 | path 단편이 짧아야 함 (테스트는 `nm-test-{8hex}.sock`) |
| POSIX socket file 잔존 | 비정상 종료 시 unlink 안 됨 → 다음 listen `EADDRINUSE` | electron-main 기동 시 unlink 후 listen (본체 작업) |
| Windows Named Pipe 권한 | `\\.\pipe\name` 의 ACL 기본값은 다른 사용자 접근 가능성 있음 | win32 native 호출로 SDDL 적용 (본체 작업 시 보강) |

## 관련 모듈

- `src/endpoint-resolver.ts` — `resolveSocketPath(profile)`, `HTTP_PATH`
- `src/cli-args.ts` — `parseCliArgs(argv)`
- `src/health-check.ts` — `checkHealth(socketPath)` (산출된 path 로 connect 시도)
- `src/cli.ts` — 위 셋을 결합한 엔트리
