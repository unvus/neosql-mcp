import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export const registerGetMcpSessionIdTool = (server: McpServer, mcpSessionId: string): void => {
  server.registerTool(
    'getMcpSessionId',
    {
      title: 'getMcpSessionId',
      description: 'Get Mcp-Session-Id',
      inputSchema: {},
    },
    async () => ({
      content: [{ type: 'text', text: mcpSessionId }],
    }),
  );
};
