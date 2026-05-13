# UDS / Named Pipe Transport POC

This directory archives the transport proof of concept that validated the local channel
between `neosql-mcp` and NeoSQL Desktop.

The POC is not production code and is not part of the npm package. Keep it as a design
record unless the transport decision is replaced by a newer experiment.

## What It Validated

- HTTP JSON POST over a Unix Domain Socket on macOS.
- SSE over the same local HTTP server.
- Multiple concurrent clients sharing one local server without response mix-ups.
- Windows Named Pipe path generation in code. Full Windows runtime validation belongs to
  the real NeoSQL Desktop integration path.

Recorded result:

| Scenario | Result | Notes |
| --- | --- | --- |
| JSON POST round trip | PASS | macOS, Node.js local server |
| SSE stream | PASS | 5 events received |
| 3 clients x 100 requests | PASS | 300 responses, no mismatches |

## Running The Archive

Use two terminals:

```bash
node poc/server.mjs
```

```bash
node poc/client-s1.mjs
node poc/client-s2.mjs
node poc/client-s3.mjs
```

Or run the one-shot sequence:

```bash
node poc/server.mjs &
SERVER_PID=$!
sleep 0.3
node poc/client-s1.mjs && \
node poc/client-s2.mjs && \
node poc/client-s3.mjs
kill $SERVER_PID
```

## Notes

- macOS socket path: `${os.tmpdir()}/neosql-mcp-poc-${uid}.sock`
- Windows Named Pipe path: `\\.\pipe\neosql-mcp-poc`
- Linux is not a public support target because NeoSQL Desktop supports macOS and
  Windows.
- Production endpoint rules live in `docs/endpoint-resolver.md`.
