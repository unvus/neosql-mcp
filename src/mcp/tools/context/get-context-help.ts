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
        description:
          'Use setContext to store projectId, connectionId, schema, ddlExecute, and autoCommit for later stdio MCP tool calls.',
        projectId: 'NeoSQL project identifier.',
        connectionId: 'NeoSQL connection identifier.',
        schema: 'Database schema name.',
        ddlExecute: 'Default executeImmediately value for DDL tools.',
        autoCommit: 'Default autoCommit value for SQL execution.',
      }),
  );
};
