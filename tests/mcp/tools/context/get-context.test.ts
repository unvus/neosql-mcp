import { describe, it, expect, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../../../../src/mcp/server.js';

describe('getContext tool', () => {
  const cleanups: Array<() => Promise<void> | void> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      const fn = cleanups.pop();
      if (fn) await fn();
    }
  });

  it('returns the values previously stored by setContext', async () => {
    const server = createServer();
    const [st, ct] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    const client = new Client({ name: 'test', version: '0.0.0' });
    await client.connect(ct);
    cleanups.push(() => client.close());

    await client.callTool({
      name: 'setContext',
      arguments: { projectId: 'p', connectionId: '0', schema: 's' },
    });

    const result = await client.callTool({
      name: 'getContext',
      arguments: {},
    });
    expect(result.isError).not.toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0]?.text ?? '{}') as {
      context: { projectId?: string; connectionId?: string; schema?: string };
    };
    expect(data.context.projectId).toBe('p');
    expect(data.context.connectionId).toBe('0');
    expect(data.context.schema).toBe('s');
  });
});
