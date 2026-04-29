import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export interface GenerateCodeDeps {
  postRpc: <T = unknown>(method: string, params?: unknown) => Promise<T>;
}

export const registerGenerateCodeTool = (
  _server: McpServer,
  _deps: GenerateCodeDeps,
): void => {
  // not implemented yet (red phase)
};
