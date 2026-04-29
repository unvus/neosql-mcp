# Phase 2 중계 아키텍처 의사결정

작성일: 2026-04-27
상태: 검토 중 (확정 시 PLAN.md 반영)
선행 문서: `docs/SDK 사용 여부 의사결정.md` (A안·B안 단독 비교까지)

---

## 1. 배경

PLAN.md Phase 2 는 stdio MCP 요청을 neosql Electron 앱 안의 embedded-server (Spring AI MCP, Streamable HTTP) 로 중계하는 계층을 구현하는 단계다. 라인 36, 130 에 이미 "McpServer + Client 한 쌍" 으로 구현하는 방향이 명시되어 있으나, 다음 두 의문이 제기되어 재검토했다.

1. JS MCP SDK 를 쓰지 않고 중립적인 stdio 라인 reader + raw HTTP 중계로도 가능한 것 아닌가?
2. SDK 를 쓰더라도 도구 카탈로그를 mcp 패키지가 알아야 한다면, "neosql 본체 수정 없이 중계" 정신과 충돌하지 않나?

---

## 2. 1차 비교: A안(SDK) vs B안(SDK 없음)

상세는 선행 문서 `docs/SDK 사용 여부 의사결정.md` 참조. 요지만 옮긴다.

| | A안 — SDK 사용 | B안 — SDK 없는 raw 중계 |
|---|---|---|
| 의존성 | `@modelcontextprotocol/sdk` + zod | stdio reader + node fetch + 자체 SSE 파서 |
| 트랜스포트 디테일 | SDK 가 처리 | 직접 구현 (세션ID·SSE·재연결·ID 매핑) |
| MCP spec 변화 | SDK 업데이트 + 핸들러 추가 | 본문 미해석이라 무관 |
| 도구 카탈로그 | (구현 방식에 따라) mcp 패키지가 알아야 할 수 있음 | 항상 upstream 만 보유 |
| 코드량 | 중간 | 작지만 디테일 많음 |
| 호환성 디버깅 비용 | 낮음 | 높음 |

핵심 트레이드오프는 "트랜스포트 안정성(SDK 유리) vs 카탈로그·spec 무관성(raw 유리)" 의 양자택일로 보였다.

---

## 3. 복합안의 도입 — "둘의 단점만 제거"

> 근거: ① stdio↔SSE 브리지의 실제 복잡성이 크다. ② SDK 를 쓰더라도 완전 proxy 로 사용 가능하다.

복합안의 구조는 한 Node 프로세스 안에 **MCP Server SDK + MCP Client SDK 두 인스턴스가 등을 맞대고** 있는 형태다.

```
Claude Host                neosql-mcp (Node process)                embedded-server
   │                                                                       │
   │  stdio                                                                │
   │  (JSON-RPC line)                                                      │
   │                ┌──────────────────────────────────────┐               │
   │                │  Server SDK                          │               │
   │ ── stdin ────▶ │   StdioServerTransport               │               │
   │                │      │ parsed Request                │               │
   │                │      ▼                               │               │
   │                │  forward 함수                        │               │
   │                │      │ client.request(req)           │               │
   │                │      ▼                               │               │
   │                │  Client SDK         HTTP POST        │               │
   │                │   StreamableHTTPClientTransport      │ ──────────▶   │
   │                │      ▲              SSE stream       │ ◀──────────   │
   │                │      │ parsed Result                 │               │
   │                │      ▼                               │               │
   │                │  Server SDK                          │               │
   │ ◀── stdout ─── │   stdout writer                      │               │
   │                └──────────────────────────────────────┘               │
```

요청 흐름은 **stdin → Server SDK → Client SDK 호출 → HTTP/SSE → Client SDK 응답 → Server SDK → stdout** 의 4 단계.

SDK 가 대신해주는 것 vs 직접 작성할 것:

