# neosql-mcp 구현 계획

단계별 목표·산출물·TDD 관점 테스트 포인트·완료 조건을 정리한다.
각 Phase는 테스트가 모두 통과한 상태에서 다음 Phase로 진입한다.

> **진행 방식**: Phase 0 → 1 → 2 까지 먼저 완성한다. Phase 3 이상은 Phase 2 완료 시점에 범위·우선순위를 다시 판단한다.

## 확정 사항 (2026-04-24)

| 항목 | 확정 |
|------|------|
| 기술 스택 | 아래 "기술 스택" 표 그대로 |
| 포트 검출 | **포트 파일 단독** (환경변수 override·프로세스 탐색·포트 스캔 등은 구현 안 함, 필요 시 개발 중 재검토) |
| 포트 파일 경로 | neosql Electron 앱의 `userData/neosql-config.json` (macOS `~/Library/Application Support/NeoSQL/neosql-config.json`, Windows `%APPDATA%\NeoSQL\neosql-config.json`) |
| 포트 파일 스키마 | `{ "embeddedServerPort": number, "embeddedServerPid"?: number }` (앱 실행 중일 때만 `embeddedServerPid` 존재) |
| Phase 순서 | Phase 0 → 1 → 2 선행, Phase 3 이상은 Phase 2 완료 후 재검토 |
| 배포 | **npm public registry** (`npx neosql-mcp`) |

## 기술 스택

| 항목 | 선택 | 선택 이유 |
|------|------|----------|
| 런타임 | **Node 20+** | MCP SDK 최소 요구, 내장 `fetch`/`ReadableStream`으로 SSE 중계 용이. |
| 언어 | **TypeScript** (strict) | MCP SDK 자체가 TS·타입 완비, 메시지 스키마 안전 처리. |
| MCP SDK | **`@modelcontextprotocol/sdk` v1** | 공식. Server+Client+Transport 한 패키지 → 중계기 구현에 그대로 사용. v2는 pre-alpha. |
| 테스트 | **Vitest** | TS 네이티브(ts-jest 불필요), ESM 친화, 빠른 watch, mock API 내장. |
| 빌드 | **tsup** | esbuild 기반. `bin` 진입점 번들링에 특화 → `npx neosql-mcp` 배포에 적합. |
| HTTP | **Node 내장 fetch** (필요 시 `undici`) | 기본 중계는 내장 fetch로 충분. keep-alive/dispatcher 제어가 필요해지면 undici로 교체. |
| Lint/Format | **ESLint + Prettier** | 생태계 성숙. Biome은 속도 이점 있으나 플러그인 성숙도 부족. |
| 로깅 | **pino (stderr)** | MCP는 stdout이 JSON-RPC → **로그는 반드시 stderr**. pino는 저비용 구조화 로그 표준. |
| 배포 | npm publish (`bin: neosql-mcp`) | `npx neosql-mcp` 실행 |

### MCP SDK 배치 개념도

```
Claude Host ──stdio──▶ neosql-mcp (McpServer + Client) ──StreamableHTTP──▶ embedded-server (Spring AI MCP)
```

neosql-mcp 내부에서 `McpServer`가 수신한 요청을 내부 `Client`로 forward. tools/resources 목록도 upstream에서 조회해 그대로 노출.

### 참고 링크

- MCP 스펙: https://modelcontextprotocol.io/specification/latest
- MCP 문서: https://modelcontextprotocol.io/docs
- TS SDK GitHub: https://github.com/modelcontextprotocol/typescript-sdk
- TS SDK API (v1): https://modelcontextprotocol.github.io/typescript-sdk/
- Server 가이드: https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md
- Client 가이드: https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/client.md
- Transport 스펙: https://modelcontextprotocol.io/specification/2025-03-26/basic/transports
- npm: https://www.npmjs.com/package/@modelcontextprotocol/sdk
- Streamable HTTP 정리 (이 리포): `docs/streamable-http.md`

---

## Phase 0 · 프로젝트 부트스트랩

**목표**: `npx neosql-mcp`가 실행되는 최소 MCP 서버 스켈레톤 확보.

**산출물**
- `package.json` (name: `neosql-mcp`, bin: `dist/cli.js`)
- TypeScript + tsup 빌드 파이프라인
- Vitest 구성
- `ping` 툴 하나만 가진 stdio MCP 서버 (임시)
- ESLint + Prettier, pino 로거 (stderr) 초기 설정

**테스트 (TDD)**
- CLI 실행 smoke test: child process spawn → `initialize` handshake 성공
- `ping` 툴 호출 왕복

**완료 조건**
- Claude Desktop/Code에 `npx neosql-mcp` 등록 후 `ping` 호출 성공
- 스택 구성 이 문서에 최종 반영

