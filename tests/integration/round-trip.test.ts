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
    name: 'create-tables',
    method: 'create-tables',
    args: {
      tableDefinitions: [
        {
          name: 't1',
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
    name: 'modify-tables',
    method: 'modify-tables',
    args: {
      alterations: [
        {
          tableName: 't1',
          newTableName: '',
          remarksOperation: { modify: true, remarks: '' },
          primaryKeyOperations: [{ action: 'ADD', columnName: 'code' }],
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
  { name: 'generate-code', args: {} },
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

  it('roundtrips upstream-backed tools with contract method names and params envelopes', async () => {
    const socketPath = makeTestSocketPath();
    const received: MockRpcRequest[] = [];
    const mock = await startMockRpcServer({
      socketPath,
      handler: (req) => {
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
      expect(req.params).toMatchObject({
        context: expect.any(Object),
        input: expect.any(Object),
      });
    }
  });

  it('returns a tool error with "Server error" when upstream responds 5xx', async () => {
    const socketPath = makeTestSocketPath();
    const mock = await startMockRpcServer({
      socketPath,
      handler: () => ({ kind: 'http', status: 500, body: 'oops' }),
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

  it('returns a not_installed tool error with an install guide link when macOS app paths are absent', async () => {
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
      status: 'not_installed',
      installGuideUrl: 'https://neosql.unvus.com/ko/docs/install',
    });
  });
});
