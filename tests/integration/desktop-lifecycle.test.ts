import { describe, it, expect, afterEach } from 'vitest';
import net from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../../src/mcp/server.js';
import { activationTargetForProfile } from '../../src/upstream/app-activation.js';
import { startMockRpcServer, type MockRpcRequest } from '../helpers/mock-uds-server.js';
import { closeServer, listen, makeTestSocketPath, removeSocketFile } from '../helpers/socket.js';

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
    const result = await client.callTool({ name: 'list-tables', arguments: {} });

    expect(result.isError).not.toBe(true);
    expect(received.map((req) => req.method)).toEqual(['list-tables']);
  });

  it('returns unauthenticated when the desktop is running but NeoSQL is not signed in', async () => {
    const socketPath = makeTestSocketPath();
    const received: MockRpcRequest[] = [];
    const activationCalls: string[] = [];
    const mock = await startMockRpcServer({
      socketPath,
      handler: (req) => {
        received.push(req);
        return {
          kind: 'rpc-error',
          code: -32001,
          message: 'User is not authenticated. Sign in to the NeoSQL app first.',
          rpcKind: 'unauthenticated',
        };
      },
    });
    cleanups.push(async () => {
      await mock.close();
      removeSocketFile(socketPath);
    });

    const client = await setupClient(socketPath, {
      requestAppActivation: async ({ profile }) => {
        activationCalls.push(profile);
        return {
          status: 'requested',
          target: activationTargetForProfile(profile),
        };
      },
    });
    const result = await client.callTool({ name: 'list-tables', arguments: {} });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const payload = JSON.parse(content[0]?.text ?? '{}') as {
      status?: string;
      reason?: string;
    };
    expect(payload).toMatchObject({
      status: 'unauthenticated',
      reason: 'unauthenticated',
    });
    expect(received.map((req) => req.method)).toEqual(['list-tables']);
    expect(activationCalls).toEqual(['prod']);
  });

  it('requests activation and skips the original tool request when the socket is absent', async () => {
    const socketPath = makeTestSocketPath();
    const activationCalls: string[] = [];
    const client = await setupClient(socketPath, {
      checkDesktopInstallation: async ({ profile }) => ({
        status: 'installed',
        platform: 'darwin',
        target: activationTargetForProfile(profile),
        executablePath: '/Applications/NeoSQL.app/Contents/MacOS/NeoSQL',
        checkedExecutablePaths: ['/Applications/NeoSQL.app/Contents/MacOS/NeoSQL'],
      }),
      requestAppActivation: async ({ profile }) => {
        activationCalls.push(profile);
        return {
          status: 'requested',
          target: activationTargetForProfile(profile),
        };
      },
    });

    const result = await client.callTool({ name: 'list-tables', arguments: {} });

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
          target: activationTargetForProfile(profile),
        };
      },
    });

    const result = await client.callTool({ name: 'list-tables', arguments: {} });

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
