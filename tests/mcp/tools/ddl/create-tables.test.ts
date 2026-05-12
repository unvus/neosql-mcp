import { describe, it, expect, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../../../../src/mcp/server.js';
import { startMockRpcServer, type MockRpcRequest } from '../../../helpers/mock-uds-server.js';
import { makeTestSocketPath, removeSocketFile } from '../../../helpers/socket.js';

describe('createTables tool', () => {
  const cleanups: Array<() => Promise<void> | void> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      const fn = cleanups.pop();
      if (fn) await fn();
    }
  });

  it('calls ddl.createTables with the input envelope', async () => {
    const socketPath = makeTestSocketPath();
    const received: MockRpcRequest[] = [];
    const mock = await startMockRpcServer({
      socketPath,
      handler: (req) => {
        received.push(req);
        return {
          kind: 'result',
          result: { created: ['users'], skipped: [] },
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
    await client.callTool({
      name: 'setContext',
      arguments: { projectId: 'proj-1', connectionId: '0', schema: 'public' },
    });

    const result = await client.callTool({
      name: 'createTables',
      arguments: {
        connectionId: '57',
        schema: 'analytics',
        tableDefinitions: [
          {
            name: 'users',
            remarks: '',
            columns: [],
            primaryKeys: [],
            importedKeys: [],
            indexes: [],
            constraints: [],
          },
        ],
      },
    });

    expect(result.isError).not.toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0]?.text ?? '{}') as { created: string[] };
    expect(data.created).toEqual(['users']);
    expect(received[0]?.method).toBe('ddl.createTables');
    expect(received[0]?.params).toMatchObject({
      context: { projectId: 'proj-1', connectionId: '57', schema: 'analytics' },
      input: {
        tableDefinitions: [
          {
            name: 'users',
            remarks: '',
            columns: [],
            primaryKeys: [],
            importedKeys: [],
            indexes: [],
            constraints: [],
          },
        ],
      },
    });
  });

  it('does not forward removed executeImmediately input to upstream', async () => {
    const socketPath = makeTestSocketPath();
    const received: MockRpcRequest[] = [];
    const mock = await startMockRpcServer({
      socketPath,
      handler: (req) => {
        received.push(req);
        return { kind: 'result', result: {} };
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
      name: 'createTables',
      arguments: {
        tableDefinitions: [
          {
            name: 'users',
            remarks: '',
            columns: [],
            primaryKeys: [],
            importedKeys: [],
            indexes: [],
            constraints: [],
          },
        ],
        executeImmediately: true,
      },
    });

    expect(result.isError).not.toBe(true);
    expect(received).toHaveLength(1);
    const params = received[0]?.params as {
      context?: Record<string, unknown>;
      input?: Record<string, unknown>;
    };
    expect(params.context).not.toHaveProperty('ddlExecute');
    expect(params.input).not.toHaveProperty('executeImmediately');
  });
});
