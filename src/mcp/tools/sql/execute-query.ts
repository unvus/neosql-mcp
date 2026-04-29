import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ContextStore } from '../context/store.js';
import { registerForwardTool } from '../shared.js';

export interface ExecuteQueryDeps {
  postRpc: <T = unknown>(method: string, params?: unknown) => Promise<T>;
  contextStore: ContextStore;
}

export const registerExecuteQueryTool = (server: McpServer, deps: ExecuteQueryDeps): void => {
  registerForwardTool(server, 'executeQuery', 'Execute SQL through NeoSQL.', deps.postRpc);
};
