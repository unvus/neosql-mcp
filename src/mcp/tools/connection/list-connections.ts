import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { callUpstreamTool, type UpstreamToolDeps } from '../shared.js';
import { projectTargetInputShape, splitProjectTarget } from '../context/project-target.js';

export type ListConnectionsDeps = UpstreamToolDeps;

export const registerListConnectionsTool = (server: McpServer, deps: ListConnectionsDeps): void => {
  const title = 'List Connections';
  server.registerTool(
    'list-connections',
    {
      title,
      annotations: {
        title,
        readOnlyHint: true,
        openWorldHint: false,
      },
      description:
        'List database connections that have MCP access enabled in the current NeoSQL project. ' +
        'Only connections (and schemas) that the user opted-in via the connection MCP tab are returned. ' +
        'Use this optional discovery tool when you need a coordinate other than the active project Default, ' +
        'or when no Default is configured. ' +
        'Copy connectionId, databaseName, and schemaName together when calling another database tool. ' +
        'Each connection entry includes id, name, description, dataSource (DBMS family), ' +
        'dbVersion (database product version, useful for dialect-version features), ' +
        'designOnly (true when only a DBMS is chosen and there is no database connection info; ' +
        'ERD design tools such as erd-create-tables work, but execute-query is rejected), ' +
        'the per-user profile (envPreset such as local/dev/staging/prod, label, protection), ' +
        'the compatibility list of MCP-enabled schemas, and database-aware schemas under databases ' +
        'when NeoSQL exposes a database hierarchy. ' +
        'Optionally pass projectId (from list-projects or create-project) to target a project; NeoSQL Desktop opens it if needed.',
      inputSchema: { ...projectTargetInputShape },
    },
    async (args, request) => {
      const { projectId } = splitProjectTarget(args);
      return callUpstreamTool(deps, 'list-connections', {}, {
        ...(projectId === undefined ? {} : { projectId }),
        request,
        timeoutMs: 30_000,
      });
    },
  );
};
