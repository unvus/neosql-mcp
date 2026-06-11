import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  callUpstreamTool,
  normalizeOptionalNullableString,
  type UpstreamToolDeps,
} from '../shared.js';

export type GetTableDetailsDeps = UpstreamToolDeps;

export const registerGetTableDetailsTool = (server: McpServer, deps: GetTableDetailsDeps): void => {
  server.registerTool(
    'get-table-details',
    {
      title: 'Get Table Details',
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
            'NeoSQL connection ID from list-connections. If omitted, uses current context connectionId.',
          )
          .optional(),
        database: z
          .string()
          .nullable()
          .describe(
            'MCP-enabled database name from list-connections. If omitted, uses current context database.',
          )
          .optional(),
        schema: z
          .string()
          .describe(
            'MCP-enabled database schema name from list-connections. If omitted, uses current context schema.',
          )
          .optional(),
      },
    },
    async (args) => {
      const database = normalizeOptionalNullableString(args.database);
      const { connectionId: _connectionId, database: _database, ...input } = args;
      return callUpstreamTool(
        deps,
        'get-table-details',
        { ...input, ...(database === undefined ? {} : { database }) },
        { connectionId: args.connectionId, database, schema: args.schema },
        { timeoutMs: 30_000 },
      );
    },
  );
};
