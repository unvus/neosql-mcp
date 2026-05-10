import { describe, it, expect, afterEach } from 'vitest';
import net from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../../src/mcp/server.js';
import { startMockRpcServer, type MockRpcRequest } from '../helpers/mock-uds-server.js';
import {
  closeServer,
  listen,
  makeTestSocketPath,
  removeSocketFile,
} from '../helpers/socket.js';

describe('desktop lifecycle integration', () => {
  const cleanups: Array<() => Promise<void> | void> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      const fn = cleanups.pop();
      if (fn) await fn();
    }
  });

  const setupClient = async (
    socketPath: string,
    opts: Parameters<typeof createServer>[0] = {},
  ): Promise<Client> => {
    const server = createServer({ socketPath, ...opts });
    const [st, ct] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    const client = new Client({ name: 'test', version: '0.0.0' });
    await client.connect(ct);
    cleanups.push(() => client.close());
    return client;
  };

  it('runs the original tool request when the desktop RPC endpoint is healthy', async () => {
    const socketPath = makeTestSocketPath();
    const received: MockRpcRequest[] = [];
    const mock = await startMockRpcServer({
      socketPath,
      handler: (req) => {
        received.push(req);
        return { kind: 'result', result: { tables: [] } };
      },
    });
    cleanups.push(async () => {
      await mock.close();
      removeSocketFile(socketPath);
    });

    const client = await setupClient(socketPath);
    const result = await client.callTool({ name: 'listTables', arguments: {} });

    expect(result.isError).not.toBe(true);
    expect(received.map((req) => req.method)).toEqual(['schema.listTables']);
  });

  it('requests activation and skips the original tool request when the socket is absent', async () => {
    const socketPath = makeTestSocketPath();
    const activationCalls: string[] = [];
    const client = await setupClient(socketPath, {
      requestAppActivation: async ({ profile }) => {
        activationCalls.push(profile);
        return {
          status: 'requested',
          target: {
            profile,
            productName: profile === 'dev' ? 'NeoSQLDev' : 'NeoSQL',
            appId: profile === 'dev' ? 'com.unvus.neosql.dev' : 'com.unvus.neosql',
            activationUrl: 'neosql://mcp/activate',
          },
        };
      },
    });

    const result = await client.callTool({ name: 'listTables', arguments: {} });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const payload = JSON.parse(content[0]?.text ?? '{}') as {
      status?: string;
      healthStatus?: string;
    };
    expect(payload).toMatchObject({
      status: 'activation_requested',
      healthStatus: 'not_running',
    });
    expect(activationCalls).toEqual(['prod']);
  });

  it('returns unresponsive and does not request activation when the health check times out', async () => {
    const socketPath = makeTestSocketPath();
    const openSockets = new Set<net.Socket>();
    const hangingServer = net.createServer((sock) => {
      openSockets.add(sock);
      sock.on('error', () => undefined);
      sock.on('close', () => openSockets.delete(sock));
    });
    cleanups.push(async () => {
      for (const sock of openSockets) sock.destroy();
      await closeServer(hangingServer);
      removeSocketFile(socketPath);
    });
    await listen(hangingServer, socketPath);
    const activationCalls: string[] = [];

    const client = await setupClient(socketPath, {
      desktopHealthTimeoutMs: 50,
      requestAppActivation: async ({ profile }) => {
        activationCalls.push(profile);
        return {
          status: 'requested',
          target: {
            profile,
            productName: 'NeoSQL',
            appId: 'com.unvus.neosql',
            activationUrl: 'neosql://mcp/activate',
          },
        };
      },
    });

    const result = await client.callTool({ name: 'listTables', arguments: {} });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const payload = JSON.parse(content[0]?.text ?? '{}') as {
      status?: string;
      healthStatus?: string;
    };
    expect(payload).toMatchObject({ status: 'unresponsive', healthStatus: 'timeout' });
    expect(activationCalls).toEqual([]);
  });
});
