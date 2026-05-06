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
        tableNames: z.array(z.string()).min(1),
        schema: z.string().optional(),
      },
    },
    async (args) =>
      callUpstreamTool(
        deps,
        'schema.getTableDetails',
        args,
        { schema: args.schema },
        { timeoutMs: 30_000 },
      ),
  );
};
