# NeoSQL MCP

Use the database connections configured in NeoSQL Desktop from Claude Code. Inspect
schemas, run SQL, edit virtual ERD models, and generate source files using your
project's templates. This plugin starts the version-pinned `neosql-mcp` npm package
with `npx`; NeoSQL Desktop performs the database and project operations.

## Requirements

- macOS or Windows, with Node.js 20 or later and `npx` available on Claude's PATH.
- [NeoSQL Desktop](https://neosql.unvus.com) installed on the same computer.
  Select a project and enable MCP access for the connections and schemas you want
  Claude to use. Set a default connection and schema in Desktop for requests that
  omit them.
- Claude Code. Receiving plugins from the claude.ai directory requires Claude Code
  2.1.273 or later and a claude.ai account login; API-key-only sessions do not receive
  that directory synchronization.

Claude Chat does not run this local MCP server. Cowork support has not yet been
verified. Windows and macOS host validation is required before the first directory
release.

## Use it

Select the intended project in NeoSQL Desktop before asking Claude to use a tool.
The plugin follows that project and does not provide a project ID setting. Database
credentials stay in Desktop's connection configuration; the plugin does not ask you
to enter credentials in Claude.

Example requests:

- "List the tables in my default schema and explain their relationships."
- "Inspect the orders table, then query orders created in the last week."
- "Add a status column to the customers table in my ERD model."
- "Generate code for customers using this project's configured templates."

SQL execution can modify real databases. Desktop's MCP permissions, DDL approval,
and transaction settings apply. ERD tools change virtual models; they do not apply
those changes to the database. Code generation writes files under the configured
project location and can overwrite existing files.

## Existing MCP configurations

A manual `npx -y neosql-mcp` registration and this pinned plugin may both load,
showing duplicate tools. This includes registrations created by Desktop in
`~/.claude.json`. To switch to the plugin, remove only the existing NeoSQL MCP entry,
preserving other servers and settings.

If a repository needs a fixed project ID, keep its manual MCP configuration and
disable the directory plugin for that repository. In `.claude/settings.local.json`,
merge this setting with your existing settings:

```json
{
  "enabledPlugins": {
    "neosql-mcp@synced": false
  }
}
```

Then use the manual configuration described in the
[MCP guide](https://github.com/unvus/neosql-mcp/blob/main/README.md).
An organization-required plugin may not be disabled; this plugin currently has no
way to fix a project ID in that situation.

## Local processes and data handling

`npx` downloads the pinned package from the npm registry and runs a local Node.js
process. The process communicates with Desktop over a Unix domain socket on macOS
or a named pipe on Windows. It does not start a TCP listener. If Desktop is not
running, a tool can activate it through the `neosql://mcp/activate` protocol.
Installation checks read standard macOS application locations and Desktop's
`~/.neosql/mcp-config.json` installation hint, or Windows per-user uninstall registry
entries. No database credential is required in the plugin files.

Tool results, including schema metadata, query text, query results, and generated
file paths, are returned to Claude and follow your Claude account's data controls.
Their contents can include personal or confidential data from your databases.
Desktop accesses the database servers you configured. SQL editor documents and ERD
models are saved locally for local projects; account projects can save them to the
NeoSQL service. Shared ERD documents can also synchronize through the project's
PouchDB gateway. Code generation can retrieve published template packs from the
NeoSQL service, renders project metadata and templates through Desktop's embedded
server, and writes local files. The plugin does not change these existing Desktop
behaviors.

Local operational logs may contain error details. The Node server does not routinely
log tool input or result bodies, but Desktop's RPC log records request bodies,
including SQL and other tool input. Do not treat these logs as free of sensitive
data. Default Node log locations are:

- macOS: `~/Library/Logs/NeoSqlMcp/neosql-mcp.log`
- Windows: `%APPDATA%/NeoSqlMcp/neosql-mcp.log`

The Node log is append-only, with no automatic rotation or expiry. Desktop uses
electron-log's application logs directory and `main.log`, with size-based rotation
at approximately 1 MiB into `main.old.log`; it has no time-based expiry configured.
Desktop's in-memory MCP request history lasts until cleared or the renderer exits.

NeoSQL service retention and deletion rules are described in the
[Privacy Policy](https://neosql.unvus.com/en/privacy). Project and synchronization
data are generally kept until deletion or the end of service use, subject to the
policy's backup, security, and legal exceptions. Claude's own retention is governed
by your Claude service terms and settings.

## Troubleshooting and support

If tools cannot start, check that Node.js and `npx` are on the PATH seen by Claude,
then restart Claude. If Desktop cannot be reached, open it, select the intended
project, and check its MCP connection and schema permissions.

See the [English guide](https://github.com/unvus/neosql-mcp/blob/main/README.md) or
[한국어 안내](https://github.com/unvus/neosql-mcp/blob/main/README.ko.md) for setup and
tool details. Report issues on
[GitHub](https://github.com/unvus/neosql-mcp/issues) or email
[contact@unvus.com](mailto:contact@unvus.com). Published by Unvus Co., Ltd. under the
Apache-2.0 license.
