import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export const registerGetMcpSessionIdTool = (server: McpServer, mcpSessionId: string): void => {
  const title = 'Get MCP Session ID';
  server.registerTool(
    'get-mcp-session-id',
    {
      title,
      annotations: {
        title,
        readOnlyHint: true,
        openWorldHint: false,
      },
      description: 'Get Mcp-Session-Id',
      inputSchema: {},
    },
    async () => ({
      content: [{ type: 'text', text: mcpSessionId }],
    }),
  );
};
