import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  callUpstreamTool,
  normalizeOptionalNullableString,
  type UpstreamToolDeps,
} from '../shared.js';

export type ListTablesDeps = UpstreamToolDeps;

export const registerListTablesTool = (server: McpServer, deps: ListTablesDeps): void => {
  server.registerTool(
    'list-tables',
    {
      title: 'List Tables',
      description:
        'List all tables and views in a database schema. Returns table names, types (TABLE/VIEW), and comments. ' +
        'Uses the current context (project/connection/schema) if parameters are not specified.',
      inputSchema: {
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
            "MCP-enabled database schema name from list-connections (e.g., 'public', 'dbo'). If omitted, uses current context schema.",
          )
          .optional(),
        search: z
          .string()
          .describe(
            'Search keyword to filter tables by name or comment (case-insensitive). If omitted, returns all tables.',
          )
          .optional(),
      },
    },
    async (args) => {
      const database = normalizeOptionalNullableString(args.database);
      const { connectionId: _connectionId, database: _database, ...input } = args;
      return callUpstreamTool(
        deps,
        'list-tables',
        { ...input, ...(database === undefined ? {} : { database }) },
        { connectionId: args.connectionId, database, schema: args.schema },
        { timeoutMs: 30_000 },
      );
    },
  );
};
