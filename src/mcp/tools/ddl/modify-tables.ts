import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { callUpstreamTool, type UpstreamToolDeps } from '../shared.js';

export type ModifyTablesDeps = UpstreamToolDeps;

export const registerModifyTablesTool = (server: McpServer, deps: ModifyTablesDeps): void => {
  server.registerTool(
    'modifyTables',
    {
      title: 'modifyTables',
      description:
        'Modify one or more existing tables in the NeoSQL application. ' +
        'Each alteration can include: table rename, comment change, primary key change, ' +
        'column operations (ADD/DROP/MODIFY/RENAME), index operations (ADD/DROP), ' +
        'foreign key operations (ADD/DROP), and table-level constraint operations ' +
        '(UNIQUE / CHECK / EXCLUSION; ADD/DROP). ' +
        'Pass multiple alterations to modify several tables in a single call. ' +
        'Uses the current context (project/connection). ' +
        'Set executeImmediately=true to also execute the ALTER TABLE DDL on the actual database. ' +
        'IMPORTANT - Human-in-the-loop: When executeImmediately is false (or context ddlExecute is false), ' +
        'changes are applied to the ERD/schema design only. The user will review changes in the NeoSQL UI ' +
        'and decide whether to apply them to the database. Do NOT re-call this tool with executeImmediately=true ' +
        'to apply pending changes — this would cause a duplicate error. Database application of pending designs ' +
        'is done exclusively through the NeoSQL UI by the user.',
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
