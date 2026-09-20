import { describe, it, expect, afterAll, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import http from 'node:http';
import { createInterface } from 'node:readline';
import { closeServer, listen } from '../helpers/socket.js';

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
  it.each(['loading', 'pending HTTP', 'pending navigation'] as const)(
    'cancels preparation and exits naturally when stdin ends during %s',
    async (phase) => {
      const runtimeDir = mkdtempSync(path.join(os.tmpdir(), 'mp-'));
      const socketPath =
        process.platform === 'win32'
          ? '\\\\.\\pipe\\neosql-mcp-local'
          : path.join(runtimeDir, 'neosql-mcp-local.sock');
      let child: ChildProcessWithoutNullStreams | undefined;
      let queries = 0;
      let operations = 0;
      let inputEndedAt: number | undefined;
      let httpClosedAt: number | undefined;
      const wire: Array<Record<string, unknown>> = [];
      let stderr = '';
      const endInput = () => {
        inputEndedAt = performance.now();
        child!.stdin.end();
      };
      const mock = http.createServer((req, res) => {
        let body = '';
        req.on('data', (chunk: Buffer) => {
          body += chunk.toString('utf8');
        });
        req.on('end', () => {
          const rpc = JSON.parse(body) as { method: string; id: number };
          if (rpc.method === 'get-runtime-status') {
            queries++;
            if (phase === 'pending HTTP') {
              res.on('close', () => {
                httpClosedAt = performance.now();
              });
              endInput();
              return;
            }
          } else if (rpc.method === 'open-project') {
            res.on('close', () => { httpClosedAt = performance.now(); });
            endInput();
            return;
          } else {
            operations++;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              id: rpc.id,
              result:
                rpc.method === 'get-runtime-status'
                  ? {
                      app: 'neosql',
                      profile: 'local',
                      renderer: 'responsive',
                      project: { state: queries === 1 ? 'loading' : 'ready', projectId: 'A' },
                    }
                  : { connections: [] },
            }),
          );
        });
      });
      let exitTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        // Bind before spawning; never use the real Desktop endpoint or SDK close/kill.
        await listen(mock, socketPath);
        child = spawn(process.execPath, [CLI_PATH, '--profile=local', ...(phase === 'pending navigation' ? ['--project-id=B'] : [])], {
          stdio: 'pipe',
          env: {
            ...process.env,
            TMPDIR: runtimeDir,
            TMP: runtimeDir,
            TEMP: runtimeDir,
            NEOSQL_MCP_LOG_PARENT_DIR: runtimeDir,
          },
        });
        const exit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
          (resolve, reject) => {
            child!.once('error', reject);
            child!.once('close', (code, signal) => resolve({ code, signal }));
            exitTimer = setTimeout(
              () => reject(new Error('CLI did not exit after stdin EOF')),
              3000,
            );
          },
        );
        child.stderr.on('data', (chunk: Buffer) => {
          stderr += chunk.toString('utf8');
        });
        const send = (message: unknown) => child!.stdin.write(`${JSON.stringify(message)}\n`);
        createInterface({ input: child.stdout }).on('line', (line) => {
          const message = JSON.parse(line) as Record<string, unknown>;
          wire.push(message);
          if (message.id === 1) {
            send({ jsonrpc: '2.0', method: 'notifications/initialized' });
            send({
              jsonrpc: '2.0',
              id: 2,
              method: 'tools/call',
              params: {
                name: 'list-connections',
                arguments: {},
                _meta: { progressToken: 'eof-test' },
              },
            });
          } else if (message.method === 'notifications/progress' && inputEndedAt === undefined && phase === 'loading') {
            endInput();
          }
        });
        send({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'eof-test', version: '1' },
          },
        });

        expect(await exit).toEqual({ code: 0, signal: null });
        expect(stderr).toBe('');
        expect(inputEndedAt).toBeDefined();
        expect(queries).toBe(1);
        expect(operations).toBe(0);
        expect(wire.filter((message) => message.id === 2)).toEqual([]);
        const progress = wire.filter((message) => message.method === 'notifications/progress');
        expect(progress).toHaveLength(phase === 'pending HTTP' ? 0 : 1);
        if (phase === 'loading') {
          expect(progress[0]?.params).toMatchObject({ message: 'Loading the selected project.' });
        } else {
          expect(httpClosedAt).toBeDefined();
          // Cancellation must close the request before its normal 1000ms query timeout.
          expect(httpClosedAt! - inputEndedAt!).toBeLessThan(750);
        }
      } finally {
        clearTimeout(exitTimer);
        if (child && child.exitCode === null && child.signalCode === null) {
          const closed = new Promise<void>((resolve) => child!.once('close', () => resolve()));
          child.kill('SIGKILL');
          await closed;
        }
        await closeServer(mock);
        rmSync(runtimeDir, { recursive: true, force: true });
      }
    },
  );

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
