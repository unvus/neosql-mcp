import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  callUpstreamTool,
  normalizeOptionalNullableString,
  type UpstreamToolDeps,
} from '../shared.js';
import { coordinateInputShape, validateCoordinateInput } from '../context/coordinates.js';
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
        'Provide connectionId, database, and schema together, or omit all three to use the active project Default. ' +
        'Response semantics — ERD save and DDL execution are SEPARATE phases: `summary.modifiedInErd` counts tables ' +
        'applied to the ERD model; DB application is tracked under `summary.ddl` / `ddlExecution.results[]`. ' +
        'A call is fully successful ONLY when both `summary.failed === 0` AND ' +
        '`summary.ddl.reason === "attempted" && summary.ddl.failed === 0`. ' +
        'On DDL failure, `ddlExecution.results[].error` contains the raw underlying DB error ' +
        '(e.g. `ORA-00904`, `SQLSTATE 42703`) — use it to diagnose and propose corrections; do not retry blindly.',
      inputSchema: {
        alterations: z
          .array(alterTableDefSchema)
          .describe(
            'List of table alterations. Each specifies a target table and the changes to apply.',
          ),
        ...coordinateInputShape,
      },
    },
    async (args) => {
      validateCoordinateInput(args);
      const database = normalizeOptionalNullableString(args.database);
      return callUpstreamTool(
        deps,
        'modify-tables',
        { ...args, ...(database === undefined ? {} : { database }) },
        { timeoutMs: 60_000 },
      );
    },
  );
};
