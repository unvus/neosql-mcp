import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  callUpstreamTool,
  normalizeOptionalNullableString,
  type UpstreamToolDeps,
} from '../shared.js';
import { coordinateInputShape, validateCoordinateInput } from '../context/coordinates.js';

export type ListTablesDeps = UpstreamToolDeps;

export const registerListTablesTool = (server: McpServer, deps: ListTablesDeps): void => {
  server.registerTool(
    'list-tables',
    {
      title: 'List Tables',
      description:
        'List all tables and views in a database schema. Returns table names, types (TABLE/VIEW), and comments. ' +
        'Provide connectionId, database, and schema together, or omit all three to use the active project Default.',
      inputSchema: {
        search: z
          .string()
          .describe(
            'Search keyword to filter tables by name or comment (case-insensitive). If omitted, returns all tables.',
          )
          .optional(),
        ...coordinateInputShape,
      },
    },
    async (args) => {
      validateCoordinateInput(args);
      const database = normalizeOptionalNullableString(args.database);
      return callUpstreamTool(
        deps,
        'list-tables',
        { ...args, ...(database === undefined ? {} : { database }) },
        { timeoutMs: 30_000 },
      );
    },
  );
};
