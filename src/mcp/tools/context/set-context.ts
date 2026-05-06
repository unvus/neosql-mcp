import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { jsonTextResult } from '../shared.js';
import type { ContextStore, NeosqlContextPatch } from './store.js';

export const registerSetContextTool = (server: McpServer, store: ContextStore): void => {
  server.registerTool(
    'setContext',
    {
      title: 'setContext',
      description:
        'Set the current working context (project, connection, schema) for subsequent tool calls. ' +
        'Once set, all other tools will use this context automatically until changed. ' +
        'You only need to provide the fields you want to change — unspecified fields keep their current values.',
      inputSchema: {
        projectId: z.string().optional(),
        connectionId: z.string().optional(),
        schema: z.string().optional(),
        ddlExecute: z.boolean().nullable().optional(),
        autoCommit: z.boolean().nullable().optional(),
      },
    },
    async (args) => jsonTextResult({ context: store.set(toContextPatch(args)) }),
  );
};

const toContextPatch = (args: {
  projectId?: string | undefined;
  connectionId?: string | undefined;
  schema?: string | undefined;
  ddlExecute?: boolean | null | undefined;
  autoCommit?: boolean | null | undefined;
}): NeosqlContextPatch => {
  const patch: NeosqlContextPatch = {};
  if (args.projectId !== undefined) patch.projectId = args.projectId;
  if (args.connectionId !== undefined) patch.connectionId = args.connectionId;
  if (args.schema !== undefined) patch.schema = args.schema;
  if (args.ddlExecute !== undefined && args.ddlExecute !== null) patch.ddlExecute = args.ddlExecute;
  if (args.autoCommit !== undefined && args.autoCommit !== null) patch.autoCommit = args.autoCommit;
  return patch;
};
