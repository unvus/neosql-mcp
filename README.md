# neosql-mcp

neosql MCP 개발 실습 공간. 클라이언트(MCP Host)와 neosql embedded-server 사이를 중계하는 npx 기반 MCP 서버 `neosql-mcp`를 설계·구현한다.

## 배경

기존 neosql MCP는 HTTP로 Spring AI MCP 엔드포인트를 직접 호출하는 방식이었다. 이를 `npx neosql-mcp` 로 실행되는 **로컬 중계 서버** 방식으로 전환한다.

- neosql 본체(Spring AI MCP) 소스는 **수정하지 않는다**.
- `neosql-mcp`가 embedded-server(로컬 JAR) 및 electron-app(Desktop)의 기동·연결 상태를 관리하면서 MCP 요청을 중계한다.
- 배포 패키지명: `neosql-mcp` (향후 변경 가능)

### 왜 npx 중계 구조인가

- embedded-server는 Electron이 **동적 포트**로 기동하므로 (`I_PORT` 환경변수), 클라이언트가 고정 URL로 접근할 수 없다.
- Desktop 앱이 실행되지 않은 상태에서 MCP 호출이 들어오면 사용자 개입 없이 앱을 기동해야 한다.
- 최초 사용자는 Desktop 앱 자체가 설치되어 있지 않을 수 있다.

이 모든 전/후처리를 Spring 서버가 아니라 로컬 npx 프로세스가 담당하는 것이 합리적이다.

## 기능 개발 우선순위

아래 순서대로 구현을 진행한다.

### 1. embedded-server 포트 검출 및 호출

- 실행 중인 embedded-server의 **현재 포트**를 확인한다.
- 해당 포트로 MCP 요청을 중계한다.
- 참고: `app/src/boot/axios.ts` 의 `iapi` baseURL 결정 로직, Electron main의 `I_PORT` 환경변수.

### 2. electron-app 실행 상태 확인 및 기동

- electron-app 프로세스가 떠 있는지 확인한다.
- 떠 있지 않으면 설치된 앱을 **기동**한다.
- 기동 후 embedded-server가 listen 상태가 될 때까지 대기(health check)한다.

### 3. electron-app 설치 여부 확인 및 설치

- electron-app 설치 여부를 플랫폼별로 확인한다.
- 설치되어 있지 않으면 **다운로드 및 설치**를 안내/수행한다.

## 참고 문서

- 프로젝트 전반: `CLAUDE.md` (세션 context에 자동 로드)
- 단계별 구현 계획: `PLAN.md`
- 수동 e2e 검증 (실제 MCP 클라이언트 연동): `docs/e2e-manual.md`
- Streamable HTTP 트랜스포트 개념·동작: `docs/streamable-http.md`
- neosql 실행 모드/포트 결정: `~/workspace/neosql/docs/architecture/execution-modes.md`
- MCP 개선 논의 소스: `~/workspace/neosql/docs/plan/mcp-improvement-discussion-source.md`
