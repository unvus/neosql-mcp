import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerForwardTool } from '../shared.js';

export interface ListTablesDeps {
  postRpc: <T = unknown>(method: string, params?: unknown) => Promise<T>;
}

export const registerListTablesTool = (server: McpServer, deps: ListTablesDeps): void => {
  registerForwardTool(
    server,
    'listTables',
    'List tables from the active NeoSQL context.',
    deps.postRpc,
  );
};
