import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  callUpstreamTool,
  normalizeOptionalNullableString,
  type UpstreamToolDeps,
} from '../shared.js';
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
        'Uses the current context (project/connection). ' +
        'Response semantics — ERD save and DDL execution are SEPARATE phases: `summary.createdInErd` counts tables ' +
        'added to the ERD model; DB application is tracked under `summary.ddl` / `ddlExecution.results[]`. ' +
        'A call is fully successful ONLY when both `summary.failed === 0` AND ' +
        '`summary.ddl.reason === "attempted" && summary.ddl.failed === 0`. ' +
        'On DDL failure, `ddlExecution.results[].tableError` / `.fkError` contain the raw underlying DB error ' +
        '(e.g. `ORA-00904`, `SQLSTATE 42703`) — use it to diagnose and propose corrections; do not retry blindly.',
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
        database: z
          .string()
          .nullable()
          .describe(
            'MCP-enabled database name from list-connections. If omitted, uses current context database.',
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
      const database = normalizeOptionalNullableString(args.database);
      const { connectionId, database: _database, schema, ...input } = args;
      return callUpstreamTool(
        deps,
        'create-tables',
        { ...input, ...(database === undefined ? {} : { database }) },
        { connectionId, database, schema },
        { timeoutMs: 60_000 },
      );
    },
  );
};
