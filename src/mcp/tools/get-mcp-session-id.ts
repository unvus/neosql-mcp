import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export const registerGetMcpSessionIdTool = (server: McpServer, mcpSessionId: string): void => {
  server.registerTool(
    'get-mcp-session-id',
    {
      title: 'Get MCP Session ID',
      description: 'Get Mcp-Session-Id',
      inputSchema: {},
    },
    async () => ({
      content: [{ type: 'text', text: mcpSessionId }],
    }),
  );
};
