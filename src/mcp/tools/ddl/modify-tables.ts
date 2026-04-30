import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { callUpstreamTool, type UpstreamToolDeps } from '../shared.js';

export type ModifyTablesDeps = UpstreamToolDeps;

export const registerModifyTablesTool = (server: McpServer, deps: ModifyTablesDeps): void => {
  server.registerTool(
    'modifyTables',
    {
      title: 'modifyTables',
      description: 'Modify tables through NeoSQL.',
      inputSchema: {
        alterations: z.array(z.record(z.unknown())),
        executeImmediately: z.boolean().optional(),
      },
    },
    async (args) => {
      const executeImmediately =
        args.executeImmediately ?? deps.contextStore.get().ddlExecute ?? false;
      return callUpstreamTool(
        deps,
        'ddl.modifyTables',
        { ...args, executeImmediately },
        { ddlExecute: executeImmediately },
        { timeoutMs: 60_000 },
      );
    },
  );
};
