import { describe, it, expect, afterAll, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_PATH = resolve(__dirname, '../../dist/cli.js');

describe('built CLI via stdio spawn', () => {
  const clients: Client[] = [];
  let logParentDir: string;

  afterAll(async () => {
    await Promise.all(clients.map((c) => c.close()));
  });

  beforeEach(() => {
    logParentDir = mkdtempSync(path.join(os.tmpdir(), 'neosql-mcp-spawn-logs-'));
  });

  afterEach(() => {
    rmSync(logParentDir, { recursive: true, force: true });
  });

  it('responds to ping over stdio after spawn', async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [CLI_PATH],
      env: {
        NEOSQL_MCP_LOG_PARENT_DIR: logParentDir,
      },
    });
    const client = new Client({ name: 'spawn-test-client', version: '0.0.0' });
    clients.push(client);
    await client.connect(transport);

    const result = await client.callTool({ name: 'ping', arguments: {} });
    const content = result.content as Array<{ type: string; text?: string }>;
    expect(content[0]?.text).toBe('pong');
  });

  it('starts without warnings or errors when legacy context flags are present', async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [
        CLI_PATH,
        '--project=legacy-project',
        '--default-connection=88',
        '--default-database=sales',
        '--default-schema=public',
      ],
      env: {
        NEOSQL_MCP_LOG_PARENT_DIR: logParentDir,
      },
    });
    const client = new Client({ name: 'spawn-test-client', version: '0.0.0' });
    clients.push(client);
    await client.connect(transport);

    const result = await client.callTool({ name: 'ping', arguments: {} });
    const content = result.content as Array<{ type: string; text?: string }>;
    expect(content[0]?.text).toBe('pong');
  });

  it('returns a stable mcpSessionId within the spawned process', async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [CLI_PATH],
      env: {
        NEOSQL_MCP_LOG_PARENT_DIR: logParentDir,
      },
    });
    const client = new Client({ name: 'spawn-test-client', version: '0.0.0' });
    clients.push(client);
    await client.connect(transport);

    const first = await client.callTool({ name: 'get-mcp-session-id', arguments: {} });
    const second = await client.callTool({ name: 'get-mcp-session-id', arguments: {} });
    const firstContent = first.content as Array<{ type: string; text?: string }>;
    const secondContent = second.content as Array<{ type: string; text?: string }>;

    expect(first.isError).not.toBe(true);
    expect(second.isError).not.toBe(true);
    expect(firstContent[0]?.text).toMatch(/^[0-9a-f-]{36}$/);
    expect(secondContent[0]?.text).toBe(firstContent[0]?.text);
  });
});

// Windows pipes ignore TMPDIR: only run on a dedicated runner without NeoSQL.
describe.skipIf(
  process.platform === 'win32' && process.env.NEOSQL_MCP_DEDICATED_WINDOWS_RUNNER !== '1',
)('T21 isolated built CLI preparation', () => {
  it.each([undefined, 0, 'startup-token'])(
    'delivers progress and one final response for token %s',
    async (progressToken) => {
      const { startMockRpcServer } = await import('../helpers/mock-uds-server.js');
      const runtimeDir = mkdtempSync(path.join(os.tmpdir(), 'mp-'));
      const socketPath =
        process.platform === 'win32'
          ? '\\\\.\\pipe\\neosql-mcp-local'
          : path.join(runtimeDir, 'neosql-mcp-local.sock');
      let queries = 0;
      let operations = 0;
      const wire: Array<Record<string, unknown>> = [];
      let client: Client | undefined;
      const mock = await startMockRpcServer({
        socketPath,
        handler: (req) => {
          if (req.method === 'get-runtime-status') {
            expect(req.params).toEqual({});
            queries++;
            return {
              kind: 'result',
              result: {
                app: 'neosql',
                profile: 'local',
                renderer: 'responsive',
                project: { state: queries < 3 ? 'loading' : 'ready', projectId: 'B' },
              },
            };
          }
          operations++;
          expect(req.method).toBe('list-connections');
          return { kind: 'result', result: { connections: [{ name: 'B-reference' }] } };
        },
      });
      try {
        // Bind must succeed before the CLI is allowed to start.
        const transport = new StdioClientTransport({
          command: process.execPath,
          args: [CLI_PATH, '--profile=local'],
          env: {
            TMPDIR: runtimeDir,
            TMP: runtimeDir,
            TEMP: runtimeDir,
            NEOSQL_MCP_LOG_PARENT_DIR: runtimeDir,
          },
        });
        client = new Client({ name: 'preparation-stdio-test', version: '1' });
        await client.connect(transport);
        const receive = transport.onmessage!;
        transport.onmessage = (message) => {
          wire.push(message as Record<string, unknown>);
          receive(message);
        };
        const result = await client.callTool({
          name: 'list-connections',
          arguments: {},
          ...(progressToken === undefined ? {} : { _meta: { progressToken } }),
        });
        expect(result.isError).not.toBe(true);
        expect(JSON.parse((result.content as Array<{ text: string }>)[0]!.text)).toEqual({
          connections: [{ name: 'B-reference' }],
        });
        const notifications = wire.filter((message) => message.method === 'notifications/progress');
        expect(notifications).toEqual(
          progressToken === undefined
            ? []
            : [
                {
                  jsonrpc: '2.0',
                  method: 'notifications/progress',
                  params: { progressToken, progress: 1, message: 'Loading the selected project.' },
                },
                {
                  jsonrpc: '2.0',
                  method: 'notifications/progress',
                  params: {
                    progressToken,
                    progress: 2,
                    message: 'The project is ready. Proceeding with the requested operation.',
                  },
                },
              ],
        );
        expect(wire.filter((message) => 'result' in message || 'error' in message)).toHaveLength(1);
        expect(queries).toBe(3);
        expect(operations).toBe(1);
      } finally {
        await client?.close();
        await mock.close();
        rmSync(runtimeDir, { recursive: true, force: true });
      }
    },
  );
});
