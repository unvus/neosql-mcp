import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { callUpstreamTool, type UpstreamToolDeps } from '../shared.js';
import { tableDefSchema } from './input-models.js';

export type CreateTablesDeps = UpstreamToolDeps;

export const registerCreateTablesTool = (server: McpServer, deps: CreateTablesDeps): void => {
  server.registerTool(
    'createTables',
    {
      title: 'createTables',
      description:
        'Create one or more new tables in the NeoSQL application. ' +
        'Pass multiple table definitions to create them in a single call. ' +
        'Each definition may include columns, primary keys, foreign keys, indexes, and ' +
        'table-level constraints (UNIQUE / CHECK / EXCLUSION). ' +
        'Tables that fail (e.g. duplicates) are skipped and reported; successfully created tables are added to the ERD. ' +
        'Uses the current context (project/connection). ' +
        'Set executeImmediately=true to also execute the CREATE TABLE DDL on the actual database. ' +
        'IMPORTANT - Human-in-the-loop: When executeImmediately is false (or context ddlExecute is false), ' +
        'changes are applied to the ERD/schema design only. The user will review changes in the NeoSQL UI ' +
        'and decide whether to apply them to the database. Do NOT re-call this tool with executeImmediately=true ' +
        'to apply pending changes — this would cause a duplicate error. Database application of pending designs ' +
        'is done exclusively through the NeoSQL UI by the user.',
      inputSchema: {
        tableDefinitions: z
          .array(tableDefSchema)
          .describe(
            'List of table definitions to create (e.g. [{name, remarks, columns, primaryKeys, ...}])',
          ),
        executeImmediately: z
          .boolean()
          .describe(
            'If true, execute DDL immediately on the database. Overrides context ddlExecute setting.',
          )
          .optional(),
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
