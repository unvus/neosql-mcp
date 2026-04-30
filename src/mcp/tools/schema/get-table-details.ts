import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { callUpstreamTool, type UpstreamToolDeps } from '../shared.js';

export type GetTableDetailsDeps = UpstreamToolDeps;

export const registerGetTableDetailsTool = (server: McpServer, deps: GetTableDetailsDeps): void => {
  server.registerTool(
    'getTableDetails',
    {
      title: 'getTableDetails',
      description: 'Get table detail metadata from NeoSQL.',
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
