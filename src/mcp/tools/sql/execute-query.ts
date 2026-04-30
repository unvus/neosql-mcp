import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { toolErrorResult } from '../../error-map.js';
import { callUpstreamTool, type UpstreamToolDeps } from '../shared.js';

export type ExecuteQueryDeps = UpstreamToolDeps;

export const registerExecuteQueryTool = (server: McpServer, deps: ExecuteQueryDeps): void => {
  server.registerTool(
    'executeQuery',
    {
      title: 'executeQuery',
      description: 'Execute SQL through NeoSQL.',
      inputSchema: {
        sql: z.string().min(1),
        autoCommit: z.boolean().optional(),
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
        { timeoutMs: 60_000 },
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
