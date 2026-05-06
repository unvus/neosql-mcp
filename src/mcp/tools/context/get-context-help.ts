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
        description: 'NeoSQL context configuration guide',
        projectId: {
          example: '71ef287779c14fc6b3bb86f88acdb216',
          location: '{project-root}/.neosql/project-config.json',
          description:
            'Project ID can be found in the NeoSQL UI project settings, or in the .neosql/project-config.json file',
        },
        connectionId: {
          example: '0',
          location: '{project-root}/.neosql/connections/ directory',
          description:
            "Connection ID is the index of the connection in the project's connection list (starting from 0)",
        },
        schema: {
          example: 'public',
          description:
            "Database schema name. Use 'default' for single-schema databases, or the actual schema name (e.g., 'public', 'dbo')",
        },
        headerConfig: {
          example: {
            mcpServers: {
              neosql: {
                url: 'http://localhost:8098/mcp',
                headers: {
                  'x-neosql-schema': 'default',
                  'x-neosql-project': 'YOUR_PROJECT_ID',
                  'x-neosql-connection': '0',
                },
                type: 'http',
              },
            },
          },
          description: 'You can also set default context via MCP client headers in .mcp.json',
        },
      }),
  );
};
