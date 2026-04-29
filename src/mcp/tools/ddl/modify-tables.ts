import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ContextStore } from '../context/store.js';

export interface ModifyTablesDeps {
  postRpc: <T = unknown>(method: string, params?: unknown) => Promise<T>;
  contextStore: ContextStore;
}

export const registerModifyTablesTool = (
  _server: McpServer,
  _deps: ModifyTablesDeps,
): void => {
  // not implemented yet (red phase)
};
