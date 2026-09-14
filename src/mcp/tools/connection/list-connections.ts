import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { callUpstreamTool, type UpstreamToolDeps } from '../shared.js';

export type ListConnectionsDeps = UpstreamToolDeps;

export const registerListConnectionsTool = (server: McpServer, deps: ListConnectionsDeps): void => {
  server.registerTool(
    'list-connections',
    {
      title: 'List Connections',
      description:
        'List database connections that have MCP access enabled in the current NeoSQL project. ' +
        'Only connections (and schemas) that the user opted-in via the connection MCP tab are returned. ' +
        'Use this optional discovery tool when you need a coordinate other than the active project Default, ' +
        'or when no Default is configured. ' +
        'Copy connectionId, databaseName, and schemaName together when calling another database tool. ' +
        'Each connection entry includes id, name, description, dataSource (DBMS family), ' +
        'dbVersion (database product version, useful for dialect-version features), ' +
        'the per-user profile (envPreset such as local/dev/staging/prod, label, protection), ' +
        'the compatibility list of MCP-enabled schemas, and database-aware schemas under databases ' +
        'when NeoSQL exposes a database hierarchy.',
      inputSchema: {},
    },
    async (_args, request) =>
      callUpstreamTool(deps, 'list-connections', {}, { request, timeoutMs: 30_000 }),
  );
};
