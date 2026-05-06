import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { callUpstreamTool, type UpstreamToolDeps } from '../shared.js';

export type ListTablesDeps = UpstreamToolDeps;

export const registerListTablesTool = (server: McpServer, deps: ListTablesDeps): void => {
  server.registerTool(
    'listTables',
    {
      title: 'listTables',
      description:
        'List all tables and views in a database schema. Returns table names, types (TABLE/VIEW), and comments. ' +
        'Uses the current context (project/connection/schema) if parameters are not specified.',
      inputSchema: {
        schema: z
          .string()
          .describe(
            "Database schema name (e.g., 'public', 'dbo'). If omitted, uses current context schema.",
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
    async (args) =>
      callUpstreamTool(
        deps,
        'schema.listTables',
        args,
        { schema: args.schema },
        { timeoutMs: 30_000 },
      ),
  );
};
