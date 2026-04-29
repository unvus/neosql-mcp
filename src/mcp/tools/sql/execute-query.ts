import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ContextStore } from '../context/store.js';

export interface ExecuteQueryDeps {
  postRpc: <T = unknown>(method: string, params?: unknown) => Promise<T>;
  contextStore: ContextStore;
}

export const registerExecuteQueryTool = (
  _server: McpServer,
  _deps: ExecuteQueryDeps,
): void => {
  // not implemented yet (red phase)
};
