import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { HttpClientError } from '../../../upstream/http-client.js';
import {
  callUpstreamTool,
  jsonTextResult,
  jacksonPrettyJsonStringify,
  normalizeOptionalNullableString,
  type UpstreamToolDeps,
} from '../shared.js';
import { coordinateInputShape, validateCoordinateInput } from '../context/coordinates.js';

export type ExecuteQueryDeps = UpstreamToolDeps;

export const registerExecuteQueryTool = (server: McpServer, deps: ExecuteQueryDeps): void => {
  server.registerTool(
    'execute-query',
    {
      title: 'Execute Query',
      description:
        'Execute a SQL query on the database through NeoSQL. ' +
        'Supports SELECT, INSERT, UPDATE, DELETE, and EXPLAIN statements. ' +
        'DDL statements (CREATE, ALTER, DROP, TRUNCATE) are NOT allowed — use create-tables or modify-tables tools instead. ' +
        'SELECT and EXPLAIN return result rows (up to 200 rows). ' +
        'Provide connectionId, database, and schema together, or omit all three to use the active project Default. ' +
        'When a NeoSQL tool response indicates `autoCommit: false`, treat it as a user-configured safety policy. ' +
        'Do not arbitrarily finalize or cancel the open transaction, or attempt to bypass or change this policy.\n\n' +
        'You may execute transaction-control SQL only when the user has explicitly instructed when the transaction should be committed or rolled back.\n\n' +
        'Without such explicit instruction, you must not take any action to finalize, cancel, bypass, or change the transaction or this policy. This includes, for example:\n' +
        '- execute COMMIT, ROLLBACK, or equivalent transaction-control SQL through tools such as execute-query;\n' +
        '- directly operate the NeoSQL Desktop UI to finalize the transaction using Commit/Rollback buttons or menu actions.\n\n' +
        'On failure, the error message contains the raw underlying DB error (e.g. `ORA-00904`, `SQLSTATE 42703`) — ' +
        'use it to diagnose and propose corrections; do not retry blindly.',
      inputSchema: {
        sql: z
          .string()
          .describe('The SQL statement to execute. Must not be DDL (CREATE/ALTER/DROP/TRUNCATE).'),
        ...coordinateInputShape,
      },
    },
    async (args) => {
      validateCoordinateInput(args);
      if (isDdlStatement(args.sql)) {
        return executeQueryErrorResult(
          'DDL statements are not allowed in execute-query. Use create-tables or modify-tables.',
        );
      }
      const database = normalizeOptionalNullableString(args.database);
      return callUpstreamTool(
        deps,
        'execute-query',
        { ...args, ...(database === undefined ? {} : { database }) },
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
