import { describe, it, expect, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../../../../src/mcp/server.js';
import {
  startMockRpcServer,
  type MockRpcRequest,
} from '../../../helpers/mock-uds-server.js';
import {
  makeTestSocketPath,
  removeSocketFile,
} from '../../../helpers/socket.js';

describe('getTableDetails tool', () => {
  const cleanups: Array<() => Promise<void> | void> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      const fn = cleanups.pop();
      if (fn) await fn();
    }
  });

  it('forwards multiple table names to upstream and returns the response as text', async () => {
    const socketPath = makeTestSocketPath();
    const received: MockRpcRequest[] = [];
    const mock = await startMockRpcServer({
      socketPath,
      handler: (req) => {
        received.push(req);
        return {
          kind: 'result',
          result: {
            tables: [
              { name: 'users', columns: [] },
              { name: 'orders', columns: [] },
            ],
          },
        };
      },
    });
    cleanups.push(async () => {
      await mock.close();
      removeSocketFile(socketPath);
    });

    const server = createServer({ socketPath });
    const [st, ct] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    const client = new Client({ name: 'test', version: '0.0.0' });
    await client.connect(ct);
    cleanups.push(() => client.close());

    const result = await client.callTool({
      name: 'getTableDetails',
      arguments: { tableNames: ['users', 'orders'] },
    });

    expect(result.isError).not.toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0]?.text ?? '{}') as { tables: unknown[] };
    expect(data.tables).toHaveLength(2);
    expect(received[0]?.method).toMatch(/getTableDetails/);
    const params = received[0]?.params as { tableNames?: string[] } | undefined;
    expect(params?.tableNames).toEqual(['users', 'orders']);
  });
});
