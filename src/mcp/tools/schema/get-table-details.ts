import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { callUpstreamTool, type UpstreamToolDeps } from '../shared.js';

export type GetTableDetailsDeps = UpstreamToolDeps;

export const registerGetTableDetailsTool = (server: McpServer, deps: GetTableDetailsDeps): void => {
  server.registerTool(
    'getTableDetails',
    {
      title: 'getTableDetails',
      description:
        'Get detailed information about one or more tables including columns, indexes, primary keys, and foreign keys. ' +
        'Pass multiple table names to retrieve details in a single call. ' +
        'Uses the current context (project/connection/schema) if schema parameter is not specified.',
      inputSchema: {
        tableNames: z
          .array(z.string())
          .describe(
            'List of table names to get details for (e.g. ["users", "orders", "products"])',
          ),
        connectionId: z
          .string()
          .describe(
            'NeoSQL connection ID from listConnections. If omitted, uses current context connectionId.',
          )
          .optional(),
        schema: z
          .string()
          .describe(
            'MCP-enabled database schema name from listConnections. If omitted, uses current context schema.',
          )
          .optional(),
      },
    },
    async (args) => {
      const { connectionId: _connectionId, ...input } = args;
      return callUpstreamTool(
        deps,
        'schema.getTableDetails',
        input,
        { connectionId: args.connectionId, schema: args.schema },
        { timeoutMs: 30_000 },
      );
    },
  );
};
