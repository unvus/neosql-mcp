# 통신 스택 계층 — RPC, Transport, 그리고 그 위/아래

> 작성일: 2026-04-28
> 분류: 참고 / 개념 정리
>
> 작성 동기: Phase 4 이후 Node MCP ↔ Electron 채널을 결정하는 과정에서
> "RPC 와 HTTP/WebSocket 이 같은 계층의 선택지인가?" 라는 의문이 출발점.
> 결론적으로 **다른 계층**이며, 분리해서 보면 채널 설계가 명확해진다.

---

## 1. 개념 설명

### RPC ≠ Transport

흔히 "RPC, HTTP, WebSocket 중 뭘 쓸까" 같은 식으로 묶어서 이야기하지만, 이것들은 **서로 다른 계층의 개념**이다.

- **RPC (Remote Procedure Call)**
  "원격에 있는 함수를 마치 로컬 함수처럼 호출한다" 는 **호출 모델·패턴**.
  요청/응답 메시지의 **의미 구조** 를 정의한다 (메서드 이름, 파라미터, 결과, 에러).
  *어떤 통로로 보내는지는 RPC 가 정하지 않는다.*

- **Transport**
  바이트(또는 메시지) 를 **양 끝점 사이에 운반** 하는 계층.
  연결 모델(요청-응답 / 양방향 / 단방향), 신뢰성, 순서 보장, 양방향 여부 등을 결정한다.
  *그 위에 어떤 의미를 실어 보낼지는 정하지 않는다.*

따라서 "JSON-RPC 를 stdio 로 보낸다", "JSON-RPC 를 HTTP 로 보낸다", "JSON-RPC 를 WebSocket 으로 보낸다" 가 모두 가능하다 — 같은 RPC 패턴을 **다른 transport 위에 얹는** 것일 뿐.

### 헷갈리는 이유

- HTTP 가 워낙 자주 "REST 의 캐리어" 로만 쓰여서, application protocol 처럼 느껴진다. 실제로는 운반 수단.
- gRPC 의 이름에 "RPC" 가 있어 transport 같지만, 실은 **HTTP/2 위에 Protobuf 를 얹은 RPC 패턴**.
- WebSocket 은 HTTP upgrade 핸드셰이크로 시작하지만, 그 후에는 별개 transport (양방향 frame stream) 로 동작.

### 한 줄 요약

> **RPC 는 "무엇을 말할지", Transport 는 "어떻게 보낼지"** 를 정한다.
> 두 결정은 직교(orthogonal)하므로 분리해서 고르면 설계가 단순해진다.

---

## 2. 계층 정리

```
[L4] Application Protocol / Pattern
       ├─ RPC (요청-응답 호출 모델)
       │    ├─ JSON-RPC 2.0
       │    ├─ gRPC
       │    ├─ XML-RPC
       │    ├─ SOAP
       │    ├─ Apache Thrift
       │    └─ Cap'n Proto RPC
       ├─ REST            (리소스 지향)
       ├─ GraphQL         (쿼리 지향)
       ├─ Pub/Sub         (브로커 매개)
       │    ├─ MQTT
       │    ├─ AMQP (RabbitMQ)
       │    └─ Kafka protocol
       ├─ Streaming       (지속 송신)
       │    ├─ SSE
       │    ├─ gRPC streaming
       │    └─ WS 기반 custom
       └─ Domain Protocol (위 패턴 위에 정의된 도메인 규약)
            ├─ MCP   (JSON-RPC 2.0 기반)
            ├─ LSP   (JSON-RPC 2.0 기반, Language Server Protocol)
            ├─ DAP   (JSON-RPC, Debug Adapter Protocol)
            └─ BSP   (JSON-RPC, Build Server Protocol)

[L3] Message Framing / Serialization
       ├─ JSON
       ├─ NDJSON (newline-delimited)
       ├─ Length-prefixed framing
       ├─ Protobuf
       ├─ MessagePack
       └─ CBOR

[L2] Transport (바이트/메시지 운반)
       ├─ stdio          (부모-자식 프로세스 pipe)
       ├─ Named Pipe     (Windows) / Unix Domain Socket (POSIX)
       ├─ TCP            (raw socket)
       ├─ UDP
       ├─ HTTP/1.1, /2, /3   (요청-응답 단위 운반)
       ├─ WebSocket      (HTTP upgrade 후 양방향 frame stream)
       ├─ SSE            (HTTP 위 단방향 stream — transport / pattern 양쪽으로 분류 가능)
       └─ QUIC           (HTTP/3 의 하부)

[L1] OS / Physical Channel
       ├─ File descriptor (pipe, socket)
       ├─ Shared memory
       └─ Network interface (Ethernet, Wi-Fi, loopback …)
```

