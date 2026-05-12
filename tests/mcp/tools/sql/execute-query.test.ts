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

  it('calls sql.executeQuery with the input envelope', async () => {
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
      arguments: { projectId: 'proj-1', connectionId: '0', schema: 'public' },
    });

    const result = await client.callTool({
      name: 'executeQuery',
      arguments: { sql: 'SELECT id FROM users', connectionId: '57', schema: 'analytics' },
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
        connectionId: '57',
        schema: 'analytics',
      },
      input: { sql: 'SELECT id FROM users' },
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
      arguments: { sql: 'INSERT INTO users (id) VALUES (1)' },
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

  it('does not forward removed autoCommit input to upstream', async () => {
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
      arguments: { sql: 'SELECT id FROM users', autoCommit: false },
    });

    expect(result.isError).not.toBe(true);
    expect(received).toHaveLength(1);
    const params = received[0]?.params as {
      context?: Record<string, unknown>;
      input?: Record<string, unknown>;
    };
    expect(params.context).not.toHaveProperty('autoCommit');
    expect(params.input).not.toHaveProperty('autoCommit');
  });

  it.each([
    {
      name: 'unknown column',
      sql: 'SELECT not_exist_col FROM skrulldb.nv_auth_log_copy',
      upstreamMessage: "(conn=57) Unknown column 'not_exist_col' in 'field list'",
      expectedMessage:
        "Failed to execute query: (conn=57) Unknown column 'not_exist_col' in 'field list'",
    },
    {
      name: 'unknown table',
      sql: 'SELECT * FROM skrulldb.no_such_table',
      upstreamMessage: "(conn=57) Table 'skrulldb.no_such_table' doesn't exist",
      expectedMessage:
        "Failed to execute query: (conn=57) Table 'skrulldb.no_such_table' doesn't exist",
    },
    {
      name: 'syntax error',
      sql: 'SELEC 1',
      upstreamMessage:
        "(conn=57) You have an error in your SQL syntax; check the manual that corresponds to your MariaDB server version",
      expectedMessage:
        'Failed to execute query: (conn=57) You have an error in your SQL syntax; check the manual that corresponds to your MariaDB server version',
    },
    {
      name: 'lock wait timeout',
      sql: "INSERT INTO skrulldb.nv_auth_log_copy (al_login_id) VALUES ('system')",
      upstreamMessage: '(conn=57) Lock wait timeout exceeded; try restarting transaction',
      expectedMessage:
        'Failed to execute query: (conn=57) Lock wait timeout exceeded; try restarting transaction',
    },
  ])('returns $name JSON-RPC errors as normal success=false payloads', async (testCase) => {
    const socketPath = makeTestSocketPath();
    const mock = await startMockRpcServer({
      socketPath,
      handler: () => ({
        kind: 'rpc-error',
        code: -32000,
        message: testCase.upstreamMessage,
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
      arguments: { sql: testCase.sql },
    });

    expect(result.isError).not.toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0]?.text).toBe(`{
  "success" : false,
  "message" : ${JSON.stringify(testCase.expectedMessage)}
}`);
  });

  it('returns DDL rejections as normal success=false payloads before calling upstream', async () => {
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

    expect(result.isError).not.toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0]?.text).toBe(`{
  "success" : false,
  "message" : "Failed to execute query: DDL statements are not allowed in executeQuery. Use createTables or modifyTables."
}`);
    expect(received).toHaveLength(0);
  });
});
