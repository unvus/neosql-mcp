import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { toolErrorResult } from '../error-map.js';

export interface ToolTextResult {
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
}

export type PostRpc = <T = unknown>(method: string, params?: unknown) => Promise<T>;

export const passthroughInputSchema = z.object({}).passthrough();

export const jsonTextResult = (payload: unknown): ToolTextResult => ({
  content: [{ type: 'text', text: JSON.stringify(payload) }],
});

export const registerForwardTool = (
  server: McpServer,
  name: string,
  description: string,
  postRpc: PostRpc,
): void => {
  server.registerTool(
    name,
    {
      title: name,
      description,
      inputSchema: passthroughInputSchema,
    },
    async (args) => {
      try {
        const result = await postRpc(name, args);
        return jsonTextResult(result);
      } catch (err) {
        return toolErrorResult(err);
      }
    },
  );
};
