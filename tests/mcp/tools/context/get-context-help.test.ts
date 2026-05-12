import { describe, it, expect, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../../../../src/mcp/server.js';

describe('getContextHelp tool', () => {
  const cleanups: Array<() => Promise<void> | void> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      const fn = cleanups.pop();
      if (fn) await fn();
    }
  });

  it('returns a static help payload describing how to find IDs', async () => {
    const server = createServer();
    const [st, ct] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    const client = new Client({ name: 'test', version: '0.0.0' });
    await client.connect(ct);
    cleanups.push(() => client.close());

    const result = await client.callTool({
      name: 'getContextHelp',
      arguments: {},
    });

    expect(result.isError).not.toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0]?.text ?? '{}') as Record<string, unknown>;
    expect(data).toEqual({
      description: 'NeoSQL context configuration guide',
      projectId: {
        example: '71ef287779c14fc6b3bb86f88acdb216',
        location: '{project-root}/.neosql/project-config.json',
        description:
          'Project ID can be found in the NeoSQL UI project settings, or in the .neosql/project-config.json file',
      },
      connectionId: {
        example: '0',
        location: 'listConnections tool result',
        description:
          'Connection ID is returned as connectionId by listConnections for MCP-enabled connections',
      },
      schema: {
        example: 'public',
        description:
          "Use a schemaName returned by listConnections. Only MCP-enabled schemas can be used by tools.",
      },
      cliConfig: {
        example: {
          mcpServers: {
            neosql: {
              command: 'npx',
              args: [
                'neosql-mcp',
                '--project=YOUR_PROJECT_ID',
                '--default-connection=0',
                '--default-schema=public',
              ],
            },
          },
        },
        description:
          'You can set default context via CLI args in MCP client configuration, then override connectionId/schema per tool call when needed.',
      },
    });
  });
});
