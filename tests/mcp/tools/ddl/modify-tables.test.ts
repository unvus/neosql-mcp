import { describe, it, expect, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../../../../src/mcp/server.js';
import { startMockRpcServer, type MockRpcRequest } from '../../../helpers/mock-uds-server.js';
import { makeTestSocketPath, removeSocketFile } from '../../../helpers/socket.js';

describe('modify-tables tool', () => {
  const cleanups: Array<() => Promise<void> | void> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      const fn = cleanups.pop();
      if (fn) await fn();
    }
  });

  it('calls ddl.modify-tables with the input envelope', async () => {
    const socketPath = makeTestSocketPath();
    const received: MockRpcRequest[] = [];
    const mock = await startMockRpcServer({
      socketPath,
      handler: (req) => {
        received.push(req);
        return { kind: 'result', result: { modified: ['users'] } };
      },
    });
    cleanups.push(async () => {
      await mock.close();
      removeSocketFile(socketPath);
    });

    const server = createServer({
      socketPath,
      initialContext: { projectId: 'proj-1', connectionId: '0', schema: 'public' },
    });
    const [st, ct] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    const client = new Client({ name: 'test', version: '0.0.0' });
    await client.connect(ct);
    cleanups.push(() => client.close());

    const result = await client.callTool({
      name: 'modify-tables',
      arguments: {
        connectionId: '57',
        schema: 'analytics',
        alterations: [
          {
            tableName: 'users',
            newTableName: '',
            remarksOperation: { modify: true, remarks: '' },
            primaryKeyOperations: [
              { action: 'ADD', columnName: 'code' },
              { action: 'DROP', columnName: 'old_id' },
            ],
            columnOperations: [
              {
                action: 'ADD',
                columnName: 'age',
                newColumnName: '',
                afterColumn: '',
                type: 'INT',
                size: 0,
                decimalDigits: 0,
                nullable: true,
                autoIncrement: false,
                defaultValue: '',
                remarks: '',
              },
            ],
            indexOperations: [],
            foreignKeyOperations: [],
            constraintOperations: [],
          },
        ],
      },
    });

    expect(result.isError).not.toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0]?.text ?? '{}') as { modified: string[] };
    expect(data.modified).toEqual(['users']);
    expect(received[0]?.method).toBe('ddl.modify-tables');
    expect(received[0]?.params).toMatchObject({
      context: { projectId: 'proj-1', connectionId: '57', schema: 'analytics' },
      input: {
        alterations: [
          {
            tableName: 'users',
            newTableName: '',
            remarksOperation: { modify: true, remarks: '' },
            primaryKeyOperations: [
              { action: 'ADD', columnName: 'code' },
              { action: 'DROP', columnName: 'old_id' },
            ],
            columnOperations: [
              {
                action: 'ADD',
                columnName: 'age',
                newColumnName: '',
                afterColumn: '',
                type: 'INT',
                size: 0,
                decimalDigits: 0,
                nullable: true,
                autoIncrement: false,
                defaultValue: '',
                remarks: '',
              },
            ],
            indexOperations: [],
            foreignKeyOperations: [],
            constraintOperations: [],
          },
        ],
      },
    });
  });

  it('allows remarksOperation and primaryKeyOperations to be omitted from table alterations', async () => {
    const socketPath = makeTestSocketPath();
    const received: MockRpcRequest[] = [];
    const mock = await startMockRpcServer({
      socketPath,
      handler: (req) => {
        received.push(req);
        return { kind: 'result', result: { modified: ['users'] } };
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
      name: 'modify-tables',
      arguments: {
        alterations: [
          {
            tableName: 'users',
            newTableName: '',
            columnOperations: [],
            indexOperations: [],
            foreignKeyOperations: [],
            constraintOperations: [],
          },
        ],
      },
    });

    expect(result.isError).not.toBe(true);
    expect(received[0]?.params).toMatchObject({
      input: {
        alterations: [
          {
            tableName: 'users',
            newTableName: '',
            columnOperations: [],
            indexOperations: [],
            foreignKeyOperations: [],
            constraintOperations: [],
          },
        ],
      },
    });
    const params = received[0]?.params as {
      input?: { alterations?: Array<Record<string, unknown>> };
    };
    expect(params.input?.alterations?.[0]).not.toHaveProperty('remarksOperation');
    expect(params.input?.alterations?.[0]).not.toHaveProperty('primaryKeyOperations');
  });

  it('rejects legacy newRemarks and newPrimaryKeys keys before calling upstream', async () => {
    const socketPath = makeTestSocketPath();
    const received: MockRpcRequest[] = [];
    const mock = await startMockRpcServer({
      socketPath,
      handler: (req) => {
        received.push(req);
        return { kind: 'result', result: { modified: ['users'] } };
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
      name: 'modify-tables',
      arguments: {
        alterations: [
          {
            tableName: 'users',
            newTableName: '',
            newRemarks: '',
            newPrimaryKeys: [],
            columnOperations: [],
            indexOperations: [],
            foreignKeyOperations: [],
            constraintOperations: [],
          },
        ],
      },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0]?.text).toMatch(/newRemarks|newPrimaryKeys/);
    expect(received).toHaveLength(0);
  });

  it('does not forward removed executeImmediately input to upstream', async () => {
    const socketPath = makeTestSocketPath();
    const received: MockRpcRequest[] = [];
    const mock = await startMockRpcServer({
      socketPath,
      handler: (req) => {
        received.push(req);
        return { kind: 'result', result: { modified: ['users'] } };
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
      name: 'modify-tables',
      arguments: {
        alterations: [
          {
            tableName: 'users',
            newTableName: '',
            columnOperations: [],
            indexOperations: [],
            foreignKeyOperations: [],
            constraintOperations: [],
          },
        ],
        executeImmediately: false,
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
