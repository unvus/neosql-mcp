# neosql-mcp

**English** | [한국어](https://github.com/unvus/neosql-mcp/blob/main/README.ko.md)

> Bring NeoSQL Desktop's database tools into your MCP host (Claude Code, Codex, Gemini CLI, Cursor, …) via `npx`.

[![npm version](https://img.shields.io/npm/v/neosql-mcp.svg)](https://www.npmjs.com/package/neosql-mcp)
[![license](https://img.shields.io/npm/l/neosql-mcp.svg)](LICENSE)
[![node](https://img.shields.io/node/v/neosql-mcp.svg)](https://nodejs.org)

`neosql-mcp` is a local stdio MCP server that lets MCP hosts use
[NeoSQL Desktop](https://neosql.unvus.com) tools through `npx`.

It is not a standalone database server, database CLI, or replacement for NeoSQL
Desktop. The package runs inside the MCP host process tree, exposes NeoSQL tools over
standard MCP stdio, and delegates database/UI work to a running NeoSQL Desktop app
through JSON-RPC over HTTP on a macOS Unix Domain Socket or Windows Named Pipe.

```text
+-------------------+    +-------------------+    +-------------------+
|                   |    |                   |    |                   |
|  Claude Code      +--->+                   +--->+  NeoSQL Desktop   |
|                   |    |                   |    |                   |
|                   |    |                   |    +---------+---------+
|  Codex            |    |                   |              |
|                   |    |                   |              v
|                   |    |                   |    +-------------------+
|  Gemini CLI       |    |     neosql-mcp    |    |                   |
|                   |    |                   |    |  PostgreSQL       |
|                   |    |                   |    |  MySQL            |
|  Cursor           |    |                   |    |  MariaDB          |
|                   |    |                   |    |  Oracle           |
|                   |    |                   |    |  SQL Server       |
|  Other MCP hosts  |    |                   |    |  ... and more     |
|                   |    |                   |    |                   |
+-------------------+    +-------------------+    +-------------------+
     MCP hosts             stdio MCP server            Databases
```

## Why neosql-mcp?

- AI coding assistants write better code when they can read your real schema
  and run real queries, instead of guessing column names and table shapes.
  neosql-mcp exposes the database your team already configured in NeoSQL Desktop
  to any MCP host.
- One running NeoSQL Desktop, one npx command — Claude Code, Codex, Gemini CLI, Cursor,
  and any other MCP host can use the connections and schemas already configured in
  NeoSQL Desktop. Database connections are configured in Desktop rather than separately for each MCP host.

## Supported Databases

PostgreSQL, Supabase, MySQL, MariaDB, Oracle, SQL Server, SQLite, H2, and Databricks.

Database connections are made by NeoSQL Desktop, so `neosql-mcp` works with every DBMS
that Desktop supports. See the
[DBMS connection guide](https://neosql.unvus.com/en/docs/database/dbms) for
version requirements and per-DBMS connection details.

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

- macOS or Windows.
- Node.js 20 or later.
- NeoSQL Desktop installed on the same machine.
- An MCP host that can launch stdio servers, such as Claude Code, Codex, Gemini CLI, or Cursor.
- A NeoSQL project with MCP-enabled database connections and schemas.

## Quick Start

No global install is required. Configure your MCP host to run the package with `npx`.

```bash
npx -y neosql-mcp
```

The process is a stdio MCP server, so running the command directly in a terminal may
look like it is waiting for input. That is expected.

## MCP Host Configuration

neosql-mcp has been tested with Claude Code, Codex, Gemini CLI, and Cursor. Any MCP
host that can launch a stdio server can use the same command and arguments.

| Host        | Config file                                                          |
| ----------- | -------------------------------------------------------------------- |
| Claude Code | `.mcp.json` in the project, or `~/.claude.json` for the user         |
| Codex       | `.codex/config.toml` in the project, or `~/.codex/config.toml`       |
| Gemini CLI  | `.gemini/settings.json` in the project, or `~/.gemini/settings.json` |
| Cursor      | `.cursor/mcp.json` in the project, or `~/.cursor/mcp.json`           |

### Claude Code, Gemini CLI, Cursor

These hosts share the same JSON shape under `mcpServers`:

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

### Codex

```toml
[mcp_servers.neosql]
command = "npx"
args = [
  "-y",
  "neosql-mcp",
]
```

## CLI Options

| Option                                     | Default | Purpose                                                                                                        |
| ------------------------------------------ | ------- | -------------------------------------------------------------------------------------------------------------- |
| `--project-id=<id>` or `--project-id <id>` | Not set | Open the specified project before an app-dependent tool runs and fail if the active project does not match it. |

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
navigation and project validation. Desktop still owns the active project and its
Default connection target.

Database tools accept a connection target in one of two forms:

1. Omit `connectionId`, `database`, and `schema` together to use the active project's
   Default selected in NeoSQL MCP Access Control.
2. Pass all three values together to use an explicit MCP-enabled target returned by
   `list-connections`. Use `database: null` for DBMSs without a database hierarchy.

Passing only one or two of these fields is invalid. An explicit target never falls
back to the project Default when it is invalid.

Tools that accept an explicit connection target are marked in
[Available Tools](#available-tools).

## Available Tools

| Tool                 | Target | Purpose                                                                                                                                                                                                                                                          |
| -------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ping`               |        | Returns `pong` for a lightweight MCP health check.                                                                                                                                                                                                               |
| `get-mcp-session-id` |        | Diagnostic tool that returns the upstream session id used by this process.                                                                                                                                                                                       |
| `list-connections`   |        | Lists MCP-enabled NeoSQL connections and schemas for the current project.                                                                                                                                                                                        |
| `get-context-help`   |        | Explains active-project Default and explicit target usage.                                                                                                                                                                                                       |
| `list-tables`        | Yes    | Lists tables.                                                                                                                                                                                                                                                    |
| `get-table-details`  | Yes    | Returns columns, keys, indexes, and related table metadata.                                                                                                                                                                                                      |
| `erd-create-tables`  | Yes    | Adds virtual tables to an ERD without changing the database.                                                                                                                                                                                                     |
| `erd-modify-tables`  | Yes    | Modifies virtual ERD table models without changing the database.                                                                                                                                                                                                 |
| `execute-query`      | Yes    | Executes SQL, including DDL.                                                                                                                                                                                                                                     |
| `generate-code`      | Yes    | Generates and saves source files for specified tables using template packs configured in Project Settings. Requires template packs, required variables, and an output folder (Location). May overwrite existing files without an additional confirmation dialog. |

Tools marked **Target** accept the `connectionId`, `database`, and `schema` fields
described in [Context Resolution](#context-resolution).

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

Select a project in Desktop and enable MCP access for the connection and schema you intend to use.
Either configure a Default in MCP Access Control and omit all three target fields, or
run `list-connections` and pass its `connectionId`, `databaseName`, and `schemaName`
together as `connectionId`, `database`, and `schema`. The explicit form does not require
a Default. Use `database: null` when there is no database hierarchy; a partial target
is invalid.

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

## Resources

- [NeoSQL website](https://neosql.unvus.com)
- [NeoSQL MCP documentation](https://neosql.unvus.com/en/docs/mcp/intro)
- [Install NeoSQL Desktop](https://neosql.unvus.com/en/docs/install)
- [Supported DBMS and connection guide](https://neosql.unvus.com/en/docs/database/dbms)
- [NeoSQL MCP Privacy Policy](https://github.com/unvus/neosql-mcp/blob/main/PRIVACY.md)

## Development

```bash
npm ci
npm run build
npm test
```

To test a local build from an MCP host, link the binary and unlink it when you are done:

```bash
npm run build
npm link
# ... test from your MCP host ...
npm unlink -g neosql-mcp
```

See `docs/e2e-manual.md` for the full manual verification procedure.
