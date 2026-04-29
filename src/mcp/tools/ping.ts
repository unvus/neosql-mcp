import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export const registerPingTool = (server: McpServer): void => {
  server.registerTool(
    'ping',
    {
      title: 'Ping',
      description: 'Health-check tool. Returns "pong".',
      inputSchema: {},
    },
    async () => ({
      content: [{ type: 'text', text: 'pong' }],
    }),
  );
};
