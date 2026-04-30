import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { callUpstreamTool, type UpstreamToolDeps } from '../shared.js';

export type CreateTablesDeps = UpstreamToolDeps;

export const registerCreateTablesTool = (server: McpServer, deps: CreateTablesDeps): void => {
  server.registerTool(
    'createTables',
    {
      title: 'createTables',
      description: 'Create tables through NeoSQL.',
      inputSchema: {
        tableDefinitions: z.array(z.record(z.unknown())),
        executeImmediately: z.boolean().optional(),
      },
    },
    async (args) => {
      const executeImmediately =
        args.executeImmediately ?? deps.contextStore.get().ddlExecute ?? false;
      return callUpstreamTool(
        deps,
        'ddl.createTables',
        { ...args, executeImmediately },
        { ddlExecute: executeImmediately },
        { timeoutMs: 60_000 },
      );
    },
  );
};
