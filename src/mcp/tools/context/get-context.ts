import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { jsonTextResult } from '../shared.js';
import type { ContextStore } from './store.js';

export const registerGetContextTool = (server: McpServer, store: ContextStore): void => {
  server.registerTool(
    'getContext',
    {
      title: 'getContext',
      description:
        'Get the current working context (project, connection, schema). ' +
        'Shows the active context that other tools will use for their operations.',
      inputSchema: {},
    },
    async () =>
      jsonTextResult({
        context: store.get(),
        source: 'Session context (set via setContext tool)',
      }),
  );
};
