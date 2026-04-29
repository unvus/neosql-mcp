import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export interface GetTableDetailsDeps {
  postRpc: <T = unknown>(method: string, params?: unknown) => Promise<T>;
}

export const registerGetTableDetailsTool = (
  _server: McpServer,
  _deps: GetTableDetailsDeps,
): void => {
  // not implemented yet (red phase)
};
