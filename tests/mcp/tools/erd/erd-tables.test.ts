import { afterEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../../../../src/mcp/server.js';
import {
  startMockRpcServer,
  type MockRpcRequest,
  type MockRpcResponse,
} from '../../../helpers/mock-uds-server.js';
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

  it('forwards virtual relation operations with identifying, pkSchemaName, and conditions', async () => {
    const { client, received } = await setupClient();
    const virtualAdd = {
      action: 'ADD',
      fkName: '',
      fkColumnName: 'acnt_type',
      pkTableName: 'nv_category',
      pkColumnName: 'cate_code',
      deferrable: false,
      initiallyDeferred: false,
      virtual: true,
      identifying: false,
      pkSchemaName: '',
      conditions: [
        { side: 'parent', column: 'cate_ns', value: 'common' },
        { side: 'parent', column: 'cate_order', value: 1 },
      ],
    };
    const virtualDrop = {
      action: 'DROP',
      fkName: 'fk_old',
      fkColumnName: '',
      pkTableName: '',
      pkColumnName: '',
      deferrable: false,
      initiallyDeferred: false,
      virtual: true,
    };
    const result = await client.callTool({
      name: 'erd-modify-tables',
      arguments: {
        alterations: [
          {
            tableName: 'nv_account',
            newTableName: '',
            columnOperations: [],
            indexOperations: [],
            foreignKeyOperations: [virtualAdd, virtualDrop],
            constraintOperations: [],
          },
        ],
      },
    });

    expect(result.isError).not.toBe(true);
    expect(received.map((request) => request.method)).toEqual([
      'get-capabilities',
      'erd-modify-tables',
    ]);
    expect(received[1]?.params).toMatchObject({
      input: { alterations: [{ foreignKeyOperations: [virtualAdd, virtualDrop] }] },
    });
  });

  describe('virtual relations and the app capability', () => {
    const fk = {
      action: 'ADD',
      fkName: 'fk_type',
      fkColumnName: 'acnt_type',
      pkTableName: 'nv_category',
      pkColumnName: 'cate_code',
      deferrable: false,
      initiallyDeferred: false,
    };
    const modify = (foreignKeyOperations: Array<Record<string, unknown>>) => ({
      name: 'erd-modify-tables',
      arguments: {
        alterations: [
          {
            tableName: 'nv_account',
            newTableName: '',
            columnOperations: [],
            indexOperations: [],
            foreignKeyOperations,
            constraintOperations: [],
          },
        ],
      },
    });
    const payload = (result: Awaited<ReturnType<Client['callTool']>>) =>
      JSON.parse((result.content as Array<{ text: string }>)[0]!.text) as Record<string, unknown>;

    it.each([
      ['virtual ADD', { ...fk, virtual: true }],
      ['virtual DROP', { ...fk, action: 'DROP', virtual: true }],
      ['identifying virtual ADD', { ...fk, virtual: true, identifying: true }],
      [
        'conditions without virtual',
        { ...fk, conditions: [{ side: 'child', column: 'a', value: 1 }] },
      ],
      ['pkSchemaName without virtual', { ...fk, pkSchemaName: 'common' }],
    ])('refuses %s on an app without get-capabilities and sends nothing', async (_, operation) => {
      const { client, received } = await setupClient({ app: 'old' });
      const result = await client.callTool(modify([operation]));

      expect(result.isError).toBe(true);
      expect(payload(result)).toMatchObject({
        status: 'app_update_required',
        feature: 'virtualRelations',
        requestSent: false,
      });
      expect(payload(result).message).toContain('newer than 4.3.0');
      expect(received.map((request) => request.method)).toEqual(['get-capabilities']);
    });

    it('refuses the whole request, including its real foreign keys, when one operation is virtual', async () => {
      const { client, received } = await setupClient({ app: 'old' });
      const result = await client.callTool(
        modify([fk, { ...fk, fkName: 'v_type', virtual: true }]),
      );

      expect(result.isError).toBe(true);
      expect(received.map((request) => request.method)).toEqual(['get-capabilities']);
    });

    it('refuses when the app reports capabilities without virtualRelations', async () => {
      const { client, received } = await setupClient({ app: 'without-feature' });
      const result = await client.callTool(modify([{ ...fk, virtual: true }]));

      expect(result.isError).toBe(true);
      expect(payload(result)).toMatchObject({
        status: 'app_update_required',
        appVersion: '4.3.0',
        requestSent: false,
      });
      expect(received.map((request) => request.method)).toEqual(['get-capabilities']);
    });

    it.each([
      ['an HTTP 500', { kind: 'http', status: 500, body: 'boom' } as const],
      ['an invalid result', { kind: 'result', result: { features: 'virtualRelations' } } as const],
      [
        'another RPC error',
        { kind: 'rpc-error', code: -32000, message: 'x', rpcKind: 'handler-error' } as const,
      ],
    ])('sends nothing when the capability check returns %s', async (_, capabilities) => {
      const { client, received } = await setupClient({ app: capabilities });
      const result = await client.callTool(modify([{ ...fk, virtual: true }]));

      expect(result.isError).toBe(true);
      expect(payload(result)).toMatchObject({
        status: 'capability_check_failed',
        feature: 'virtualRelations',
        requestSent: false,
      });
      expect(received.map((request) => request.method)).toEqual(['get-capabilities']);
    });

    it('forwards foreign key operations to an old app exactly as before, without a capability check', async () => {
      const { client, received } = await setupClient({ app: 'old' });
      const operations = [
        fk,
        { ...fk, action: 'DROP', fkName: 'fk_old' },
        {
          ...fk,
          fkName: 'fk_flags',
          virtual: false,
          identifying: true,
          conditions: [],
          pkSchemaName: ' ',
        },
      ];
      const result = await client.callTool(modify(operations));

      expect(result.isError).not.toBe(true);
      expect(received.map((request) => request.method)).toEqual(['erd-modify-tables']);
      expect(received[0]?.params).toMatchObject({
        input: { alterations: [{ foreignKeyOperations: operations }] },
      });
    });

    it('asks the app on every call, so an app swapped between calls is checked again', async () => {
      const app: { current: AppKind } = { current: 'new' };
      const { client, received } = await setupClient({ app: () => app.current });

      expect((await client.callTool(modify([{ ...fk, virtual: true }]))).isError).not.toBe(true);
      app.current = 'old';
      const second = await client.callTool(modify([{ ...fk, virtual: true }]));

      expect(second.isError).toBe(true);
      expect(payload(second)).toMatchObject({ status: 'app_update_required' });
      expect(received.map((request) => request.method)).toEqual([
        'get-capabilities',
        'erd-modify-tables',
        'get-capabilities',
      ]);
    });
  });

  it('rejects a virtual relation condition with an unknown side before calling NeoSQL', async () => {
    const { client, received } = await setupClient();
    const result = await client.callTool({
      name: 'erd-modify-tables',
      arguments: {
        alterations: [
          {
            tableName: 'nv_account',
            newTableName: '',
            columnOperations: [],
            indexOperations: [],
            foreignKeyOperations: [
              {
                action: 'ADD',
                fkName: 'fk_type',
                fkColumnName: 'acnt_type',
                pkTableName: 'nv_category',
                pkColumnName: 'cate_code',
                deferrable: false,
                initiallyDeferred: false,
                virtual: true,
                conditions: [{ side: 'other', column: 'cate_ns', value: 'common' }],
              },
            ],
            constraintOperations: [],
          },
        ],
      },
    });

    expect(result.isError).toBe(true);
    expect(received).toHaveLength(0);
  });

  it('keeps importedKeys of erd-create-tables to real foreign keys', async () => {
    const { client, received } = await setupClient();
    const result = await client.callTool({
      name: 'erd-create-tables',
      arguments: {
        tableDefinitions: [
          {
            name: 'orders',
            remarks: '',
            columns: [],
            primaryKeys: [],
            importedKeys: [
              {
                fkName: 'fk_orders_users',
                fkColumnName: 'user_id',
                pkTableName: 'users',
                pkColumnName: 'id',
                deferrable: false,
                initiallyDeferred: false,
                virtual: true,
              },
            ],
            indexes: [],
            constraints: [],
          },
        ],
      },
    });

    expect(result.isError).toBe(true);
    expect(received).toHaveLength(0);
  });

  async function setupClient(
    opts: { app?: AppKind | (() => AppKind) } = {},
  ): Promise<{ client: Client; received: MockRpcRequest[] }> {
    const socketPath = makeTestSocketPath();
    const received: MockRpcRequest[] = [];
    const app = opts.app ?? 'new';
    const appKind = typeof app === 'function' ? app : () => app;
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
        if (request.method === 'get-capabilities') return capabilitiesResponse(appKind());
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

/** new: reports virtualRelations. old: before get-capabilities. Or a raw capability response. */
type AppKind = 'new' | 'old' | 'without-feature' | MockRpcResponse;

const capabilitiesResponse = (app: AppKind): MockRpcResponse => {
  switch (app) {
    case 'new':
      return { kind: 'result', result: { appVersion: '4.4.0', features: ['virtualRelations'] } };
    case 'without-feature':
      return { kind: 'result', result: { appVersion: '4.3.0', features: [] } };
    case 'old':
      // What an older Electron main answers for a method it does not know.
      return {
        kind: 'rpc-error',
        code: -32601,
        message: 'method-not-found: get-capabilities',
        rpcKind: 'method-not-found',
      };
    default:
      return app;
  }
};
