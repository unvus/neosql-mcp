import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ContextStore } from '../context/store.js';
import { registerForwardTool } from '../shared.js';

export interface CreateTablesDeps {
  postRpc: <T = unknown>(method: string, params?: unknown) => Promise<T>;
  contextStore: ContextStore;
}

export const registerCreateTablesTool = (server: McpServer, deps: CreateTablesDeps): void => {
  registerForwardTool(server, 'createTables', 'Create tables through NeoSQL.', deps.postRpc);
};