---

## Phase 1 · embedded-server 포트 검출 (포트 파일 단독)

**목표**: 로컬에서 실행 중인 neosql embedded-server의 HTTP 포트를 포트 파일로부터 읽는다. 대체 전략(환경변수 override, 프로세스 탐색, 포트 스캔)은 이 단계에서 **구현하지 않는다**. 필요 판단 시 개발 중에 재검토.

### 포트 파일 방식

기존 neosql Electron 앱이 이미 작성하는 `neosql-config.json` 을 그대로 재사용한다. mcp 전용 파일을 추가하지 않는다.

- **경로** (Electron `app.getPath('userData')` 규칙)
  - macOS: `~/Library/Application Support/NeoSQL/neosql-config.json`
  - Windows: `%APPDATA%\NeoSQL\neosql-config.json`
- **앱 실행 중**
  ```json
  { "embeddedServerPort": 52080, "embeddedServerPid": 26301 }
  ```
- **앱 종료**
  ```json
  { "embeddedServerPort": 52080 }
  ```
- **수명 주기** (neosql 본체가 이미 수행 중)
  - electron-app 이 embedded-server spawn 직후 → 빈 포트 선택 → java 실행 → 위 파일에 `embeddedServerPort` + `embeddedServerPid` 기록.
  - 앱 정상 종료 시 → `embeddedServerPid` 만 제거. `embeddedServerPort` 는 남는다.
  - 즉 **`embeddedServerPid` 존재 = 실행 중** 으로 1차 판정 가능.
  - 비정상 종료로 pid 가 남아있는 경우 → neosql-mcp 가 pid 생존·port listen 여부로 걸러냄.

### 산출물

- `portResolver` 모듈: `neosql-config.json` 읽기 → 실행 상태 판정 → 유효 URL 반환.
- config 파일 read helper (스키마 검증 포함, OS 별 경로 해석).
- health check helper (Streamable HTTP MCP endpoint ping).

### 테스트 (TDD)

- `embeddedServerPort` + `embeddedServerPid` 정상 → port 반환.
- `embeddedServerPid` 없음 (앱 종료 상태) → "앱이 실행되고 있지 않음" 에러.
- 파일 없음 → 명확한 에러 (앱 미설치/미실행).
  - TODO 파일이 있다고 해서 반드시 설치되어 있다고 볼 수 있을까?
- pid 가 살아있다고 기록되었으나 실제 프로세스 죽음 / port listen 안 됨 → stale 에러.
- 스키마 불일치 (`embeddedServerPort` 누락 등) → 에러.

### 완료 조건

- neosql Desktop이 기동된 상태에서 포트 반환 성공.
- neosql Desktop 미실행/종료 상태에서 사용자에게 명확한 에러 메시지 노출.

---

## Phase 2 · stdio ↔ HTTP MCP 중계

**목표**: 클라이언트의 stdio MCP 요청을 embedded-server의 Spring AI MCP (Streamable HTTP)로 프록시.

**산출물**
- `relay` 모듈:
  - upstream URL은 Phase 1의 `portResolver`로 해결.
  - `@modelcontextprotocol/sdk`의 `McpServer`(stdio) + `Client`(StreamableHTTP) 쌍으로 forward.
  - 메소드: `initialize`, `tools/list`, `tools/call`, `resources/*`, `prompts/*`, `notifications/*`.
  - 에러 매핑 (HTTP 4xx/5xx·타임아웃 → MCP error).
  - 포트 변경 감지 시 resolve 재시도 + 1회 reconnect.

**테스트 (TDD)**
- mock upstream HTTP MCP 서버에 대한 proxy 무결성 (req/resp body·header·메시지 id 보존).
- 스트리밍 응답(Streamable HTTP) 중계.
- upstream down·타임아웃·포트 변경 케이스.

**완료 조건**
- 실제 neosql Desktop을 upstream으로 `tools/list` / `tools/call` 왕복 성공.
- Phase 2 완료 시점에 **Phase 3 이상 범위·우선순위 재검토**.

---

## Phase 3 이상 (Phase 2 완료 후 구체화)

Phase 2까지의 결과를 확인한 뒤 아래 항목의 범위·우선순위·방식을 재검토한다.

- **electron-app 실행 상태 확인·자동 기동** — Desktop이 꺼진 상태에서 MCP 요청 시 어떻게 처리할지.
- **electron-app 설치 여부 확인·설치 안내 또는 자동 설치** — 미설치 사용자 UX.
- **안정화·UX** — 구조화 로그 확장, CLI 옵션, lazy launch, E2E 시나리오 테스트.
