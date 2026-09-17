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

- AI coding assistants write better code when they can read your real schema
  and run real queries, instead of guessing column names and table shapes.
  neosql-mcp exposes the database your team already configured in NeoSQL Desktop
  to any MCP host.
- One running NeoSQL Desktop, one npx command — Claude Code, Codex, and any
  other MCP host can use the connections and schemas already configured in
  NeoSQL Desktop. No per-host setup, and credentials never leave NeoSQL Desktop.

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
npx -y neosql-mcp
```

The process is a stdio MCP server, so running the command directly in a terminal may
look like it is waiting for input. That is expected.

## Generate code

Ask for source files with `generate-code`, for example `{"tableNames":["users","orders"]}`.
Use the project's Default connection/schema, or provide connectionId, database and schema
together. In NeoSQL Project Settings, configure your template packs, required variables
and output root folder (Location), and allow MCP access to the target connection/schema.

The tool generates and saves files immediately using the template installation settings;
there is no additional NeoSQL confirmation dialog. Existing files can be overwritten or
marker text replaced. Results distinguish saved paths, skips and failures. Missing settings
return `needs-configuration` without generating files. Review output in your IDE or Git diff.

NeoSQL owns the 60s execution budget; the MCP request adds 5s for the response. There is no
table-count cap or automatic generation retry. On timeout or connection loss, some files may
already have changed; inspect them before retrying. Use compatible Desktop and MCP versions
that support the code generation policy RPC.

## MCP Host Configuration

### Claude Code `.mcp.json`

```json
{
  "mcpServers": {
    "neosql": {
      "command": "npx",
      "args": ["-y", "neosql-mcp"]
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
]
```

## Desktop Readiness

Before an app-dependent tool runs, neosql-mcp checks the current Desktop and project
state. On macOS and Windows, if Desktop is installed but disconnected, it requests
app activation once and waits for readiness within a shared 20-second budget.
When the current project becomes ready, the original operation runs once in the
same tool call. Project selection, sign-in, and other required actions remain in
the Desktop app; follow the returned guidance and call the tool again afterward.

MCP hosts that provide a progress token receive English progress notifications.
Without a token, readiness works the same way. Host display and overall timeouts
are controlled by the host. Cancelling preparation stops further checks and
operation submission while leaving an already launched Desktop app running.
Preparation errors return `isError: true` with JSON text containing `status`,
`message`, `nextAction`, and `requestSent: false`. Operations already submitted
keep their existing result format and are never automatically resent.

## Context Resolution

NeoSQL tools always use the project currently selected and fully loaded in NeoSQL
Desktop. The Node process does not store a project or default database coordinate.

Database tools accept coordinates in one of two forms:

1. Omit `connectionId`, `database`, and `schema` together to use the active project's
   Default selected in NeoSQL MCP Access Control.
2. Pass all three values together to use an explicit MCP-enabled coordinate returned by
   `list-connections`. Use `database: null` for DBMSs without a database hierarchy.

Passing only one or two coordinate fields is invalid. Explicit coordinates never fall
back to the project Default when they are invalid.

Tools that accept the complete explicit coordinate tuple:

- `list-tables`
- `get-table-details`
- `erd-create-tables`
- `erd-modify-tables`
- `execute-query`

## Available Tools

| Tool                 | Purpose                                                                    |
| -------------------- | -------------------------------------------------------------------------- |
| `ping`               | Returns `pong` for a lightweight MCP health check.                         |
| `get-mcp-session-id` | Diagnostic tool that returns the upstream session id used by this process. |
| `list-connections`   | Lists MCP-enabled NeoSQL connections and schemas for the current project.  |
| `list-tables`        | Lists tables using the project Default or an explicit coordinate.          |
| `get-table-details`  | Returns columns, keys, indexes, and related table metadata.                |
| `get-context-help`   | Explains active-project Default and explicit coordinate usage.             |
| `erd-create-tables`  | Adds virtual tables to an ERD without changing the database.               |
| `erd-modify-tables`  | Modifies virtual ERD table models without changing the database.           |
| `execute-query`      | Executes SQL, including DDL, using the Default or an explicit coordinate.  |

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

Select a project in NeoSQL Desktop and configure an enabled Default in MCP Access
Control. To use another coordinate, run `list-connections` and pass its `connectionId`,
`databaseName`, and `schemaName` values together as `connectionId`, `database`, and
`schema`.

### `npx` cannot find or run the package

Check that the MCP host can access `npx` and that Node.js is 20 or later.

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
