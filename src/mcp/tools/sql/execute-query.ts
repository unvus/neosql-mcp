import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { toolErrorResult } from '../../error-map.js';
import {
  callUpstreamTool,
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
        'IMPORTANT: For DML (INSERT/UPDATE/DELETE), you MUST ask the user whether to auto-commit or use manual commit BEFORE executing. ' +
        'Do NOT default to autoCommit=true on your own. ' +
        'Manual commit (default, autoCommit omitted or false): the transaction stays open in NeoSQL SQL Editor ' +
        'so the user can review the changes and COMMIT or ROLLBACK from the NeoSQL UI. This is the safer option. ' +
        'Auto-commit (autoCommit=true): commits immediately with no chance to review. Only use when the user explicitly agrees. ' +
        'Uses the current context (project/connection/schema).',
      inputSchema: {
        sql: z
          .string()
          .describe('The SQL statement to execute. Must not be DDL (CREATE/ALTER/DROP/TRUNCATE).'),
        autoCommit: z
          .boolean()
          .describe(
            'Whether to commit DML immediately. Default is false (manual commit, safer). ' +
              'MUST ask the user before setting to true. ' +
              'When false, the user can review and COMMIT/ROLLBACK in NeoSQL UI.',
          )
          .optional(),
      },
    },
    async (args) => {
      if (isDdlStatement(args.sql)) {
        return toolErrorResult(
          new Error(
            'DDL statements are not allowed in executeQuery. Use createTables or modifyTables.',
          ),
        );
      }

      const storedContext = deps.contextStore.get();
      const autoCommit = args.autoCommit ?? storedContext.autoCommit ?? false;

      return callUpstreamTool(
        deps,
        'sql.executeQuery',
        { ...args, autoCommit },
        { autoCommit },
        { timeoutMs: 60_000, stringifyResult: jacksonPrettyJsonStringify },
      );
    },
  );
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
