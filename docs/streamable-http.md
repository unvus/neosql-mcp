# Streamable HTTP 트랜스포트

MCP(Model Context Protocol)에서 원격 서버와 통신하는 표준 트랜스포트.
이 문서는 **기존 HTTP 요청/응답 API 개발**에 익숙한 개발자를 대상으로 Streamable HTTP가 무엇이고 왜 필요한지, 어떻게 동작하는지를 설명한다.

## 한 줄 요약

> **단일 HTTP 엔드포인트에 JSON-RPC 메시지를 POST**로 보내면, 서버는 응답을 **즉시 JSON**으로 돌려주거나 **SSE 스트림으로 여러 메시지를 흘려보낼지**를 상황에 따라 선택한다. 추가로 클라이언트가 **GET**으로 그 엔드포인트를 열어두면 서버가 비동기 알림도 밀어 넣을 수 있다.

기존 HTTP API와의 가장 큰 차이:

| 축 | 일반 HTTP API | Streamable HTTP |
|----|--------------|-----------------|
| 엔드포인트 | 기능별로 여러 개 (`/users`, `/orders` 등) | **단 하나** (`/mcp` 같은 URL) |
| 본문 프로토콜 | 제각각 (REST/GraphQL 등) | **JSON-RPC 2.0**으로 고정 |
| 응답 형태 | 대부분 단일 JSON | **JSON 또는 SSE 스트림** (서버가 선택) |
| 서버 → 클라이언트 푸시 | 별도 WebSocket 등 필요 | **같은 엔드포인트 GET**으로 SSE 열어서 받음 |
| 세션 | 쿠키/토큰 등 자체 설계 | `Mcp-Session-Id` **헤더 규약** |

## 왜 이 방식이 필요한가

일반 request/response API로는 아래 세 가지가 모두 필요한 상황을 자연스럽게 다루기 어렵다.

1. **장시간 작업의 중간 진행 상황** — LLM이 툴 실행 중 "지금 1/5 단계" 같은 알림을 흘려보내고 싶을 때.
2. **서버가 먼저 말 걸어야 할 때** — 사용자에게 확인을 묻거나, 변경 사항을 알리는 notification.
3. **단일 연결로 JSON-RPC request/response/notification이 섞여 흐르는** 상태 유지.

과거 MCP는 이를 위해 "HTTP + SSE"라는 **두 개의 엔드포인트**(POST용과 SSE 수신용 분리)로 풀었는데, 구조가 복잡하고 로드밸런서/프록시 친화적이지 않았다. Streamable HTTP는 이걸 **엔드포인트 하나로 합친** 버전이다.

## 기본 구성 요소

### 1) 단일 MCP 엔드포인트

서버는 URL 하나를 노출한다. 예: `https://example.com/mcp`

- **POST** → 클라이언트가 메시지를 보낼 때
- **GET** → 클라이언트가 서버 발신 메시지를 수신할 스트림을 열 때
- **DELETE** → 클라이언트가 세션을 명시적으로 끝낼 때 (선택)

### 2) 메시지 포맷

본문은 항상 **JSON-RPC 2.0**. 세 종류:

- **request** — 응답을 기대하는 호출 (`id` 있음)
- **notification** — 응답 없는 일방 통보 (`id` 없음)
- **response** — request에 대한 결과 (`id` 매칭)

배열로 batch 전송 가능.

## POST 동작 — 클라이언트가 메시지를 보낼 때

일반 HTTP API의 POST와 거의 동일하게 시작한다.

```http
POST /mcp HTTP/1.1
Accept: application/json, text/event-stream
Content-Type: application/json
Mcp-Session-Id: 1868a90c-...

{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{...}}
```

중요한 규칙:

- `Accept` 헤더에 **`application/json`과 `text/event-stream` 둘 다** 포함해야 한다 (서버가 둘 중 아무거나 고를 수 있음).
- 본문은 단일 JSON-RPC 메시지 또는 배열.

### 본문이 response / notification 뿐인 경우

서버는 그냥 받기만 하면 되므로:

- 정상 수신 → **HTTP 202 Accepted**, 본문 없음.
- 거부 → 4xx.

### 본문에 request가 포함된 경우 — 두 갈래

서버는 다음 중 **하나**를 선택해 응답한다.

#### (a) `Content-Type: application/json` — 일반 HTTP 응답

```http
HTTP/1.1 200 OK
Content-Type: application/json

{"jsonrpc":"2.0","id":1,"result":{...}}
```

기존 REST/RPC API와 같은 모양. **1요청 1응답으로 끝나는 단순한 경우**에 서버가 이 경로를 택한다.

#### (b) `Content-Type: text/event-stream` — SSE 스트림으로 전환

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream

data: {"jsonrpc":"2.0","method":"notifications/progress","params":{"progress":1,"total":5}}

data: {"jsonrpc":"2.0","method":"notifications/progress","params":{"progress":3,"total":5}}

