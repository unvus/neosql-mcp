# MCP Client Configuration Internals

This document is an internal developer reference for `neosql-mcp` CLI option parsing,
profile routing, active-project context ownership, and the upstream input envelope.

End-user MCP host setup examples belong in `README.md`, because npm displays the README
as the package landing page.

## Stdio / npx Model

MCP hosts run `neosql-mcp` as a stdio server process. The Node process delegates NeoSQL
work to NeoSQL Desktop over the local UDS/Named Pipe upstream channel.

The public command shape is:

```bash
npx -y neosql-mcp [--profile=<prod|dev|local|stage>] [--project-id=<id>]
```

This file intentionally does not duplicate host-specific JSON/TOML snippets. Keep those
in `README.md`.

## Profiles

The default profile is `prod`. Do not add `--profile=prod` to public setup examples
unless there is a concrete reason to be explicit.

Non-production profiles are valid only when NeoSQL Desktop is listening with the same
profile.

| Profile | macOS socket suffix | Windows pipe suffix |
| --- | --- | --- |
| `prod` | none | none |
| `dev` | `-dev` | `-dev` |
| `local` | `-local` | `-local` |
| `stage` | `-stage` | `-stage` |

If multiple valid `--profile=...` values are present, the last valid value wins. Invalid
profile values are ignored and the previous valid profile is kept.

The selected profile also sets the logger threshold: `local`/`dev` use `debug`,
while `stage`/`prod` use `info`. Omitting the profile therefore uses `info`.
`LOG_LEVEL` is ignored, including when set to `debug`, `trace`, or `silent`.
The logger uses `info` before profile configuration. File destinations and the
stderr fallback use the same threshold; stdout remains reserved for MCP.

## Optional project targeting

`--project-id=<id>` and `--project-id <id>` set optional `projectId` in server configuration.
Empty, missing, or duplicate values fail startup; `--projectId` fails with the correct spelling.
Omitting the option keeps active-project behavior. Legacy `--project=` remains ignored.

Project tool preparation checks Renderer readiness, then sends at most one internal
`open-project` request when the selected ID differs. Connection, tools/list, ping,
help, and session ID discovery never navigate. Navigation and target loading share
the existing 40-second budget; status requests retain 1-second/500ms query/poll limits.
The navigation RPC uses the remaining budget and carries
`{ input: { projectId }, preparationDeadlineAt }` (epoch milliseconds).
If navigation was requested, only `navigated` followed by matching target readiness permits
the operation. An already selected target only needs its readiness check.
A lost response, failed navigation, or target departure does not retry or fall back.

The actual operation carries `context.expectedProjectId`; Desktop checks it against
screen, active project, and project store IDs. This is distinct from legacy
`context.projectId`, which Desktop overwrites with the active project.
Navigation-only failures report `requestSent: false`; a dispatched operation rejected
with `project-mismatch` reports `requestSent: true, operationStarted: false`.

User setup guides and configuration UI are deferred. The current cross-repo contract is
[project targeting](../../neosql/docs/mcp/runtime-lifecycle.html#config).

## Legacy Context CLI Compatibility

The following legacy equals-form options remain harmless inputs so existing MCP host
configurations continue to start without an error or warning:

```text
--project=<value>
--default-connection=<value>
--default-database=<value>
--default-schema=<value>
```

Their values are ignored. They do not create process-local state, affect upstream RPC
params, select a NeoSQL project, or participate in coordinate fallback. They are not
part of the public README or generated client setup.

## Active Project and Coordinate Resolution

NeoSQL Desktop owns runtime context:

- The project currently selected and fully loaded in NeoSQL Desktop is the only project
  used for tool calls.
- A project can store one enabled Default coordinate in its MCP Access Control settings.
- Omitting `connectionId`, `database`, and `schema` together asks the Renderer to use
  that Default.
- Passing an explicit coordinate requires all three fields. `database: null` represents
  DBMSs without a database hierarchy.
- Partial coordinates are rejected as `invalid-params` and Node never combines explicit
  fields with a Default.
- Invalid explicit coordinates do not fall back to the project Default.

Tools that accept the complete coordinate tuple are:

- `list-tables`
- `get-table-details`
- `erd-create-tables`
- `erd-modify-tables`
- `execute-query`

`list-connections` is an optional discovery tool for finding another MCP-enabled tuple
or for projects without a Default. `generate-code` accepts a nonempty `tableNames` array
and the same optional coordinate tuple. Configure project template packs, required global
variables, and Location first. It saves files using template install settings without an
additional NeoSQL confirmation dialog; inspect the actual result in your IDE or Git diff.

## Upstream Params

Electron main receives upstream JSON-RPC params in this shape:

```ts
interface UpstreamToolParams<TInput> {
  sessionId: string;
  input: TInput;
  context?: { expectedProjectId: string };
}
```

For database tools, `TInput` preserves whether the three coordinate fields were all
present or all absent. Node does not move coordinates to a `context` object. Electron
main still accepts the old `params.context` shape as a compatibility fallback for older
Node package versions. New requests use context only for optional expectedProjectId;
coordinates remain in input.

`sessionId` is an upstream grouping key generated by the Node process. It is not the MCP
Streamable HTTP `Mcp-Session-Id` header.
