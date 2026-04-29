import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ContextStore } from '../context/store.js';
import { registerForwardTool } from '../shared.js';

export interface ModifyTablesDeps {
  postRpc: <T = unknown>(method: string, params?: unknown) => Promise<T>;
  contextStore: ContextStore;
}

export const registerModifyTablesTool = (server: McpServer, deps: ModifyTablesDeps): void => {
  registerForwardTool(server, 'modifyTables', 'Modify tables through NeoSQL.', deps.postRpc);
};
