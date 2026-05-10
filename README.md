# neosql-mcp

클라이언트(MCP Host) 와 neosql Electron 앱 사이를 중계하는 npx 기반 MCP 서버 `neosql-mcp` 를 설계·구현한다.

## 배경

기존 neosql MCP 는 embedded-server (Spring AI MCP) 를 HTTP 로 직접 호출하는 방식이었다. 이를 다음 구조로 전환한다.

- **도구 카탈로그·핸들러** 는 mcp Node 모듈이 보유한다 (기존 embedded-server 의 tool 명세를 Node 로 가져옴).
- **데이터 조회·UI 트리거** 는 electron-main 이 호스트하는 **HTTP 엔드포인트** (POST 요청/응답 + 필요 시 GET SSE 푸시) 로 위임한다. transport 는 **Unix Domain Socket (POSIX) / Named Pipe (Windows)** — TCP 포트 미사용.
- 배포 패키지명: `neosql-mcp`

```
[mcp-client] ─stdio─▶ [neosql-mcp (Node)] ─HTTP+SSE over UDS/Named Pipe─▶ [electron-main] ─IPC─▶ [electron-renderer]
```

### 왜 npx 중계 구조인가

- embedded-server는 Electron이 **동적 포트**로 기동하므로 (`I_PORT` 환경변수), 클라이언트가 고정 URL로 접근할 수 없다.
- Desktop 앱이 실행되지 않은 상태에서 MCP 호출이 들어오면 사용자 개입 없이 앱을 기동해야 한다.
- 최초 사용자는 Desktop 앱 자체가 설치되어 있지 않을 수 있다.

이 모든 전/후처리를 로컬 npx 프로세스가 담당한다.

### 왜 UDS / Named Pipe 인가

- TCP 포트 미사용 → 포트 충돌, 사용자 보안 SW 의 loopback 차단 등에서 자유.
- OS 레벨 격리 — POSIX 는 file path + `chmod 0600`, Windows 는 Named Pipe ACL 로 동일 호스트 내 다른 사용자 차단 가능.
- Node `http`/`net` 이 동일 API 로 두 OS 모두 추상화 — 코드 분기는 socket path 결정만.
- POC 에서 핵심 시나리오 (POST/JSON, SSE, N:1 multi-connection) 실측 통과.

## 기능 개발 우선순위

아래 순서대로 구현을 진행한다.

### 1. electron-main 엔드포인트 검출 및 호출

- 실행 중인 neosql Electron 엔드포인트로 도구 핸들러의 RPC 호출을 위임한다 (`http.request({ socketPath, ... })`).

### 2. electron-app 실행 상태 확인 및 기동

- electron-app 프로세스가 떠 있는지 확인한다.
- 떠 있지 않으면 설치된 앱을 **기동** 한다.
- 기동 후 socket 이 listen 상태가 될 때까지 대기 (health check) 한다.
- tool 호출시 인증에 실패하면 로그인할 수 있도록 안내한다.

### 3. electron-app 설치 여부 확인 및 설치

- electron-app 설치 여부를 플랫폼별로 확인한다.
- 설치되어 있지 않으면 **다운로드 및 설치** 를 안내/수행한다.

## 참고 문서

- 프로젝트 전반: `CLAUDE.md` (세션 context 에 자동 로드)
- 단계별 구현 계획: `PLAN.md`
- MCP host 설정 contract: `docs/mcp-client-config.md`
- npm 배포 절차: `docs/npm-publish.md`
- 수동 e2e 검증 (실제 MCP 클라이언트 연동): `docs/e2e-manual.md`
- 통신 계층 정리 (RPC vs Transport): `docs/통신 스택 계층 (RPC vs Transport).md`
- neosql 실행 모드/포트 결정: `~/workspace/neosql/docs/architecture/execution-modes.md`