### 계층별 한 줄 정의

| 계층 | 역할 | 예시 결정사항 |
|---|---|---|
| L4 Application Protocol | "무엇을 말할지" — 메시지의 의미 구조 | tools/list 같은 메서드명, 파라미터 schema |
| L3 Framing / Serialization | "메시지 경계와 표현" | JSON 으로 직렬화, 줄바꿈으로 분할 |
| L2 Transport | "어떻게 운반할지" — 연결·양방향성·신뢰성 | stdio 로 보낼지 WS 로 보낼지 |
| L1 OS / Physical | "물리적 채널" | TCP loopback, UDS, 파이프 fd |

---

## 3. 매트릭스 — Pattern × Transport 조합

| Pattern \ Transport | stdio | Pipe / UDS | TCP | HTTP | WebSocket | HTTP/2 |
|---|---|---|---|---|---|---|
| **JSON-RPC 2.0** | ✓ (MCP stdio, LSP stdio) | ✓ | ✓ | ✓ (MCP Streamable HTTP) | ✓ (LSP over WS — 관행) | ✓ |
| **gRPC** | — | ✓ (UDS gRPC) | — | — | — | ✓ (표준) |
| **REST** | — | — | — | ✓ (표준) | — | ✓ |
| **GraphQL** | — | — | — | ✓ (query/mutation) | ✓ (subscription) | ✓ |
| **SSE (streaming)** | — | — | — | ✓ (단방향) | — | ✓ |
| **MQTT (pub/sub)** | — | — | ✓ (표준) | — | ✓ (옵션) | — |

표 안의 "✓" 는 실제 운영되는 조합이 있다는 의미이며, 모든 빈 칸이 "원리적으로 불가능" 을 뜻하지는 않는다 (예: REST 를 UDS 위에 얹는 것도 기술적으로 가능하나 흔치 않음).

---

## 4. 부연 설명

### 4.1 LSP over WebSocket — 표준이 아니라 "사실상의 관행"

**LSP (Language Server Protocol)** 는 Microsoft 가 만든 에디터-언어서버 표준. VS Code / Neovim / IntelliJ 등 어떤 에디터든 동일한 방식으로 자동완성·정의 이동·진단을 받을 수 있게 해주는 JSON-RPC 2.0 기반 프로토콜이다.

LSP **표준 명세가 정의하는 transport** 는 다음과 같다:

- stdio (가장 일반적 — 에디터가 language server 를 자식 프로세스로 spawn)
- TCP socket
- pipe (Named Pipe / UDS)

**WebSocket 은 표준에 없다.** 다만 브라우저 기반 에디터(Monaco, CodeMirror) 는 자식 프로세스를 띄울 수 없어 stdio 가 불가능하므로, 원격 language server 와 통신하기 위한 사실상의 관행으로 자리 잡았다.

### 4.2 LSP-over-WS 대표 사례

| 환경 | 개요 |
|---|---|
| Eclipse Theia | 브라우저 기반 IDE, 원격 컨테이너의 language server 와 LSP-over-WS |
| GitHub Codespaces | 원격 dev container 의 language server 를 브라우저로 사용 |
| Gitpod | 동일하게 원격 워크스페이스 + 브라우저 에디터 |
| JupyterLab LSP | 노트북 환경에서 LSP 기능 제공 |
| Monaco Editor + monaco-languageclient + vscode-ws-jsonrpc | Microsoft 가 제공하는 표준 라이브러리 조합 |

### 4.3 MCP 의 transport 옵션 — 동일 패턴, 다른 운반

MCP (Model Context Protocol) 도 LSP 와 유사하게 **JSON-RPC 2.0 위에 정의된 도메인 프로토콜** 이며, 표준 명세가 두 가지 transport 를 정의한다:

- **stdio transport** — 클라이언트가 MCP 서버를 자식 프로세스로 spawn (npx 실행 등). neosql-mcp 의 클라이언트 ↔ Node 구간이 여기 해당.
- **Streamable HTTP transport** — 단일 endpoint 에 POST(요청/응답·SSE) + DELETE(세션 종료).

