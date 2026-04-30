import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { callUpstreamTool, type UpstreamToolDeps } from '../shared.js';

export type ListTablesDeps = UpstreamToolDeps;

export const registerListTablesTool = (server: McpServer, deps: ListTablesDeps): void => {
  server.registerTool(
    'listTables',
    {
      title: 'listTables',
      description: 'List tables from the active NeoSQL context.',
      inputSchema: {
        schema: z.string().optional(),
        search: z.string().optional(),
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
