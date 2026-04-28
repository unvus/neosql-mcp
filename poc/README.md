# UDS / Named Pipe transport POC

## 목적

`neosql-mcp` (Node) ↔ `electron-main` 채널을 TCP loopback HTTP 대신 **Unix Domain Socket (POSIX)** / **Named Pipe (Windows)** 로 가져갈 수 있는지 실측 검증. 검증 항목:

- **S1** UDS 위에서 HTTP/JSON POST 왕복
- **S2** UDS 위에서 SSE (`text/event-stream`) 5 이벤트 수신
- **S3** 3 개 client 가 동시에 100 회씩 round-trip — N:1 multi-connection accept + 응답 격리

> macOS/Linux 만 실측. 코드는 cross-platform (`socket-path.mjs` 가 `process.platform === 'win32'` 시 `\\\\.\\pipe\\neosql-mcp-poc` 반환). Windows Named Pipe 는 환경 확보 후 별도 검증.

## 실행 — 자동 시나리오 (S1/S2/S3)

별도 터미널 두 개:

```bash
# T1 — 서버 기동
node poc/server.mjs

# T2 — 시나리오
node poc/client-s1.mjs
node poc/client-s2.mjs
node poc/client-s3.mjs
```

또는 한 번에:

```bash
node poc/server.mjs &
SERVER_PID=$!
sleep 0.3
node poc/client-s1.mjs && \
node poc/client-s2.mjs && \
node poc/client-s3.mjs
kill $SERVER_PID
```

socket path:
- POSIX: `${os.tmpdir()}/neosql-mcp-poc-${uid}.sock`
- Windows: `\\.\pipe\neosql-mcp-poc`

## 실행 — 수동 테스트

서버를 한 번 띄워두고 (`node poc/server.mjs`), 다른 터미널에서 임의의 JSON 으로 호출/스트리밍을 검증할 수 있다.

### RPC 단발 호출 (`cli-rpc.mjs`)

JSON 을 인자 또는 stdin 으로 전달. 응답은 stdout 에 pretty-print, 진행 로그는 stderr.

```bash
# 인자로
node poc/cli-rpc.mjs '{"jsonrpc":"2.0","id":1,"method":"hello","params":{"name":"world"}}'

# stdin 파이프
echo '{"jsonrpc":"2.0","id":2,"method":"echo","params":{"x":42}}' | node poc/cli-rpc.mjs

# heredoc
node poc/cli-rpc.mjs <<'EOF'
{"jsonrpc":"2.0","id":3,"method":"complex","params":{"nested":{"a":[1,2,3]}}}
EOF
```

서버는 보낸 `params` 를 `result.echo` 로 그대로 반환 + `serverSeq` (서버가 받은 누적 호출 번호) + `pid` 를 동봉.

### SSE 스트리밍 수신 (`cli-sse.mjs`)

`/events` 에 GET 으로 붙어 서버가 보내는 이벤트를 실시간으로 콘솔 출력. 현 서버 구현은 50ms 간격으로 5 이벤트 전송 후 종료.

```bash
node poc/cli-sse.mjs
# 출력 예:
# [05:27:31.699] id=1 event=tick data={"seq":1,"ts":...}
# [05:27:31.750] id=2 event=tick data={"seq":2,"ts":...}
# ...
# [cli-sse] stream ended
```

`Ctrl+C` 로 중단 가능. 다른 path 로 시도 (404 응답 확인용):

```bash
node poc/cli-sse.mjs /unknown
```

### 동시 호출 확인 (수동 N:1)

여러 터미널에서 `cli-rpc` / `cli-sse` 를 동시에 띄워도 한 서버가 모두 응답한다는 것을 눈으로 확인할 수 있다. 각 응답의 `serverSeq` 가 단일 카운터에서 증가하는 것으로 확인.

### 서버 로그 보는 법

서버는 stderr 로 요청-응답을 connection 번호 (`#1`, `#2`, …) 로 페어링해 출력한다.

```
[05:36:44.609] #1 → POST /rpc
[05:36:44.610] #1   body  : {"jsonrpc":"2.0","id":1,"method":"hello","params":{"x":42}}
[05:36:44.610] #1   parsed: method=hello id=1 params={"x":42}
[05:36:44.611] #1 ← 200 serverSeq=1 (2ms)

[05:36:44.726] #3 → GET /events
[05:36:44.726] #3   sse stream open
[05:36:44.777] #3   sse event seq=1
…
[05:36:44.979] #3 ← stream end (5 events, 253ms)
```

- `→` 는 요청 도착, `←` 는 응답 종료.
- payload 가 200B 초과면 잘려서 `…(N B)` 표시.
- SSE 클라이언트가 중간에 끊으면 `← client closed` 로 표시.

### 트러블슈팅

| 증상 | 원인 / 확인 |
|---|---|
| `connection error: ENOENT` | 서버 미기동 또는 socket path 불일치. 서버 stderr 의 `listening on ...` 메시지와 비교 |
| `connection error: ECONNREFUSED` | socket 파일은 있으나 서버가 accept 안 함 (서버 죽은 직후 stale socket) — 서버 재기동 필요 |
| `address already in use` (서버) | 이전 서버 비정상 종료로 stale socket 잔존 — `rm` 후 재기동. 본체 production 코드에서는 listen 전 unlink 절차 필수 |

## 결과 기록

실행: 2026-04-28, macOS Darwin 25.4.0, Node v22.22.2

| 시나리오 | 결과 | 비고 |
|---|---|---|
| S1 | **PASS** | POST `/rpc` JSON 왕복 정상. status=200, echo 일치 |
| S2 | **PASS** | SSE 5 이벤트 모두 수신, seq/event 모두 일치 |
| S3 | **PASS** | 3 client × 100 round-trip = 300 회 mismatch=0, 110ms |

### 부수 관찰

- socket path 가 `/var/folders/.../T/neosql-mcp-poc-501.sock` 로 결정됨 (macOS `os.tmpdir()`). path 길이 ~70 char — sun_path 한계 (104) 안전 범위.
- listen 후 `chmod 0600` 적용 확인 (`srw-------`).
- 서버 SIGTERM 후 socket file 잔존 — **본체 기동 시 unlink 필수** (Windows Named Pipe 는 OS 자동 cleanup).

## 결론

UDS / Named Pipe transport 가 우리가 신경 쓰는 두 핵심 (N:1 multi-connection, Streamable HTTP/SSE) 을 macOS 환경에서 **실측으로 만족**. 본 결과를 근거로 PLAN.md / CHECKLIST.md / README.md / AGENTS.md / CLAUDE.md / docs/e2e-manual.md 를 UDS / Named Pipe 기반으로 일괄 수정함.
