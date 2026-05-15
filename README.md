# neosql-mcp

> Bring NeoSQL Desktop's database tools into your MCP host (Claude Code, Codex, …) via `npx`.

[![npm version](https://img.shields.io/npm/v/neosql-mcp.svg)](https://www.npmjs.com/package/neosql-mcp)
[![license](https://img.shields.io/npm/l/neosql-mcp.svg)](LICENSE)
[![node](https://img.shields.io/node/v/neosql-mcp.svg)](https://nodejs.org)

`neosql-mcp` is a local stdio MCP server that lets MCP hosts use NeoSQL Desktop
tools through `npx`.

It is not a standalone database server, database CLI, or replacement for NeoSQL
Desktop. The package runs inside the MCP host process tree, exposes NeoSQL tools over
standard MCP stdio, and delegates database/UI work to a running NeoSQL Desktop app
through JSON-RPC over HTTP on a macOS Unix Domain Socket or Windows Named Pipe.

```text
[MCP host] -- stdio MCP --> [neosql-mcp]
  -- JSON-RPC over HTTP on UDS/Named Pipe --> [NeoSQL Desktop]
```

## Why neosql-mcp?

- AI coding assistants generate better code when they can read your real schema
  and run real queries instead of guessing. `neosql-mcp` exposes the database
  your team already configured in NeoSQL Desktop to any MCP host.
- One running NeoSQL Desktop, one `npx` command — Claude Code, Codex, and any
  other MCP host share the same connections, schemas, and credentials. No
  per-host setup.

## Security

All traffic stays on the local machine over a Unix Domain Socket (macOS) or
Named Pipe (Windows). No TCP ports are opened, and the upstream endpoint cannot
be overridden by environment variables or config files. Database access scope
follows the connection settings in NeoSQL Desktop — credentials and per-connection
permissions are not duplicated here.

## Prerequisites

- Node.js 20 or later.
- NeoSQL Desktop installed on the same machine.
- An MCP host that can launch stdio servers, such as Claude Code or Codex.
- A NeoSQL project with MCP-enabled database connections and schemas.

## Quick Start

No global install is required. Configure your MCP host to run the package with `npx`.

```bash
npx -y neosql-mcp \
  --project=YOUR_PROJECT_ID \
  --default-connection=YOUR_CONNECTION_ID \
  --default-schema=YOUR_SCHEMA
```

The process is a stdio MCP server, so running the command directly in a terminal may
look like it is waiting for input. That is expected.

## MCP Host Configuration

### Claude Code `.mcp.json`

```json
{
  "mcpServers": {
    "neosql": {
      "command": "npx",
      "args": [
        "-y",
        "neosql-mcp",
        "--project=YOUR_PROJECT_ID",
        "--default-connection=YOUR_CONNECTION_ID",
        "--default-schema=YOUR_SCHEMA"
      ]
    }
  }
}
```

### Codex `config.toml`

```toml
[mcp_servers.neosql]
command = "npx"
args = [
  "-y",
  "neosql-mcp",
  "--project=YOUR_PROJECT_ID",
  "--default-connection=YOUR_CONNECTION_ID",
  "--default-schema=YOUR_SCHEMA",
]
```

## CLI Options

| Option | Description |
| --- | --- |
| `--project=<value>` | Sets the default NeoSQL project id for tool calls. |
| `--default-connection=<value>` | Sets the default connection id. |
| `--default-schema=<value>` | Sets the default schema name. |

Use the `--key=value` form in MCP host config. Space-separated forms such as
`--project value` are intentionally not supported.

## Context Resolution

NeoSQL tools resolve project, connection, and schema in this order:

1. Explicit arguments on the tool call.
2. The Node-local context store (set from CLI options at startup; restart to change).
3. Empty context.

Tools that accept per-call `connectionId` and `schema` overrides:

- `list-tables`
- `get-table-details`
- `execute-query`
- `create-tables`
- `modify-tables`

## Available Tools

| Tool | Purpose |
| --- | --- |
| `ping` | Returns `pong` for a lightweight MCP health check. |
| `list-connections` | Lists MCP-enabled NeoSQL connections and schemas for the current project. |
| `get-context-help` | Explains how to find and configure NeoSQL context values. |
| `list-tables` | Lists tables for the selected connection/schema. |
| `get-table-details` | Returns columns, keys, indexes, and related table metadata. |
| `execute-query` | Executes non-DDL SQL using the selected context. |
| `create-tables` | Requests table creation through NeoSQL Desktop. |
| `modify-tables` | Requests table modification through NeoSQL Desktop. |
| `get-mcp-session-id` | Diagnostic tool that returns the upstream session id used by this process. |

## Transport

`neosql-mcp` talks to NeoSQL Desktop through a deterministic local endpoint:

- macOS: `path.join(os.tmpdir(), 'neosql-mcp.sock')`
- Windows: `\\.\pipe\neosql-mcp`

## Troubleshooting

### `NeoSQL Desktop was not found`

Install NeoSQL Desktop first. On macOS, `neosql-mcp` currently checks the standard
`/Applications` and `~/Applications` locations first. If the app is not found there,
it falls back to the app path recorded by NeoSQL Desktop in
`~/.neosql/mcp-config.json` after the app has been launched at least once. On
Windows, it checks the per-user NSIS uninstall registry entry under HKCU.

### `NeoSQL Desktop is not running`

Start NeoSQL Desktop, wait for it to finish loading, and run the tool again. When
possible, `neosql-mcp` requests OS-level app activation before returning this state.

### `NeoSQL Desktop did not respond`

The app may still be starting or blocked. Wait a moment and retry, or restart NeoSQL
Desktop.

### Context-sensitive tools fail

Run `list-connections` or `get-context-help`, then check that `--project`,
`--default-connection`, and `--default-schema` match an MCP-enabled connection/schema.

### `npx` cannot find or run the package

Check that the MCP host can access `npx`, that Node.js is 20 or later, and that each CLI
option is a separate item in the MCP host `args` array.

## Development

```bash
npm ci
npm run build
npm test
```

For local MCP host testing, build and link the binary:

```bash
npm run build
npm link
ls -la $(which neosql-mcp)
```

When local testing is done, unlink it so direct `neosql-mcp` commands no longer use the
workspace build:

```bash
npm unlink -g neosql-mcp
```