data: {"jsonrpc":"2.0","id":1,"result":{...}}
```

- 서버가 **여러 메시지를 흘려보낼 필요가 있을 때** 이 경로를 택한다.
- 각 `data:` 라인은 JSON-RPC 메시지 하나.
- 관련된 notification/request를 먼저 보내고, 마지막에 원래 request에 대한 response로 스트림을 닫는 게 일반적.
- 끊겨도 "클라이언트가 취소한 것으로 해석하면 안 됨" — 취소는 반드시 `CancelledNotification`으로 명시해야 함.

**SSE가 익숙하지 않다면**: `Content-Type: text/event-stream`으로 응답 본문을 쭉 열어두고, 줄 단위 텍스트 이벤트를 붙여 내려보내는 단순한 HTTP 기반 포맷. 브라우저 `EventSource` API의 그 SSE와 같다. WebSocket과 달리 **순수 HTTP 기반**이라 기존 HTTP 인프라(LB, 프록시, CDN)가 그대로 먹힌다.

## GET 동작 — 서버가 먼저 말 걸어야 할 때

클라이언트는 POST 없이도 스트림을 열 수 있다:

```http
GET /mcp HTTP/1.1
Accept: text/event-stream
Mcp-Session-Id: 1868a90c-...
```

서버 응답:

- `Content-Type: text/event-stream`으로 SSE 스트림을 열거나
- **405 Method Not Allowed**를 반환 (서버가 이 기능을 지원하지 않는 경우).

이 스트림으로 서버는:
- 자체 notification (예: "설정이 변경되었습니다")
- 클라이언트에게 묻는 request (예: sampling, elicitation)

…을 임의 시점에 밀어 넣을 수 있다. **response는 원칙적으로 이 스트림으로 보내지 않는다** (재연결 복구 제외).

## 세션 관리 — `Mcp-Session-Id` 헤더

서버가 상태를 유지해야 하면 세션 ID를 발급한다.

1. 첫 `initialize` 응답의 HTTP 헤더에 `Mcp-Session-Id: <uuid>` 포함.
2. 클라이언트는 **이후 모든 요청 헤더**에 이 값을 실어야 함.
3. 세션 ID 없는 요청 → 서버가 **400 Bad Request**.
4. 서버가 세션을 만료시키면 → 해당 ID로 오는 요청에 **404 Not Found** → 클라이언트는 **새로 `initialize`** 해야 함.
5. 클라이언트가 끝내고 싶으면 → **`DELETE /mcp`** with `Mcp-Session-Id` 헤더.

일반 HTTP API의 세션 쿠키·JWT와 역할이 같고, 이름만 규약화된 것이라 이해하면 된다.

## 재연결 — `Last-Event-ID` 헤더

SSE 스트림이 네트워크 문제로 끊겼을 때 메시지를 잃지 않기 위한 장치.

- 서버가 SSE 이벤트에 `id: <event-id>`를 붙여 내려보냄.
- 클라이언트는 마지막으로 받은 이벤트 ID를 기억해뒀다가, 재연결 시 **`GET /mcp`** 요청에 **`Last-Event-ID: <event-id>`** 헤더를 포함.
- 서버는 그 ID 이후 메시지만 **해당 스트림 기준으로 리플레이**.

브라우저 `EventSource` 자동 재연결의 그 메커니즘과 동일.

## 시퀀스 요약

```
[initialize]
Client  ──POST initialize──▶  Server
        ◀─ 200 + Mcp-Session-Id ─┤
Client  ──POST initialized notif──▶
        ◀─ 202 ──────────────────┤

[normal request — 단순 응답 케이스]
Client  ──POST tools/call (id=1)──▶
        ◀─ 200 application/json ─┤ (response id=1)

[normal request — 스트리밍 케이스]
Client  ──POST tools/call (id=2)──▶
        ◀─ 200 text/event-stream
              ↳ notification (progress 1/5)
              ↳ notification (progress 3/5)
              ↳ response id=2
              └ 스트림 close

[server → client 푸시 채널]
Client  ──GET /mcp (Accept: text/event-stream)──▶
        ◀─ 200 text/event-stream (long-lived)
              ↳ 서버 알림 / 서버 발신 request

[세션 종료]
Client  ──DELETE /mcp──▶
        ◀─ 200 ─────────┤
```

## 예전 HTTP+SSE와의 차이

| | 예전 HTTP+SSE (2024-11-05) | Streamable HTTP (현재) |
|-|--------------------------|----------------------|
| 엔드포인트 수 | **2개** (POST용, SSE용 따로) | **1개** (POST/GET 공용) |
| 서버 첫 메시지 | 전용 SSE `endpoint` 이벤트 필요 | 불필요 |
| 재연결 | 비표준 | `Last-Event-ID` 표준화 |
| 세션 | 비표준 | `Mcp-Session-Id` 표준화 |

예전 방식은 deprecated. 호환성을 위해 둘 다 지원하는 서버도 있지만, 신규 구현은 Streamable HTTP만으로 충분하다.

## neosql-mcp에서의 의미

`neosql-mcp`는 **stdio**로 들어온 MCP 요청을 **Streamable HTTP**로 embedded-server에 중계한다.

```
Claude Host  ──stdio──▶  neosql-mcp  ──Streamable HTTP──▶  embedded-server (Spring AI MCP)
```

구현 시 유의할 점:

- **SSE 응답을 그대로 흘려보내기**: upstream이 `text/event-stream`으로 응답하면 각 이벤트를 stdio JSON-RPC 메시지로 그대로 변환해 내려줘야 함 (버퍼링 금지, backpressure 주의).
- **세션 ID 보존**: `initialize` 시점의 `Mcp-Session-Id`를 기억하고 이후 모든 upstream 호출에 붙임.
- **재연결**: upstream 끊김 시 Phase 1의 포트 재확인 → 새 upstream으로 `initialize` 재시작. (이전 세션 ID는 무효화 가능성 있으므로 404 시 재-initialize.)
- **능동 푸시 채널**: neosql embedded-server가 GET SSE로 서버 발신 알림을 보내면, 이것도 stdio로 전달. 초기 구현은 POST 응답 스트림만 먼저 지원하고, GET 채널은 필요 시 확장.

## 참고

- 공식 Transport 스펙: https://modelcontextprotocol.io/specification/2025-03-26/basic/transports
- MCP 문서: https://modelcontextprotocol.io/docs
- TS SDK (구현 참고): https://github.com/modelcontextprotocol/typescript-sdk
- SSE 표준: https://html.spec.whatwg.org/multipage/server-sent-events.html
