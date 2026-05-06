import { describe, it, expect, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../../../../src/mcp/server.js';
import { startMockRpcServer, type MockRpcRequest } from '../../../helpers/mock-uds-server.js';
import { makeTestSocketPath, removeSocketFile } from '../../../helpers/socket.js';

describe('executeQuery tool', () => {
  const cleanups: Array<() => Promise<void> | void> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      const fn = cleanups.pop();
      if (fn) await fn();
    }
  });

  it('calls sql.executeQuery with resolved autoCommit and input envelope', async () => {
    const socketPath = makeTestSocketPath();
    const received: MockRpcRequest[] = [];
    const mock = await startMockRpcServer({
      socketPath,
      handler: (req) => {
        received.push(req);
        return {
          kind: 'result',
          result: {
            type: 'SELECT',
            sql: 'SELECT id FROM users',
            executionTimeMs: 6,
            columns: ['id', 'color'],
            columnTypes: ['BIGINT', 'VARCHAR'],
            rows: [
              [1, null],
              [2, 'blue'],
            ],
            rowCount: 2,
            truncated: false,
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
    await client.callTool({
      name: 'setContext',
      arguments: { projectId: 'proj-1', connectionId: '0', schema: 'public', autoCommit: true },
    });

    const result = await client.callTool({
      name: 'executeQuery',
      arguments: { sql: 'SELECT id FROM users', autoCommit: false },
    });

    expect(result.isError).not.toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0]?.text).toBe(`{
  "type" : "SELECT",
  "sql" : "SELECT id FROM users",
  "executionTimeMs" : 6,
  "columns" : [ "id", "color" ],
  "columnTypes" : [ "BIGINT", "VARCHAR" ],
  "rows" : [ [ 1, null ], [ 2, "blue" ] ],
  "rowCount" : 2,
  "truncated" : false
}`);
    const data = JSON.parse(content[0]?.text ?? '{}') as {
      rows: Array<Array<string | number | null>>;
    };
    expect(data.rows).toEqual([
      [1, null],
      [2, 'blue'],
    ]);
    expect(received[0]?.method).toBe('sql.executeQuery');
    expect(received[0]?.params).toMatchObject({
      context: {
        projectId: 'proj-1',
        connectionId: '0',
        schema: 'public',
        autoCommit: false,
      },
      input: { sql: 'SELECT id FROM users', autoCommit: false },
    });
  });

  it('returns DML results using the same Jackson-style pretty JSON text', async () => {
    const socketPath = makeTestSocketPath();
    const mock = await startMockRpcServer({
      socketPath,
      handler: () => ({
        kind: 'result',
        result: {
          type: 'UPDATE',
          sql: 'INSERT INTO users (id) VALUES (1)',
          executionTimeMs: 11,
          affectedRows: 1,
          autoCommit: false,
          message: '1 row affected. Transaction is open in NeoSQL UI.',
        },
      }),
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
      name: 'executeQuery',
      arguments: { sql: 'INSERT INTO users (id) VALUES (1)', autoCommit: false },
    });

    expect(result.isError).not.toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0]?.text).toBe(`{
  "type" : "UPDATE",
  "sql" : "INSERT INTO users (id) VALUES (1)",
  "executionTimeMs" : 11,
  "affectedRows" : 1,
  "autoCommit" : false,
  "message" : "1 row affected. Transaction is open in NeoSQL UI."
}`);
  });

  it('returns SQL error payloads using the same Jackson-style pretty JSON text', async () => {
    const socketPath = makeTestSocketPath();
    const mock = await startMockRpcServer({
      socketPath,
      handler: () => ({
        kind: 'result',
        result: {
          type: 'ERROR',
          sql: 'SELECT missing_column FROM users',
          executionTimeMs: 3,
          message: 'Unknown column missing_column',
        },
      }),
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
      name: 'executeQuery',
      arguments: { sql: 'SELECT missing_column FROM users' },
    });

    expect(result.isError).not.toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0]?.text).toBe(`{
  "type" : "ERROR",
  "sql" : "SELECT missing_column FROM users",
  "executionTimeMs" : 3,
  "message" : "Unknown column missing_column"
}`);
  });

  it('rejects DDL statements before calling upstream', async () => {
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
      name: 'executeQuery',
      arguments: { sql: 'CREATE TABLE users (id int)' },
    });

    expect(result.isError).toBe(true);
    expect(received).toHaveLength(0);
  });
});
