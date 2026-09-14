import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  callUpstreamTool,
  normalizeOptionalNullableString,
  type UpstreamToolDeps,
} from '../shared.js';
import { coordinateInputShape, validateCoordinateInput } from '../context/coordinates.js';

export type GetTableDetailsDeps = UpstreamToolDeps;

export const registerGetTableDetailsTool = (server: McpServer, deps: GetTableDetailsDeps): void => {
  server.registerTool(
    'get-table-details',
    {
      title: 'Get Table Details',
      description:
        'Get detailed information about one or more tables including columns, indexes, primary keys, and foreign keys. ' +
        'Pass multiple table names to retrieve details in a single call. ' +
        'Provide connectionId, database, and schema together, or omit all three to use the active project Default.',
      inputSchema: {
        tableNames: z
          .array(z.string())
          .describe(
            'List of table names to get details for (e.g. ["users", "orders", "products"])',
          ),
        ...coordinateInputShape,
      },
    },
    async (args, request) => {
      validateCoordinateInput(args);
      const database = normalizeOptionalNullableString(args.database);
      return callUpstreamTool(
        deps,
        'get-table-details',
        { ...args, ...(database === undefined ? {} : { database }) },
        { request, timeoutMs: 30_000 },
      );
    },
  );
};
