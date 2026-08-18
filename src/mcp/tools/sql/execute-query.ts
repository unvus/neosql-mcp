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
        'Supports SELECT, INSERT, UPDATE, DELETE, EXPLAIN, and DDL statements. ' +
        'DDL (CREATE, ALTER, DROP, TRUNCATE, ...) is subject to a NeoSQL-side approval gate: ' +
        'depending on the user policy it may run immediately, require the user to confirm a dialog in NeoSQL, ' +
        'or be rejected outright — the error message states which. ' +
        'Do not try to determine in advance whether DDL is permitted — no tool reports that. ' +
        'Issue the statement and read the outcome. ' +
        'If a DDL attempt is rejected, the message states whether it is a policy block (never retry), ' +
        'a user decline (ask the user before any further schema change), ' +
        'or an expired confirmation (retry at most once). Never retry DDL in a loop. ' +
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
          .describe('The SQL statement to execute. DDL is allowed but passes the NeoSQL approval gate.'),
        ...coordinateInputShape,
      },
    },
    async (args) => {
      validateCoordinateInput(args);
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
