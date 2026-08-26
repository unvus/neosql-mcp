import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  callUpstreamTool,
  normalizeOptionalNullableString,
  type UpstreamToolDeps,
} from '../shared.js';
import { coordinateInputShape, validateCoordinateInput } from '../context/coordinates.js';
import { tableDefSchema } from './input-models.js';

export type ErdCreateTablesDeps = UpstreamToolDeps;

export const registerErdCreateTablesTool = (server: McpServer, deps: ErdCreateTablesDeps): void => {
  server.registerTool(
    'erd-create-tables',
    {
      title: 'ERD Create Tables',
      description:
        'Create one or more virtual tables in a NeoSQL ERD without executing SQL or changing the database. ' +
        'Each definition may include columns, primary keys, foreign keys, indexes, and table-level ' +
        'constraints (UNIQUE / CHECK / EXCLUSION). Tables that fail validation or conflict with an ' +
        'existing model are skipped and reported; successful tables remain pending ERD changes. ' +
        'Provide connectionId, database, and schema together, or omit all three to use the active project Default.',
      inputSchema: {
        tableDefinitions: z
          .array(tableDefSchema)
          .describe('Virtual table definitions to add to the ERD.'),
        ...coordinateInputShape,
      },
    },
    async (args) => {
      validateCoordinateInput(args);
      const database = normalizeOptionalNullableString(args.database);
      return callUpstreamTool(
        deps,
        'erd-create-tables',
        { ...args, ...(database === undefined ? {} : { database }) },
        { timeoutMs: 60_000 },
      );
    },
  );
};
