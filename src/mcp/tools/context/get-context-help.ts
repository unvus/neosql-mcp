import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { jsonTextResult } from '../shared.js';

export const registerGetContextHelpTool = (server: McpServer): void => {
  server.registerTool(
    'getContextHelp',
    {
      title: 'getContextHelp',
      description:
        'Get information about how to find project and connection IDs. ' +
        'NeoSQL project and connection information is managed by the NeoSQL application (UI). ' +
        'This tool explains where to find the IDs needed for set_context.',
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
