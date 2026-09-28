import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export const registerPingTool = (server: McpServer): void => {
  const title = 'Ping';
  server.registerTool(
    'ping',
    {
      title,
      annotations: {
        title,
        readOnlyHint: true,
        openWorldHint: false,
      },
      description: 'Health-check tool. Returns "pong".',
      inputSchema: {},
    },
    async () => ({
      content: [{ type: 'text', text: 'pong' }],
    }),
  );
};
