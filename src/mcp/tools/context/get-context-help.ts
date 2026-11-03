import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { jsonTextResult } from '../shared.js';

export const registerGetContextHelpTool = (server: McpServer): void => {
  const title = 'Get Context Help';
  server.registerTool(
    'get-context-help',
    {
      title,
      annotations: {
        title,
        readOnlyHint: true,
        openWorldHint: false,
      },
      description:
        'Explain how NeoSQL resolves the target project and database coordinates. ' +
        'Use the project Default by omitting all coordinates, or use list-connections to discover ' +
        'an explicit connectionId/database/schema tuple. ' +
        'Use list-projects or create-project to choose a project when none is open.',
      inputSchema: {},
    },
    async () =>
      jsonTextResult({
        description: 'NeoSQL active project context guide',
        activeProject: {
          source: 'NeoSQL Desktop',
          description:
            'Tools use the projectId passed to the tool, else the project configured with --project-id, else the project currently open in NeoSQL Desktop. NeoSQL Desktop opens a target project when needed and runs the tool after it is fully loaded.',
        },
        projectSelection: {
          tools: ['list-projects', 'create-project'],
          description:
            'When no project is open or configured, call list-projects and pass the chosen projectId to other tools. To start a new design, call create-project (a local project with one designOnly connection as the Default) and pass the returned projectId. With --project-id, tools accept only that project.',
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
