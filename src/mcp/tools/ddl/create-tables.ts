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
        'Uses the current context (project/connection).',
      inputSchema: {
        tableDefinitions: z
          .array(tableDefSchema)
          .describe(
            'List of table definitions to create (e.g. [{name, remarks, columns, primaryKeys, ...}])',
          ),
      },
    },
    async (args) => callUpstreamTool(deps, 'ddl.createTables', args, {}, { timeoutMs: 60_000 }),
  );
};
