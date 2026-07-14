import { describe, it, expect, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../../../../src/mcp/server.js';
import { startMockRpcServer, type MockRpcRequest } from '../../../helpers/mock-uds-server.js';
import { makeTestSocketPath, removeSocketFile } from '../../../helpers/socket.js';

describe('list-tables tool', () => {
  const cleanups: Array<() => Promise<void> | void> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      const fn = cleanups.pop();
      if (fn) await fn();
    }
  });

  const setup = async () => {
    const socketPath = makeTestSocketPath();
    const received: MockRpcRequest[] = [];
    const mock = await startMockRpcServer({
      socketPath,
      handler: (req) => {
        received.push(req);
        return { kind: 'result', result: { tables: [{ name: 'users', type: 'TABLE' }] } };
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
    return { client, received };
  };

  it('forwards a complete explicit coordinate tuple in the input envelope', async () => {
    const { client, received } = await setup();
    const args = {
      connectionId: '57',
      database: 'sales',
      schema: 'analytics',
      search: 'user',
    };

    const result = await client.callTool({ name: 'list-tables', arguments: args });

    expect(result.isError).not.toBe(true);
    expect(received).toHaveLength(1);
    expect(received[0]?.method).toBe('list-tables');
    expect(received[0]?.params).toEqual({
      sessionId: expect.any(String),
      input: args,
    });
  });

  it('forwards coordinate omission without a context envelope', async () => {
    const { client, received } = await setup();

    const result = await client.callTool({
      name: 'list-tables',
      arguments: { search: 'user' },
    });

    expect(result.isError).not.toBe(true);
    expect(received[0]?.params).toEqual({
      sessionId: expect.any(String),
      input: { search: 'user' },
    });
  });

  it('preserves database null for a DBMS without a database hierarchy', async () => {
    const { client, received } = await setup();

    const result = await client.callTool({
      name: 'list-tables',
      arguments: { connectionId: '88', database: null, schema: 'appdb' },
    });

    expect(result.isError).not.toBe(true);
    expect(received[0]?.params).toEqual({
      sessionId: expect.any(String),
      input: { connectionId: '88', database: null, schema: 'appdb' },
    });
  });
});
