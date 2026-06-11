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

  it('calls list-tables with resolved context and input envelope', async () => {
    const socketPath = makeTestSocketPath();
    const received: MockRpcRequest[] = [];
    const mock = await startMockRpcServer({
      socketPath,
      handler: (req) => {
        received.push(req);
        return {
          kind: 'result',
          result: { tables: [{ name: 'users', type: 'TABLE' }] },
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
      name: 'list-tables',
      arguments: { connectionId: '57', database: 'sales', schema: 'analytics', search: 'user' },
    });

    expect(result.isError).not.toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0]?.text ?? '{}') as { tables: unknown[] };
    expect(data.tables).toEqual([{ name: 'users', type: 'TABLE' }]);
    expect(received).toHaveLength(1);
    expect(received[0]?.method).toBe('list-tables');
    expect(received[0]?.params).toMatchObject({
      context: { connectionId: '57', database: 'sales', schema: 'analytics' },
      input: { database: 'sales', schema: 'analytics', search: 'user' },
    });
    expect((received[0]?.params as { sessionId?: string } | undefined)?.sessionId).toEqual(
      expect.any(String),
    );
  });

  it('uses the initial server context when tool arguments do not override it', async () => {
    const socketPath = makeTestSocketPath();
    const received: MockRpcRequest[] = [];
    const mock = await startMockRpcServer({
      socketPath,
      handler: (req) => {
        received.push(req);
        return { kind: 'result', result: [] };
      },
    });
    cleanups.push(async () => {
      await mock.close();
      removeSocketFile(socketPath);
    });

    const server = createServer({
      socketPath,
      initialContext: {
        projectId: 'project-1',
        connectionId: '88',
        database: 'sales',
        schema: 'appdb',
      },
    });
    const [st, ct] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    const client = new Client({ name: 'test', version: '0.0.0' });
    await client.connect(ct);
    cleanups.push(() => client.close());

    const result = await client.callTool({
      name: 'list-tables',
      arguments: { search: 'user' },
    });

    expect(result.isError).not.toBe(true);
    expect(received[0]?.params).toMatchObject({
      context: {
        projectId: 'project-1',
        connectionId: '88',
        database: 'sales',
        schema: 'appdb',
      },
      input: { search: 'user' },
    });
  });

  it('lets an explicit database override the initial server database', async () => {
    const socketPath = makeTestSocketPath();
    const received: MockRpcRequest[] = [];
    const mock = await startMockRpcServer({
      socketPath,
      handler: (req) => {
        received.push(req);
        return { kind: 'result', result: [] };
      },
    });
    cleanups.push(async () => {
      await mock.close();
      removeSocketFile(socketPath);
    });

    const server = createServer({
      socketPath,
      initialContext: {
        connectionId: '88',
        database: 'sales',
        schema: 'appdb',
      },
    });
    const [st, ct] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    const client = new Client({ name: 'test', version: '0.0.0' });
    await client.connect(ct);
    cleanups.push(() => client.close());

    const result = await client.callTool({
      name: 'list-tables',
      arguments: { database: 'analytics', search: 'invoice' },
    });

    expect(result.isError).not.toBe(true);
    expect(received[0]?.params).toMatchObject({
      context: {
        connectionId: '88',
        database: 'analytics',
        schema: 'appdb',
      },
      input: { database: 'analytics', search: 'invoice' },
    });
  });

  it('normalizes a blank database override to null instead of using the default database', async () => {
    const socketPath = makeTestSocketPath();
    const received: MockRpcRequest[] = [];
    const mock = await startMockRpcServer({
      socketPath,
      handler: (req) => {
        received.push(req);
        return { kind: 'result', result: [] };
      },
    });
    cleanups.push(async () => {
      await mock.close();
      removeSocketFile(socketPath);
    });

    const server = createServer({
      socketPath,
      initialContext: {
        connectionId: '88',
        database: 'sales',
        schema: 'appdb',
      },
    });
    const [st, ct] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    const client = new Client({ name: 'test', version: '0.0.0' });
    await client.connect(ct);
    cleanups.push(() => client.close());

    const result = await client.callTool({
      name: 'list-tables',
      arguments: { database: '   ', search: 'user' },
    });

    expect(result.isError).not.toBe(true);
    expect(received[0]?.params).toMatchObject({
      context: {
        connectionId: '88',
        database: null,
        schema: 'appdb',
      },
      input: { database: null, search: 'user' },
    });
  });
});
