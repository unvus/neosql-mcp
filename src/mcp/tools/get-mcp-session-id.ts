import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export const registerGetMcpSessionIdTool = (server: McpServer, mcpSessionId: string): void => {
  server.registerTool(
    'getMcpSessionId',
    {
      title: 'getMcpSessionId',
      description: 'Test helper tool. Returns the process-scoped MCP session id.',
      inputSchema: {},
    },
    async () => ({
      content: [{ type: 'text', text: mcpSessionId }],
    }),
  );
};
