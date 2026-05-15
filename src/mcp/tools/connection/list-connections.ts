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
        'Use this to discover which connectionId / schema values you can pass to other tools. ' +
        'Each connection entry includes id, name, description, dataSource (DBMS family), ' +
        'dbVersion (database product version, useful for dialect-version features), ' +
        'the per-user profile (envPreset such as local/dev/staging/prod, label, protection), ' +
        'and the list of MCP-enabled schemas with their per-schema policies (ddlExecute / autoCommit).',
      inputSchema: {},
    },
    async () =>
      callUpstreamTool(deps, 'connection.list-connections', {}, {}, { timeoutMs: 30_000 }),
  );
};
