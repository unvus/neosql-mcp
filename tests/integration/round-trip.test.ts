import { describe, it, expect, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../../src/mcp/server.js';
import { startMockRpcServer } from '../helpers/mock-uds-server.js';
import { makeTestSocketPath, removeSocketFile } from '../helpers/socket.js';

interface ToolCase {
  name: string;
  args: Record<string, unknown>;
}

const RPC_TOOL_CASES: ToolCase[] = [
  { name: 'generateCode', args: { tableName: 'users', templatePackId: 'java-jpa' } },
  { name: 'listTables', args: {} },
  { name: 'getTableDetails', args: { tableNames: ['users'] } },
  { name: 'createTables', args: { tableDefinitions: [{ name: 't1', columns: [] }] } },
  { name: 'modifyTables', args: { alterations: [{ table: 't1', changes: [] }] } },
  { name: 'executeQuery', args: { sql: 'SELECT 1' } },
];

const CONTEXT_TOOL_CASES: ToolCase[] = [
  { name: 'setContext', args: { projectId: 'p' } },
  { name: 'getContext', args: {} },
  { name: 'getContextHelp', args: {} },
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

  it('roundtrips all 9 tools (6 over mock UDS + 3 in-memory context)', async () => {
    const socketPath = makeTestSocketPath();
    const mock = await startMockRpcServer({
      socketPath,
      handler: (req) => ({ kind: 'result', result: { ok: true, method: req.method } }),
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
      name: 'listTables',
      arguments: {},
    });
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0]?.text).toMatch(/Server error/);
  });

  it('returns a tool error with "not running" when upstream socket is absent', async () => {
    const socketPath = makeTestSocketPath();
    const client = await setupClientServer(socketPath);
    const result = await client.callTool({
      name: 'listTables',
      arguments: {},
    });
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0]?.text).toMatch(/not running/);
  });
});
