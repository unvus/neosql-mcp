import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { callUpstreamTool, type UpstreamToolDeps } from '../shared.js';
import { alterTableDefSchema } from './input-models.js';

export type ModifyTablesDeps = UpstreamToolDeps;

export const registerModifyTablesTool = (server: McpServer, deps: ModifyTablesDeps): void => {
  server.registerTool(
    'modify-tables',
    {
      title: 'Modify Tables',
      description:
        'Modify one or more existing tables in the NeoSQL application. ' +
        'Each alteration can include: table rename, comment operation, primary key operations, ' +
        'column operations (ADD/DROP/MODIFY/RENAME), index operations (ADD/DROP), ' +
        'foreign key operations (ADD/DROP), and table-level constraint operations ' +
        '(UNIQUE / CHECK / EXCLUSION; ADD/DROP). ' +
        'For table comments, use remarksOperation.modify=true when an empty string is an intended comment change. ' +
        'For primary keys, omit primaryKeyOperations or pass [] for no change; dropping every PK column requires ' +
        'an explicit DROP operation for each current PK column. ' +
        'Pass multiple alterations to modify several tables in a single call. ' +
        'Uses the current context (project/connection).',
      inputSchema: {
        alterations: z
          .array(alterTableDefSchema)
          .describe(
            'List of table alterations. Each specifies a target table and the changes to apply.',
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
        'ddl.modify-tables',
        input,
        { connectionId, schema },
        { timeoutMs: 60_000 },
      );
    },
  );
};
