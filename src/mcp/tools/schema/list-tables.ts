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
  const title = 'List Tables';
  server.registerTool(
    'list-tables',
    {
      title,
      annotations: {
        title,
        readOnlyHint: true,
        openWorldHint: false,
      },
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
    async (args, request) => {
      validateCoordinateInput(args);
      const database = normalizeOptionalNullableString(args.database);
      return callUpstreamTool(
        deps,
        'list-tables',
        { ...args, ...(database === undefined ? {} : { database }) },
        { request, timeoutMs: 30_000 },
      );
    },
  );
};
