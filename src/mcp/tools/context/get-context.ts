import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { jsonTextResult } from '../shared.js';
import type { ContextStore } from './store.js';

export const registerGetContextTool = (server: McpServer, store: ContextStore): void => {
  server.registerTool(
    'getContext',
    {
      title: 'getContext',
      description: 'Return the current in-memory NeoSQL context.',
      inputSchema: {},
    },
    async () => jsonTextResult({ context: store.get() }),
  );
};
