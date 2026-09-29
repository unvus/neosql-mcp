# neosql-mcp

**English** | [한국어](https://github.com/unvus/neosql-mcp/blob/main/README.ko.md)

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
  NeoSQL Desktop. Database connections are configured in Desktop rather than separately for each MCP host.

## Security

Communication between neosql-mcp and NeoSQL Desktop stays on the local machine over
a Unix Domain Socket (macOS) or Named Pipe (Windows). This channel opens no TCP ports,
and its endpoint cannot be overridden by environment variables or config files.
Database access follows Desktop's MCP Access Control settings; MCP host configuration
does not require database credentials.

Schema information and query results are returned to your MCP host. The host's handling
of that data and Desktop's database connections are outside this local transport boundary.
`execute-query` can execute SQL including DDL, and `generate-code` can write files;
review the requested operations and Desktop access settings before use.

See the [NeoSQL MCP Privacy Policy](https://github.com/unvus/neosql-mcp/blob/main/PRIVACY.md)
for data processing, storage, retention, and deletion details.

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

## CLI Options

| Option                                     | Default | Purpose                                                                                                    |
| ------------------------------------------ | ------- | ---------------------------------------------------------------------------------------------------------- |
| `--project-id=<id>` or `--project-id <id>` | Not set | Open the specified project before an app-dependent tool runs and require it to match the execution target. |

To target a specific project, add its project ID to the MCP host's arguments:

```json
"args": ["-y", "neosql-mcp", "--project-id=<your-project-id>"]
```

Replace `<your-project-id>` with the target project's ID, not its display name.
Without this option, tools use the project selected in Desktop. With it, an
app-dependent tool can switch the Desktop window to the requested project before
running. Connecting the MCP host, listing tools, or calling `ping`,
`get-mcp-session-id`, or `get-context-help` does not switch projects.

Save or discard unsaved changes in Desktop if they prevent navigation. Sign-in,
project access, and other required confirmations are still handled in Desktop.
If the project changes during preparation, or no longer matches when Desktop checks
the request, the operation fails instead of silently using another project.
Use a Desktop version that supports project targeting.

## Desktop Readiness

Before an app-dependent tool runs, neosql-mcp checks the current Desktop and project
state. On macOS and Windows, if Desktop is installed but disconnected, it requests
app activation once and waits for readiness within a shared 40-second budget.
App activation, optional project navigation, and project loading share this preparation
budget. Once the project is ready, the original operation runs once in the same tool
call. If user action is required, follow the returned guidance in Desktop and call
the tool again afterward.

MCP hosts that provide a progress token receive English progress notifications.
Without a token, readiness works the same way. Host display and overall timeouts
are controlled by the host. Cancelling preparation stops further checks and
operation submission while leaving an already launched Desktop app running.
Preparation errors return `isError: true` with JSON text containing `status`,
`message`, `nextAction`, and `requestSent: false`. Operations already submitted
keep their existing result format and are never automatically resent.

## Context Resolution

NeoSQL tools always use the project currently selected and fully loaded in NeoSQL
Desktop. With `--project-id`, the Node process retains the requested project ID for
navigation and target validation. Desktop still owns the active project and its
Default database coordinate.

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
- `generate-code`

## Available Tools

| Tool                 | Purpose                                                                                                                                                                                                                                                          |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ping`               | Returns `pong` for a lightweight MCP health check.                                                                                                                                                                                                               |
| `get-mcp-session-id` | Diagnostic tool that returns the upstream session id used by this process.                                                                                                                                                                                       |
| `list-connections`   | Lists MCP-enabled NeoSQL connections and schemas for the current project.                                                                                                                                                                                        |
| `list-tables`        | Lists tables using the project Default or an explicit coordinate.                                                                                                                                                                                                |
| `get-table-details`  | Returns columns, keys, indexes, and related table metadata.                                                                                                                                                                                                      |
| `get-context-help`   | Explains active-project Default and explicit coordinate usage.                                                                                                                                                                                                   |
| `erd-create-tables`  | Adds virtual tables to an ERD without changing the database.                                                                                                                                                                                                     |
| `erd-modify-tables`  | Modifies virtual ERD table models without changing the database.                                                                                                                                                                                                 |
| `execute-query`      | Executes SQL, including DDL, using the Default or an explicit coordinate.                                                                                                                                                                                        |
| `generate-code`      | Generates and saves source files for specified tables using template packs configured in Project Settings. Requires template packs, required variables, and an output folder (Location). May overwrite existing files without an additional confirmation dialog. |

## Transport

`neosql-mcp` talks to NeoSQL Desktop through a deterministic local endpoint:

- macOS: `neosql-mcp.sock` in the per-user temp directory from `getconf DARWIN_USER_TEMP_DIR`
- Windows: `\\.\pipe\neosql-mcp`

## Troubleshooting

### Desktop installation cannot be found

If Desktop is not installed, install it first. If it is already installed but detection
fails, open it manually and call the tool again. On macOS, `neosql-mcp` currently checks the standard
`/Applications` and `~/Applications` locations first. If the app is not found there,
it falls back to the app path recorded by NeoSQL Desktop in
`~/.neosql/mcp-config.json` after the app has been launched at least once. On
Windows, it checks the per-user NSIS uninstall registry entry under HKCU.

### Desktop does not start automatically

When Desktop is disconnected and its installation is detected, neosql-mcp requests
app activation once and waits for readiness. If installation checking or activation
fails, open Desktop manually, wait for it to load, and call the tool again.

### Desktop does not respond or preparation times out

If preparation returns `readiness_timeout`, the 40-second preparation limit expired
before the operation was sent. Check Desktop for loading errors or pending prompts,
then retry once the project is ready. If the app is unresponsive, restart it.

If the operation was already sent and its response times out, it may have changed
data or files. Check the actual result before retrying; neosql-mcp does not
implicitly undo or automatically retry the operation.

### Context-sensitive tools fail

Select a project in Desktop and enable MCP access for the target connection and schema.
Either configure a Default in MCP Access Control and omit all coordinate fields, or
run `list-connections` and pass its `connectionId`, `databaseName`, and `schemaName`
together as `connectionId`, `database`, and `schema`. The explicit form does not require
a Default. Use `database: null` when there is no database hierarchy; partial coordinates
are invalid.

If the response asks for sign-in or user action, complete the indicated step in
Desktop, such as unlocking the project, resolving a missing driver, or acknowledging
a notice. For a project load failure, resolve the error shown in Desktop before retrying.

### `npx` cannot find or run the package

Check that the MCP host can access `npx` and that Node.js is 20 or later.

### The configured project cannot be opened

Check the ID passed to `--project-id` and your access to that project in Desktop.
Save or discard unsaved changes, complete any sign-in or project notices, then retry.
If the active project changed during the request, return to the intended project
before trying again.

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

Keep `README.md` and `README.ko.md` in sync in the same change when updating user-facing
behavior, options, tool lists, or configuration examples.
