import { describe, it, expect, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../../src/mcp/server.js';
import { activationTargetForProfile } from '../../src/upstream/app-activation.js';
import { startMockRpcServer, type MockRpcRequest } from '../helpers/mock-uds-server.js';
import { makeTestSocketPath, removeSocketFile } from '../helpers/socket.js';

interface ToolCase {
  name: string;
  args: Record<string, unknown>;
  method?: string;
}

const RPC_TOOL_CASES: ToolCase[] = [
  { name: 'list-connections', method: 'list-connections', args: {} },
  { name: 'list-tables', method: 'list-tables', args: {} },
  { name: 'get-table-details', method: 'get-table-details', args: { tableNames: ['users'] } },
  {
    name: 'erd-create-tables',
    method: 'erd-create-tables',
    args: {
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
  },
  {
    name: 'erd-modify-tables',
    method: 'erd-modify-tables',
    args: {
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
  },
  { name: 'execute-query', method: 'execute-query', args: { sql: 'SELECT 1' } },
];

const CONTEXT_TOOL_CASES: ToolCase[] = [
  { name: 'get-context-help', args: {} },
];

describe('round-trip integration', () => {
  const cleanups: Array<() => Promise<void> | void> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      const fn = cleanups.pop();
      if (fn) await fn();
    }
  });

  const setupClientServer = async (socketPath: string): Promise<Client> => {
    const server = createServer({ socketPath });
    const [st, ct] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    const client = new Client({ name: 'test', version: '0.0.0' });
    await client.connect(ct);
    cleanups.push(() => client.close());
    return client;
  };

  it('roundtrips code generation policy and preserves partial installation results', async () => {
    const socketPath = makeTestSocketPath();
    const received: MockRpcRequest[] = [];
    const expected = { status: 'partial', files: [{ tableName: 'users', path: '/tmp/User.ts' }], skipped: [], failures: [{ tableName: 'orders', stage: 'metadata', reason: 'table-not-found', message: 'missing' }] };
    const mock = await startMockRpcServer({
      socketPath,
      runtimeStatus: { app: 'neosql', profile: 'prod', renderer: 'responsive', project: { state: 'ready', projectId: 'A' } },
      handler: req => {
        received.push(req);
        return { kind: 'result', result: req.method === 'get-code-generation-policy'
          ? { version: 1, executionTimeoutMs: 60000, responseGraceMs: 5000 } : expected };
      },
    });
    cleanups.push(async () => { await mock.close(); removeSocketFile(socketPath); });
    const client = await setupClientServer(socketPath);
    const response = await client.callTool({ name: 'generate-code', arguments: { tableNames: ['users', 'orders'] } });
    expect(response.isError).not.toBe(true);
    expect(JSON.parse((response.content as { text: string }[])[0]!.text)).toEqual(expected);
    expect(received.map(r => r.method)).toEqual(['get-code-generation-policy', 'generate-code']);
    expect(received[1]?.params).toMatchObject({ expectedTimeoutMs: 60000, input: { tableNames: ['users', 'orders'] } });
  });

  it('roundtrips upstream-backed tools with contract method names and params envelopes', async () => {
    const socketPath = makeTestSocketPath();
    const received: MockRpcRequest[] = [];
    const mock = await startMockRpcServer({
      socketPath,
      handler: (req) => {
        if (req.method === 'get-runtime-status')
          return {
            kind: 'result',
            result: {
              app: 'neosql',
              profile: 'prod',
              renderer: 'responsive',
              project: { state: 'ready', projectId: 'A' },
            },
          };
        received.push(req);
        return { kind: 'result', result: { ok: true, method: req.method } };
      },
    });
    cleanups.push(async () => {
      await mock.close();
      removeSocketFile(socketPath);
    });

    const client = await setupClientServer(socketPath);

    for (const c of [...RPC_TOOL_CASES, ...CONTEXT_TOOL_CASES]) {
      const result = await client.callTool({ name: c.name, arguments: c.args });
      expect(result.isError, `tool ${c.name} should not error`).not.toBe(true);
    }

    expect(received.map((req) => req.method)).toEqual(RPC_TOOL_CASES.map((c) => c.method));
    const sessionIds = new Set(
      received.map((req) => (req.params as { sessionId?: string } | undefined)?.sessionId),
    );
    expect(sessionIds.size).toBe(1);
    expect([...sessionIds][0]).toEqual(expect.any(String));
    for (const req of received) {
      expect(req.params).toMatchObject({ input: expect.any(Object) });
      expect(req.params).not.toHaveProperty('context');
    }
  });

  it('returns a tool error with "Server error" when upstream responds 5xx', async () => {
    const socketPath = makeTestSocketPath();
    const mock = await startMockRpcServer({
      socketPath,
      handler: (req) =>
        req.method === 'get-runtime-status'
          ? {
              kind: 'result',
              result: {
                app: 'neosql',
                profile: 'prod',
                renderer: 'responsive',
                project: { state: 'ready', projectId: 'A' },
              },
            }
          : { kind: 'http', status: 500, body: 'oops' },
    });
    cleanups.push(async () => {
      await mock.close();
      removeSocketFile(socketPath);
    });

    const client = await setupClientServer(socketPath);
    const result = await client.callTool({
      name: 'list-tables',
      arguments: {},
    });
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0]?.text).toMatch(/Server error/);
  });

  it('returns an installation_not_found preparation result when macOS app paths are absent', async () => {
    const socketPath = makeTestSocketPath();
    const server = createServer({
      socketPath,
      checkDesktopInstallation: async ({ profile }) => ({
        status: 'not_installed',
        platform: 'darwin',
        target: activationTargetForProfile(profile),
        checkedExecutablePaths: [
          '/Applications/NeoSQL.app/Contents/MacOS/NeoSQL',
          '/Users/shock/Applications/NeoSQL.app/Contents/MacOS/NeoSQL',
        ],
        installGuideUrl: 'https://neosql.unvus.com/ko/docs/install',
      }),
      requestAppActivation: async ({ profile }) => ({
        status: 'requested',
        target: activationTargetForProfile(profile),
      }),
    });
    const [st, ct] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    const client = new Client({ name: 'test', version: '0.0.0' });
    await client.connect(ct);
    cleanups.push(() => client.close());
    const result = await client.callTool({
      name: 'list-tables',
      arguments: {},
    });
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const payload = JSON.parse(content[0]?.text ?? '{}') as {
      status?: string;
      installGuideUrl?: string;
    };
    expect(payload).toMatchObject({
      status: 'installation_not_found',
      requestSent: false,
    });
  });
});

