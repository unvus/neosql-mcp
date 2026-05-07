import { describe, it, expect, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../../../../src/mcp/server.js';
import { startMockRpcServer, type MockRpcRequest } from '../../../helpers/mock-uds-server.js';
import { makeTestSocketPath, removeSocketFile } from '../../../helpers/socket.js';

describe('modifyTables tool', () => {
  const cleanups: Array<() => Promise<void> | void> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      const fn = cleanups.pop();
      if (fn) await fn();
    }
  });

  it('calls ddl.modifyTables with explicit executeImmediately overriding context', async () => {
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
    await client.callTool({
      name: 'setContext',
      arguments: { projectId: 'proj-1', connectionId: '0', schema: 'public', ddlExecute: true },
    });

    const result = await client.callTool({
      name: 'modifyTables',
      arguments: {
        alterations: [
          {
            tableName: 'users',
            newTableName: '',
            newRemarks: '',
            newPrimaryKeys: [],
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
        executeImmediately: false,
      },
    });

    expect(result.isError).not.toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0]?.text ?? '{}') as { modified: string[] };
    expect(data.modified).toEqual(['users']);
    expect(received[0]?.method).toBe('ddl.modifyTables');
    expect(received[0]?.params).toMatchObject({
      context: { projectId: 'proj-1', connectionId: '0', schema: 'public', ddlExecute: false },
      input: {
        alterations: [
          {
            tableName: 'users',
            newTableName: '',
            newRemarks: '',
            newPrimaryKeys: [],
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
        executeImmediately: false,
      },
    });
  });

  it('allows newPrimaryKeys to be omitted from table alterations', async () => {
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
      name: 'modifyTables',
      arguments: {
        alterations: [
          {
            tableName: 'users',
            newTableName: '',
            newRemarks: '',
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
            newRemarks: '',
            columnOperations: [],
            indexOperations: [],
            foreignKeyOperations: [],
            constraintOperations: [],
          },
        ],
        executeImmediately: false,
      },
    });
    const params = received[0]?.params as {
      input?: { alterations?: Array<Record<string, unknown>> };
    };
    expect(params.input?.alterations?.[0]).not.toHaveProperty('newPrimaryKeys');
  });
});
