import { afterEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../../../../src/mcp/server.js';
import { startMockRpcServer, type MockRpcRequest } from '../../../helpers/mock-uds-server.js';
import { makeTestSocketPath, removeSocketFile } from '../../../helpers/socket.js';

describe('ERD table tools', () => {
  const cleanups: Array<() => Promise<void> | void> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      const cleanup = cleanups.pop();
      if (cleanup) await cleanup();
    }
  });

  it('forwards erd-create-tables without DDL execution inputs', async () => {
    const { client, received } = await setupClient();
    const result = await client.callTool({
      name: 'erd-create-tables',
      arguments: {
        connectionId: '57',
        database: 'analytics',
        schema: 'public',
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
    expect(received[0]?.method).toBe('erd-create-tables');
    expect(received[0]?.params).toMatchObject({
      sessionId: expect.any(String),
      input: {
        connectionId: '57',
        database: 'analytics',
        schema: 'public',
        tableDefinitions: [expect.objectContaining({ name: 'users' })],
      },
    });
    const params = received[0]?.params as { input?: Record<string, unknown> };
    expect(params.input).not.toHaveProperty('executeImmediately');
  });

  it('forwards index, FK, and constraint alterations through erd-modify-tables', async () => {
    const { client, received } = await setupClient();
    const result = await client.callTool({
      name: 'erd-modify-tables',
      arguments: {
        alterations: [
          {
            tableName: 'users',
            newTableName: '',
            columnOperations: [],
            indexOperations: [
              {
                action: 'ADD',
                indexName: 'idx_users_name',
                columnNames: ['name'],
                unique: false,
              },
            ],
            foreignKeyOperations: [
              {
                action: 'ADD',
                fkName: 'fk_users_team',
                fkColumnName: 'team_id',
                pkTableName: 'teams',
                pkColumnName: 'id',
                deferrable: false,
                initiallyDeferred: false,
              },
            ],
            constraintOperations: [
              {
                action: 'ADD',
                name: 'uq_users_name',
                type: 'UNIQUE',
                columns: ['name'],
                expression: '',
                exclusionClause: '',
                deferrable: false,
                initiallyDeferred: false,
              },
            ],
          },
        ],
      },
    });

    expect(result.isError).not.toBe(true);
    expect(received[0]?.method).toBe('erd-modify-tables');
    expect(received[0]?.params).toMatchObject({
      input: {
        alterations: [
          {
            indexOperations: [expect.objectContaining({ indexName: 'idx_users_name' })],
            foreignKeyOperations: [expect.objectContaining({ fkName: 'fk_users_team' })],
            constraintOperations: [expect.objectContaining({ name: 'uq_users_name' })],
          },
        ],
      },
    });
  });

  async function setupClient(): Promise<{ client: Client; received: MockRpcRequest[] }> {
    const socketPath = makeTestSocketPath();
    const received: MockRpcRequest[] = [];
    const mock = await startMockRpcServer({
      socketPath,
      runtimeStatus: {
        app: 'neosql',
        profile: 'prod',
        renderer: 'responsive',
        project: { state: 'ready', projectId: 'A' },
      },
      handler: (request) => {
        received.push(request);
        return { kind: 'result', result: { ok: true } };
      },
    });
    cleanups.push(async () => {
      await mock.close();
      removeSocketFile(socketPath);
    });

    const server = createServer({ socketPath });
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: 'test', version: '0.0.0' });
    await client.connect(clientTransport);
    cleanups.push(() => client.close());
    return { client, received };
  }
});
