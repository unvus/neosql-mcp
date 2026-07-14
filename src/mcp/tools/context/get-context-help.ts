import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { jsonTextResult } from '../shared.js';

export const registerGetContextHelpTool = (server: McpServer): void => {
  server.registerTool(
    'get-context-help',
    {
      title: 'Get Context Help',
      description:
        'Explain how NeoSQL resolves the active project and database coordinates. ' +
        'Use the project Default by omitting all coordinates, or use list-connections to discover ' +
        'an explicit connectionId/database/schema tuple.',
      inputSchema: {},
    },
    async () =>
      jsonTextResult({
        description: 'NeoSQL active project context guide',
        activeProject: {
          source: 'NeoSQL Desktop',
          description:
            'Tools always use the project currently selected and fully loaded in NeoSQL Desktop.',
        },
        defaultContext: {
          location: 'NeoSQL project MCP Access Control',
          description:
            'Omit connectionId, database, and schema together to use the active project Default.',
        },
        explicitContext: {
          fields: ['connectionId', 'database', 'schema'],
          rule: 'Provide all three fields together or omit all three.',
          description:
            'Copy one MCP-enabled tuple from list-connections. Use database: null for DBMSs without a database hierarchy.',
        },
        discovery: {
          tool: 'list-connections',
          description:
            'Use list-connections when no Default is configured or when you need a different enabled coordinate.',
        },
        clientConfig: {
          example: {
            mcpServers: {
              neosql: {
                command: 'npx',
                args: ['-y', 'neosql-mcp'],
              },
            },
          },
          description: 'The same identifier-free client configuration works for every project.',
        },
      }),
  );
};