| 항목 | 처리 주체 |
|------|----------|
| stdin/stdout JSON-RPC 프레이밍 | Server SDK |
| Mcp-Session-Id 헤더 라이프사이클 | Client SDK |
| SSE 청크 파싱 (event/data/id 라인) | Client SDK |
| SSE 재연결 + Last-Event-ID resume | Client SDK |
| 양 끝단 initialize 핸드셰이크 | 두 SDK |
| 요청 ID ↔ 응답 매칭 | 두 SDK 의 Protocol 내부 |
| **forward 함수 작성** | 직접 |
| **양방향 notification 펌프 배선** | 직접 |
| **에러 매핑 / 재연결 정책 / capability 합성** | 직접 |

테스트하기 까다롭고 호환성 디버깅이 긴 부분(SSE·세션·재연결)을 통째로 SDK 에 넘기는 것이 복합안의 실익.

---

## 4. forward 작성 방식 — enumeration vs fallback transparent

복합안 안에서도 forward 함수 작성 방식이 둘로 갈린다.

### 4.1 enumeration 방식

```typescript
server.setRequestHandler(ListToolsRequestSchema,    (req) => client.request(req, ListToolsResultSchema));
server.setRequestHandler(CallToolRequestSchema,     (req) => client.request(req, CallToolResultSchema));
server.setRequestHandler(ListResourcesRequestSchema,(req) => client.request(req, ListResourcesResultSchema));
// … 각 메서드별 등록
```

- 도구 카탈로그(예: `list_tables`, `execute_query`)는 mcp 패키지에 **없음** — `tools/list` 핸들러가 upstream 위임만 함
- JSON-RPC 메서드 이름 enumeration 은 **있음**
- 장점: 메서드별 미들웨어(권한·로깅) 삽입 자연스러움, 디버깅 가시성
- 단점: MCP spec 에 메서드 추가 시 SDK 업데이트 + 핸들러 추가 필요

### 4.2 fallback transparent 방식

`Protocol` 클래스(Server·Client 의 부모)의 `fallbackRequestHandler` / `fallbackNotificationHandler` 훅을 사용.

```typescript
// 1) initialize 만 명시적 — capability negotiation 정확성 위해
server.setRequestHandler(InitializeRequestSchema, (req) =>
  client.request(req, InitializeResultSchema),
);

// 2) 그 외 모든 요청·알림은 패스스루
server.fallbackRequestHandler      = (req)   => client.request(req, z.unknown());
server.fallbackNotificationHandler = (notif) => client.notification(notif);
client.fallbackNotificationHandler = (notif) => server.notification(notif);
```

- 메서드 이름 enumeration 도 **불필요** (스펙에 추가될 미래 메서드 자동 패스)
- 도구 카탈로그도 **불필요** (당연)
- 단점: 메서드별 타입 안전성 부재. 단순 중계라 가치 작음
- 예외: `initialize` 만은 SDK Server 가 자체 처리하려는 경향이 있어 명시적 핸들러 필요

### 4.3 용어

이 패턴의 표준 용어:

| 용어 | 강조점 | 적합도 |
|------|--------|--------|
| **Transparent proxy (투명 프록시)** | 내부 무가공 그대로 전달 | ★★★★★ |
| **Pass-through proxy** | 동의어, 페이로드 무가공 | ★★★★★ |
| **Protocol bridge / Transport bridge** | 두 다른 트랜스포트(stdio↔HTTP) 연결 | ★★★★ |
| **Transport adapter** | 미들웨어적 어감 | ★★★★ |
| Tunneling proxy | 캡슐화 — MCP↔MCP 라 부적합 | ★★ |
| Reverse / Forward proxy | HTTP 한정 다른 의미 | ★ |

본 문서·코드에서는 **fallback transparent proxy** 또는 단순히 **transparent proxy** 로 호칭한다. MCP 커뮤니티 공개 구현체(`mcp-proxy`, `mcp-bridge`) 가 같은 용어를 사용.

---

## 5. 결정

**복합안 + fallback transparent proxy** 채택.

### 근거

