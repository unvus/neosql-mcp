# neosql-mcp

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

### Development Profile

`prod` is the default profile and does not need to be passed explicitly. Use a
non-production profile only when NeoSQL Desktop is also running with the same profile.

```json
{
  "mcpServers": {
    "neosql-dev": {
      "command": "npx",
      "args": ["-y", "neosql-mcp", "--profile=dev"]
    }
  }
}
```

Supported profiles are `prod`, `dev`, `local`, and `stage`.

## CLI Options

| Option | Description |
| --- | --- |
| `--profile=<prod|dev|local|stage>` | Selects the NeoSQL Desktop socket/pipe, install detection, and activation profile. Defaults to `prod`. |
| `--project=<value>` | Sets the default NeoSQL project id for tool calls. |
| `--default-connection=<value>` | Sets the default connection id. Values are kept as strings. |
| `--default-schema=<value>` | Sets the default schema name. |

Use the `--key=value` form in MCP host config. Space-separated forms such as
`--project value` are intentionally not supported.

## Context Resolution

NeoSQL tools resolve project, connection, and schema in this order:

1. Explicit arguments on the tool call.
2. The Node-local context store.
3. Empty context.

The context store is initialized from CLI options and can later be changed with the
process only by restarting the MCP server with different CLI options.

Tools that accept per-call `connectionId` and `schema` overrides:

- `listTables`
- `getTableDetails`
- `executeQuery`
- `createTables`
- `modifyTables`

`generateCode` currently accepts a per-call `schema` override.

## Available Tools

| Tool | Purpose |
| --- | --- |
| `ping` | Returns `pong` for a lightweight MCP health check. |
| `listConnections` | Lists MCP-enabled NeoSQL connections and schemas for the current project. |
| `getContextHelp` | Explains how to find and configure NeoSQL context values. |
| `listTables` | Lists tables for the selected connection/schema. |
| `getTableDetails` | Returns columns, keys, indexes, and related table metadata. |
| `executeQuery` | Executes non-DDL SQL using the selected context. |
| `createTables` | Requests table creation through NeoSQL Desktop. |
| `modifyTables` | Requests table modification through NeoSQL Desktop. |
| `generateCode` | Generates code from selected database tables. |
| `getMcpSessionId` | Diagnostic tool that returns the upstream session id used by this process. |

## Transport

`neosql-mcp` talks to NeoSQL Desktop through a deterministic local endpoint:

- macOS: `path.join(os.tmpdir(), 'neosql-mcp' + suffix + '.sock')`
- Windows: `\\.\pipe\neosql-mcp` + suffix

The suffix is empty for `prod` and `-dev`, `-local`, or `-stage` for non-production
profiles.

The package does not discover TCP ports, read endpoint config files, or use environment
variables to override the upstream endpoint.

## Troubleshooting

### `NeoSQL Desktop was not found`

Install NeoSQL Desktop first. On macOS, `neosql-mcp` currently checks the standard
`/Applications` and `~/Applications` locations. On Windows, it checks the per-user
NSIS uninstall registry entry under HKCU.

### `NeoSQL Desktop is not running`

Start NeoSQL Desktop, wait for it to finish loading, and run the tool again. When
possible, `neosql-mcp` requests OS-level app activation before returning this state.

### `NeoSQL Desktop did not respond`

The app may still be starting, blocked, or running with a different profile. Confirm
that the MCP config profile matches the Desktop profile.

### Context-sensitive tools fail

Run `listConnections` or `getContextHelp`, then check that `--project`,
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
neosql-mcp --profile=dev
```
