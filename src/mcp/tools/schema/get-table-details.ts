import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerForwardTool } from '../shared.js';

export interface GetTableDetailsDeps {
  postRpc: <T = unknown>(method: string, params?: unknown) => Promise<T>;
}

export const registerGetTableDetailsTool = (server: McpServer, deps: GetTableDetailsDeps): void => {
  registerForwardTool(
    server,
    'getTableDetails',
    'Get table detail metadata from NeoSQL.',
    deps.postRpc,
  );
};
