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
        'Use listConnections to discover MCP-enabled connectionId/schema pairs. ' +
        'Set stable defaults with CLI options and pass connectionId/schema per tool call when needed.',
      inputSchema: {},
    },
    async () =>
      jsonTextResult({
        description: 'NeoSQL context configuration guide',
        projectId: {
          example: '71ef287779c14fc6b3bb86f88acdb216',
          location: '{project-root}/.neosql/project-config.json',
          description:
            'Project ID can be found in the NeoSQL UI project settings, or in the .neosql/project-config.json file',
        },
        connectionId: {
          example: '0',
          location: 'listConnections tool result',
          description:
            'Connection ID is returned as connectionId by listConnections for MCP-enabled connections',
        },
        schema: {
          example: 'public',
          description:
            "Use a schemaName returned by listConnections. Only MCP-enabled schemas can be used by tools.",
        },
        cliConfig: {
          example: {
            mcpServers: {
              neosql: {
                command: 'npx',
                args: [
                  'neosql-mcp',
                  '--project=YOUR_PROJECT_ID',
                  '--default-connection=0',
                  '--default-schema=public',
                ],
              },
            },
          },
          description:
            'You can set default context via CLI args in MCP client configuration, then override connectionId/schema per tool call when needed.',
        },
      }),
  );
};