(과거 버전의 "HTTP+SSE" 는 deprecated 되었고 현재는 Streamable HTTP 로 통합됨.)

neosql-mcp 의 클라이언트 ↔ Node 구간은 표준 stdio transport. Node ↔ electron-main 구간은 **MCP 표준 transport 가 아닌 자체 RPC** (JSON-RPC over HTTP) 를 쓰며, 이 자체 RPC 의 운반 계층으로 **UDS / Named Pipe** 를 선택했다 (§4.4 참조).

### 4.4 Node ↔ Electron 채널 결정 — UDS / Named Pipe 채택

"Node MCP ↔ Electron Main" 채널을 두 축으로 분리해 평가했고 다음으로 확정.

- **Pattern 축**: **JSON-RPC over HTTP** (POST 요청/응답 + 필요 시 GET SSE 서버 푸시). MCP 도구 카탈로그는 Node 가 보유하고, 핸들러 안에서 자체 method 로 분기.
- **Transport 축**: **Unix Domain Socket (POSIX) / Named Pipe (Windows)**. TCP 포트 미사용.

선택 근거:
- HTTP 채택 — 6 축 (메시지 패턴 / push 빈도 / 격리 요구 / 장애 모델 / 세션 의미 / 응답 형태 다양성) 모두 HTTP 우세 (`PLAN.md` "upstream 채널을 HTTP 로 정한 근거 요약" 참조).
- UDS / Named Pipe 채택 — 포트 충돌·방화벽 회피, OS 레벨 격리 (POSIX 는 `chmod 0600`, Windows 는 ACL), Node `http`/`net` 이 동일 API 로 두 OS 모두 추상화. POC 에서 N:1 multi-connection · SSE · POST/JSON 모두 실측 통과 (`poc/`).

Pattern 과 Transport 결정을 분리해 평가한 덕에, 향후 SSE 가 부족해서 양방향 push 가 필요해지면 **transport 만** WebSocket 으로 바꿔도 (또는 그 위에 다른 message 모델을 얹어도) 도구 핸들러 코드는 영향 최소화 가능.

### 4.5 SSE 가 transport 인가 pattern 인가

엄밀히 말하면 **SSE 는 HTTP 위에서 정의된 단방향 streaming application 패턴** 이다 (`text/event-stream` MIME 타입, `data:` / `event:` 필드 framing 등).

다만 그 위에 또 다른 의미 계층(JSON-RPC notification, MCP server-initiated message 등) 이 얹히는 경우가 많아, 운영적으로는 "transport 처럼" 다루는 것이 자연스럽다. 본 문서의 매트릭스에서도 운영 관점에서 transport 칸에 두었다.

### 4.6 gRPC 가 "RPC" 인 동시에 "HTTP/2 위" 인 이유

gRPC 는 이름 그대로 RPC 패턴이지만, 표준 명세가 **transport 를 HTTP/2 로 못박은** 드문 케이스다. 이유:

- HTTP/2 의 **multiplexed stream** 이 여러 RPC 호출을 한 connection 위에 동시 처리하기에 적합
- HTTP/2 의 **bidirectional stream** 이 server streaming / client streaming / bidirectional streaming 을 자연스럽게 지원
- HTTP/2 의 **header compression (HPACK)** 으로 메타데이터 오버헤드 감소

즉 gRPC 는 "pattern + transport 가 함께 명세된" 케이스로, JSON-RPC (transport 자유) 와 대비된다.

---

## 5. 본 문서의 적용 범위

이 문서는 **개념 정리용 참고 자료** 다. 본 문서의 계층 정의를 전제로 다음 결정이 이루어졌다:

- `PLAN.md` — 클라이언트 ↔ Node 구간은 MCP 표준 stdio transport, Node ↔ electron-main 구간은 **JSON-RPC over HTTP** pattern 위에 **UDS / Named Pipe** transport 를 얹는 구조 (§4.4 요약 참조).

---

## 참고 링크

- MCP 표준 transport — https://modelcontextprotocol.io/docs/concepts/transports
- LSP 표준 transport — https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#headerPart
- gRPC over HTTP/2 — https://grpc.io/docs/what-is-grpc/core-concepts/
- JSON-RPC 2.0 — https://www.jsonrpc.org/specification
- Server-Sent Events — https://html.spec.whatwg.org/multipage/server-sent-events.html