describe('T19/T20 registered tool request context', () => {
  it.each(RPC_TOOL_CASES)(
    'passes progress context and preserves post-send rejection for $name',
    async (c) => {
      const socketPath = makeTestSocketPath();
      let operations = 0;
      const mock = await startMockRpcServer({
        socketPath,
        handler: (req) => {
          if (req.method === 'get-runtime-status')
            return {
              kind: 'result',
              result: {
                app: 'neosql',
                profile: 'prod',
                renderer: 'responsive',
                project: { state: 'ready', projectId: 'A' },
              },
            };
          operations++;
          return {
            kind: 'rpc-error',
            code: -32002,
            rpcKind: 'unavailable',
            message: 'Current project is loading.',
          };
        },
      });
      const server = createServer({ socketPath });
      const [st, ct] = InMemoryTransport.createLinkedPair();
      await server.connect(st);
      const client = new Client({ name: 'test', version: '1' });
      try {
        await client.connect(ct);
        const wire: Array<Record<string, unknown>> = [];
        const receive = ct.onmessage!;
        ct.onmessage = (message) => {
          wire.push(message as Record<string, unknown>);
          receive(message);
        };
        const result = await client.callTool({
          name: c.name,
          arguments: c.args,
          _meta: { progressToken: 0 },
        });
        expect(wire.filter((message) => message.method === 'notifications/progress')).toEqual([
          {
            jsonrpc: '2.0',
            method: 'notifications/progress',
            params: {
              progressToken: 0,
              progress: 1,
              message: 'The project is ready. Proceeding with the requested operation.',
            },
          },
        ]);
        expect(result.isError).toBe(true);
        const payload = JSON.parse((result.content as Array<{ text: string }>)[0]!.text);
        expect(payload).toMatchObject({ status: 'app_not_ready', reason: 'unavailable' });
        expect(payload).not.toHaveProperty('requestSent');
        expect(operations).toBe(1);
      } finally {
        await client.close();
        await server.close();
        await mock.close();
        removeSocketFile(socketPath);
      }
    },
  );
});