- "neosql 본체 수정 없이 중계" 라는 mcp 패키지의 설계 정신은 본질적으로 transparent proxy 와 일치
- B안의 핵심 가치(spec 변화 무관·도구 카탈로그 미보유)를 fallback 으로 흡수
- A안의 핵심 가치(SDK 활용·트랜스포트 안정성)도 동시 확보
- 핵심 forward 코드 5–10 줄. 코드량·테스트 표면·유지보수 부담 모두 최소
- 장래에 mcp 자체 도구(헬스체크·캐시·디버그) 가 필요해지면, 해당 메서드만 `setRequestHandler` 로 가로채면 됨 (fallback 보다 우선) — "기본은 fallback, 필요한 것만 가로채기" 로 자연 진화 가능

### 수용한 비용

| 항목 | 비고 |
|------|------|
| SDK 의존 | `@modelcontextprotocol/sdk` v1 이미 Phase 0 에 포함되어 있어 추가 비용 없음 |
| `initialize` 만은 enumeration 식 | 1 메서드 한정. capability negotiation 정확성 위해 필수 |
| 메서드별 타입 안전성 부재 | 단순 중계 목적상 가치 작음 |
| MCP spec 진화 시 SDK 업데이트 필요 | SDK 가 새 transport·session 표준을 흡수하므로 어차피 동조 필요 |

---

## 6. 구현 골격 (참조용)

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { InitializeRequestSchema, InitializeResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

// 1) upstream Client (HTTP)
const client = new Client(
  { name: 'neosql-mcp', version: SERVER_VERSION },
  { capabilities: {} },
);
await client.connect(
  new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)),
);

// 2) stdio Server
const server = new Server(
  { name: 'neosql-mcp', version: SERVER_VERSION },
  { capabilities: {} },
);

// 3) initialize 만 명시적 — upstream capability surface
server.setRequestHandler(InitializeRequestSchema, (req) =>
  client.request(req, InitializeResultSchema),
);

// 4) 그 외 모든 요청·알림은 fallback 으로 패스스루
server.fallbackRequestHandler      = (req)   => client.request(req, z.unknown());
server.fallbackNotificationHandler = (notif) => client.notification(notif);
client.fallbackNotificationHandler = (notif) => server.notification(notif);

await server.connect(new StdioServerTransport());
```

실제 구현은 portResolver(Phase 1) 결과로 port 를 받아오고, upstream 끊김·포트 변경 시 `client` 재생성 + `client.connect()` 재호출 정책이 추가된다.

---

## 7. 미해소 / 후속 결정 항목

- **ping 도구(Phase 0 placeholder) 처리**: 제거(순수 투명 프록시) / 로컬 유지 / `mcp/ping` 으로 재명명 중 결정 필요
- **포트 변경·upstream 끊김 재연결 정책**: PLAN.md "포트 변경 감지 시 resolve 재시도 + 1회 reconnect" 명시되어 있으나, Client transport 교체 / Server 유지 / fallback 핸들러 안에서 lazy 재연결 등 구체화 필요
- **에러 매핑**: HTTP timeout · 4xx · 5xx → JSON-RPC error code 변환 규칙. SDK Client 가 던지는 에러를 그대로 던질지, 코드 통일할지
- **capability 가공 여부**: 기본은 upstream 그대로 surface. 추후 mcp 자체 기능(예: logging) 추가 시 합성 규칙 필요
- **serverInfo 노출**: `neosql-mcp` 식별자로 노출(권장) vs upstream serverInfo 그대로 패스 — 디버깅·식별성 vs 완전 투명성

---

## 8. 참조

- `docs/SDK 사용 여부 의사결정.md` — A안·B안 단독 비교
- `PLAN.md` Phase 2 (라인 123–142), MCP SDK 배치 개념도 (라인 36–39)
- `docs/streamable-http.md` — Streamable HTTP 트랜스포트 정리
- `@modelcontextprotocol/sdk` `Protocol` 클래스의 `fallbackRequestHandler` / `fallbackNotificationHandler`
- 공개 구현체: `sparfenyuk/mcp-proxy`, `atrawog/mcp-streamablehttp-proxy`
- MCP Streamable HTTP transport spec: https://modelcontextprotocol.io/specification/2025-03-26/basic/transports
- 본 결정으로 이어진 대화 세션: 2026-04-27
