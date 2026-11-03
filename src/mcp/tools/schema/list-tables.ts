import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  callUpstreamTool,
  normalizeOptionalNullableString,
  type UpstreamToolDeps,
} from '../shared.js';
import { coordinateInputShape, validateCoordinateInput } from '../context/coordinates.js';
import { projectTargetInputShape, splitProjectTarget } from '../context/project-target.js';

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
        'Provide connectionId, database, and schema together, or omit all three to use the active project Default. ' +
        'Optionally pass projectId (from list-projects or create-project) to target a project; NeoSQL Desktop opens it if needed.',
      inputSchema: {
        search: z
          .string()
          .describe(
            'Search keyword to filter tables by name or comment (case-insensitive). If omitted, returns all tables.',
          )
          .optional(),
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
        'list-tables',
        { ...input, ...(database === undefined ? {} : { database }) },
        { ...(projectId === undefined ? {} : { projectId }), request, timeoutMs: 30_000 },
      );
    },
  );
};
