import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  callUpstreamTool,
  normalizeOptionalNullableString,
  type UpstreamToolDeps,
} from '../shared.js';
import { coordinateInputShape, validateCoordinateInput } from '../context/coordinates.js';
import { alterTableDefSchema } from './input-models.js';

export type ErdModifyTablesDeps = UpstreamToolDeps;

export const registerErdModifyTablesTool = (server: McpServer, deps: ErdModifyTablesDeps): void => {
  server.registerTool(
    'erd-modify-tables',
    {
      title: 'ERD Modify Tables',
      description:
        'Modify virtual table models in a NeoSQL ERD without executing SQL or changing the database. ' +
        'Alterations may rename tables, update comments and primary keys, and add, modify, or remove ' +
        'columns, indexes, foreign keys, and UNIQUE / CHECK / EXCLUSION constraints. ' +
        'For table comments, use remarksOperation.modify=true when an empty string is intentional. ' +
        'Provide connectionId, database, and schema together, or omit all three to use the active project Default.',
      inputSchema: {
        alterations: z
          .array(alterTableDefSchema)
          .describe('Virtual table alterations to apply to the ERD model.'),
        ...coordinateInputShape,
      },
    },
    async (args, request) => {
      validateCoordinateInput(args);
      const database = normalizeOptionalNullableString(args.database);
      return callUpstreamTool(
        deps,
        'erd-modify-tables',
        { ...args, ...(database === undefined ? {} : { database }) },
        { request, timeoutMs: 60_000 },
      );
    },
  );
};
