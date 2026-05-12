import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { HttpClientError } from '../../../upstream/http-client.js';
import {
  callUpstreamTool,
  jsonTextResult,
  jacksonPrettyJsonStringify,
  type UpstreamToolDeps,
} from '../shared.js';

export type ExecuteQueryDeps = UpstreamToolDeps;

export const registerExecuteQueryTool = (server: McpServer, deps: ExecuteQueryDeps): void => {
  server.registerTool(
    'executeQuery',
    {
      title: 'executeQuery',
      description:
        'Execute a SQL query on the database through NeoSQL. ' +
        'Supports SELECT, INSERT, UPDATE, DELETE, and EXPLAIN statements. ' +
        'DDL statements (CREATE, ALTER, DROP, TRUNCATE) are NOT allowed — use createTables or modifyTables tools instead. ' +
        'SELECT and EXPLAIN return result rows (up to 200 rows). ' +
        'Uses the current context (project/connection/schema).',
      inputSchema: {
        sql: z
          .string()
          .describe('The SQL statement to execute. Must not be DDL (CREATE/ALTER/DROP/TRUNCATE).'),
        connectionId: z
          .string()
          .describe(
            'NeoSQL connection ID from listConnections. If omitted, uses current context connectionId.',
          )
          .optional(),
        schema: z
          .string()
          .describe(
            'MCP-enabled database schema name from listConnections. If omitted, uses current context schema.',
          )
          .optional(),
      },
    },
    async (args) => {
      if (isDdlStatement(args.sql)) {
        return executeQueryErrorResult(
          'DDL statements are not allowed in executeQuery. Use createTables or modifyTables.',
        );
      }

      const { connectionId, schema, ...input } = args;
      return callUpstreamTool(
        deps,
        'sql.executeQuery',
        input,
        { connectionId, schema },
        {
          timeoutMs: 60_000,
          stringifyResult: jacksonPrettyJsonStringify,
          mapErrorResult: mapExecuteQueryErrorResult,
        },
      );
    },
  );
};

const mapExecuteQueryErrorResult = (err: unknown) => {
  if (err instanceof HttpClientError && err.kind === 'rpc-error') {
    return executeQueryErrorResult(err.message);
  }

  return undefined;
};

const executeQueryErrorResult = (message: string) =>
  jsonTextResult(
    {
      success: false,
      message: withExecuteQueryErrorPrefix(message),
    },
    jacksonPrettyJsonStringify,
  );

const withExecuteQueryErrorPrefix = (message: string): string => {
  const prefix = 'Failed to execute query: ';
  return message.startsWith(prefix) ? message : `${prefix}${message}`;
};

const isDdlStatement = (sql: string): boolean => {
  const firstToken = stripLeadingComments(sql)
    .match(/^[A-Za-z]+/)?.[0]
    .toUpperCase();
  return (
    firstToken === 'CREATE' ||
    firstToken === 'ALTER' ||
    firstToken === 'DROP' ||
    firstToken === 'TRUNCATE'
  );
};

const stripLeadingComments = (sql: string): string => {
  let remaining = sql.trimStart();
  let changed = true;

  while (changed) {
    changed = false;
    if (remaining.startsWith('--')) {
      const newlineIndex = remaining.search(/\r?\n/);
      remaining = newlineIndex === -1 ? '' : remaining.slice(newlineIndex).trimStart();
      changed = true;
    } else if (remaining.startsWith('/*')) {
      const endIndex = remaining.indexOf('*/');
      if (endIndex === -1) return remaining;
      remaining = remaining.slice(endIndex + 2).trimStart();
      changed = true;
    }
  }

  return remaining;
};
