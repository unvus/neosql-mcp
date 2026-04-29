import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { jsonTextResult } from '../shared.js';

export const registerGetContextHelpTool = (server: McpServer): void => {
  server.registerTool(
    'getContextHelp',
    {
      title: 'getContextHelp',
      description: 'Describe the context fields accepted by setContext.',
      inputSchema: {},
    },
    async () =>
      jsonTextResult({
        description: 'Set projectId, connectionId, and schema before calling database tools.',
        projectId: 'NeoSQL project identifier.',
        connectionId: 'NeoSQL connection identifier.',
        schema: 'Database schema name.',
        ddlExecute: 'Whether DDL execution is enabled.',
        autoCommit: 'Whether SQL execution should auto-commit.',
      }),
  );
};
