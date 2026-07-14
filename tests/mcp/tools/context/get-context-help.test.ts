import { describe, it, expect, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../../../../src/mcp/server.js';

describe('get-context-help tool', () => {
  const cleanups: Array<() => Promise<void> | void> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      const fn = cleanups.pop();
      if (fn) await fn();
    }
  });

  it('explains active project Default and optional coordinate discovery', async () => {
    const server = createServer();
    const [st, ct] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    const client = new Client({ name: 'test', version: '0.0.0' });
    await client.connect(ct);
    cleanups.push(() => client.close());

    const result = await client.callTool({
      name: 'get-context-help',
      arguments: {},
    });

    expect(result.isError).not.toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0]?.text ?? '{}') as Record<string, unknown>;
    expect(data).toEqual({
      description: 'NeoSQL active project context guide',
      activeProject: {
        source: 'NeoSQL Desktop',
        description:
          'Tools always use the project currently selected and fully loaded in NeoSQL Desktop.',
      },
      defaultContext: {
        location: 'NeoSQL project MCP Access Control',
        description:
          'Omit connectionId, database, and schema together to use the active project Default.',
      },
      explicitContext: {
        fields: ['connectionId', 'database', 'schema'],
        rule: 'Provide all three fields together or omit all three.',
        description:
          'Copy one MCP-enabled tuple from list-connections. Use database: null for DBMSs without a database hierarchy.',
      },
      discovery: {
        tool: 'list-connections',
        description:
          'Use list-connections when no Default is configured or when you need a different enabled coordinate.',
      },
      clientConfig: {
        example: {
          mcpServers: {
            neosql: {
              command: 'npx',
              args: ['-y', 'neosql-mcp'],
            },
          },
        },
        description: 'The same identifier-free client configuration works for every project.',
      },
    });
  });
});
