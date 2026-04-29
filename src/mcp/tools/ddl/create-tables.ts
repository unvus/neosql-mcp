import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ContextStore } from '../context/store.js';

export interface CreateTablesDeps {
  postRpc: <T = unknown>(method: string, params?: unknown) => Promise<T>;
  contextStore: ContextStore;
}

export const registerCreateTablesTool = (
  _server: McpServer,
  _deps: CreateTablesDeps,
): void => {
  // not implemented yet (red phase)
};
