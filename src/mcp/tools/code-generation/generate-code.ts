import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerForwardTool } from '../shared.js';

export interface GenerateCodeDeps {
  postRpc: <T = unknown>(method: string, params?: unknown) => Promise<T>;
}

export const registerGenerateCodeTool = (server: McpServer, deps: GenerateCodeDeps): void => {
  registerForwardTool(
    server,
    'generateCode',
    'Generate code from NeoSQL schema metadata.',
    deps.postRpc,
  );
};
