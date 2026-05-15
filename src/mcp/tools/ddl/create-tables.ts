import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { callUpstreamTool, type UpstreamToolDeps } from '../shared.js';
import { tableDefSchema } from './input-models.js';

export type CreateTablesDeps = UpstreamToolDeps;

export const registerCreateTablesTool = (server: McpServer, deps: CreateTablesDeps): void => {
  server.registerTool(
    'create-tables',
    {
      title: 'Create Tables',
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
        connectionId: z
          .string()
          .describe(
            'NeoSQL connection ID from list-connections. If omitted, uses current context connectionId.',
          )
          .optional(),
        schema: z
          .string()
          .describe(
            'MCP-enabled database schema name from list-connections. If omitted, uses current context schema.',
          )
          .optional(),
      },
    },
    async (args) => {
      const { connectionId, schema, ...input } = args;
      return callUpstreamTool(
        deps,
        'create-tables',
        input,
        { connectionId, schema },
        { timeoutMs: 60_000 },
      );
    },
  );
};
