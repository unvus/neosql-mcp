import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  callUpstreamTool,
  normalizeOptionalNullableString,
  type UpstreamToolDeps,
} from '../shared.js';
import { coordinateInputShape, validateCoordinateInput } from '../context/coordinates.js';
import { projectTargetInputShape, splitProjectTarget } from '../context/project-target.js';

export type GetTableDetailsDeps = UpstreamToolDeps;

export const registerGetTableDetailsTool = (server: McpServer, deps: GetTableDetailsDeps): void => {
  const title = 'Get Table Details';
  server.registerTool(
    'get-table-details',
    {
      title,
      annotations: {
        title,
        readOnlyHint: true,
        openWorldHint: false,
      },
      description:
        'Get detailed information about one or more tables including columns, indexes, primary keys, and foreign keys. ' +
        'Pass multiple table names to retrieve details in a single call. ' +
        'Provide connectionId, database, and schema together, or omit all three to use the active project Default. ' +
        'Optionally pass projectId (from list-projects or create-project) to target a project; NeoSQL Desktop opens it if needed.',
      inputSchema: {
        tableNames: z
          .array(z.string())
          .describe(
            'List of table names to get details for (e.g. ["users", "orders", "products"])',
          ),
        ...coordinateInputShape,
        ...projectTargetInputShape,
      },
    },
    async (args, request) => {
      validateCoordinateInput(args);
      const { projectId, input } = splitProjectTarget(args);
      const database = normalizeOptionalNullableString(input.database);
      return callUpstreamTool(
        deps,
        'get-table-details',
        { ...input, ...(database === undefined ? {} : { database }) },
        { ...(projectId === undefined ? {} : { projectId }), request, timeoutMs: 30_000 },
      );
    },
  );
};
