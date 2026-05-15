import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { UpstreamToolDeps } from '../shared.js';

export type GenerateCodeDeps = UpstreamToolDeps;

export const registerGenerateCodeTool = (server: McpServer, _deps: GenerateCodeDeps): void => {
  server.registerTool(
    'generate-code',
    {
      title: 'Generate Code',
      description: 'Generate Code is under development.',
      inputSchema: {},
    },
    async () => {
      // generate-code는 아직 개발중이므로 upstream RPC를 호출하지 않는다.
      return {
        content: [{ type: 'text', text: '개발중입니다' }],
      };
    },
  );
};
