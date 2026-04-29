import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { jsonTextResult } from '../shared.js';
import type { ContextStore, NeosqlContext } from './store.js';

export const registerSetContextTool = (server: McpServer, store: ContextStore): void => {
  server.registerTool(
    'setContext',
    {
      title: 'setContext',
      description: 'Set the in-memory NeoSQL context for later tool calls.',
      inputSchema: {
        projectId: z.string().optional(),
        connectionId: z.string().optional(),
        schema: z.string().optional(),
        ddlExecute: z.boolean().optional(),
        autoCommit: z.boolean().optional(),
      },
    },
    async (args) => jsonTextResult({ context: store.set(toContextPatch(args)) }),
  );
};

const toContextPatch = (args: {
  projectId?: string | undefined;
  connectionId?: string | undefined;
  schema?: string | undefined;
  ddlExecute?: boolean | undefined;
  autoCommit?: boolean | undefined;
}): Partial<NeosqlContext> => {
  const patch: Partial<NeosqlContext> = {};
  if (args.projectId !== undefined) patch.projectId = args.projectId;
  if (args.connectionId !== undefined) patch.connectionId = args.connectionId;
  if (args.schema !== undefined) patch.schema = args.schema;
  if (args.ddlExecute !== undefined) patch.ddlExecute = args.ddlExecute;
  if (args.autoCommit !== undefined) patch.autoCommit = args.autoCommit;
  return patch;
};
