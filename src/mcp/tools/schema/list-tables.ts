import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export interface ListTablesDeps {
  postRpc: <T = unknown>(method: string, params?: unknown) => Promise<T>;
}

export const registerListTablesTool = (
  _server: McpServer,
  _deps: ListTablesDeps,
): void => {
  // not implemented yet (red phase)
};
