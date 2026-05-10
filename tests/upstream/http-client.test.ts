import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import { postRpc, HttpClientError } from '../../src/upstream/http-client.js';
import {
  makeTestSocketPath,
  closeServer,
  listen,
  removeSocketFile,
  isWin32,
} from '../helpers/socket.js';
import {
  startMockRpcServer,
  type MockRpcRequest,
} from '../helpers/mock-uds-server.js';

describe('postRpc', () => {
  const cleanups: Array<() => Promise<void> | void> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      const fn = cleanups.pop();
      if (fn) await fn();
    }
  });

  it('returns the JSON-RPC result on a successful response', async () => {
    const socketPath = makeTestSocketPath();
    const received: MockRpcRequest[] = [];
    const mock = await startMockRpcServer({
      socketPath,
      handler: (req) => {
        received.push(req);
        return { kind: 'result', result: { tables: ['users', 'orders'] } };
      },
    });
    cleanups.push(async () => {
      await mock.close();
      removeSocketFile(socketPath);
    });

    const result = await postRpc<{ tables: string[] }>({
      socketPath,
      method: 'schema.listTables',
      params: { schema: 'public' },
    });

    expect(result).toEqual({ tables: ['users', 'orders'] });
    expect(received).toHaveLength(1);
    expect(received[0]?.method).toBe('schema.listTables');
    expect(received[0]?.params).toEqual({ schema: 'public' });
    expect(received[0]?.id).not.toBeNull();
  });

  it('throws HttpClientError(rpc-error) when JSON-RPC error returned', async () => {
    const socketPath = makeTestSocketPath();
    const mock = await startMockRpcServer({
      socketPath,
      handler: () => ({
        kind: 'rpc-error',
        code: -32601,
        message: 'method not found',
      }),
    });
    cleanups.push(async () => {
      await mock.close();
      removeSocketFile(socketPath);
    });

    let caught: unknown;
    try {
      await postRpc({ socketPath, method: 'unknown.method' });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(HttpClientError);
    const e = caught as HttpClientError;
    expect(e.kind).toBe('rpc-error');
    expect(e.rpcCode).toBe(-32601);
    expect(e.message).toBe('method not found');
  });

  it('preserves JSON-RPC error data.kind for lifecycle error mapping', async () => {
    const socketPath = makeTestSocketPath();
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          error: {
            code: -32002,
            message: 'NeoSQL renderer is not ready.',
            data: { kind: 'app-not-ready' },
          },
        }),
      );
    });
    cleanups.push(async () => {
      await closeServer(server);
      removeSocketFile(socketPath);
    });
    await listen(server, socketPath);

    await expect(postRpc({ socketPath, method: 'schema.listTables' })).rejects.toMatchObject({
      kind: 'rpc-error',
      rpcCode: -32002,
      rpcKind: 'app-not-ready',
    });
  });

  it('throws HttpClientError(http-4xx) on a 4xx HTTP response', async () => {
    const socketPath = makeTestSocketPath();
    const mock = await startMockRpcServer({
      socketPath,
      handler: () => ({ kind: 'http', status: 400, body: 'Bad Request' }),
    });
    cleanups.push(async () => {
      await mock.close();
      removeSocketFile(socketPath);
    });

    await expect(postRpc({ socketPath, method: 'x' })).rejects.toMatchObject({
      kind: 'http-4xx',
      status: 400,
    });
  });

  it('throws HttpClientError(http-5xx) on a 5xx HTTP response', async () => {
    const socketPath = makeTestSocketPath();
    const mock = await startMockRpcServer({
      socketPath,
      handler: () => ({ kind: 'http', status: 500, body: 'Internal' }),
    });
    cleanups.push(async () => {
      await mock.close();
      removeSocketFile(socketPath);
    });

    await expect(postRpc({ socketPath, method: 'x' })).rejects.toMatchObject({
      kind: 'http-5xx',
      status: 500,
    });
  });

  it('throws HttpClientError(timeout) when listener accepts but never responds', async () => {
    const socketPath = makeTestSocketPath();
    const openSockets = new Set<net.Socket>();
    const server = net.createServer((sock) => {
      openSockets.add(sock);
      sock.on('error', () => undefined);
      sock.on('close', () => openSockets.delete(sock));
    });
    cleanups.push(async () => {
      for (const sock of openSockets) sock.destroy();
      await closeServer(server);
      removeSocketFile(socketPath);
    });
    await listen(server, socketPath);

    await expect(
      postRpc({ socketPath, method: 'x', timeoutMs: 50 }),
    ).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('throws HttpClientError(not-running) when socket path does not exist', async () => {
    const socketPath = makeTestSocketPath();
    await expect(postRpc({ socketPath, method: 'x' })).rejects.toMatchObject({
      kind: 'not-running',
    });
  });

  it.skipIf(isWin32)(
    'throws HttpClientError(stale-socket) when leftover socket file has no listener',
    async () => {
      const socketPath = makeTestSocketPath();
      const server = net.createServer();
      await listen(server, socketPath);
      await new Promise<void>((resolve) => server.close(() => resolve()));
      if (!fs.existsSync(socketPath)) fs.writeFileSync(socketPath, '');
      cleanups.push(() => removeSocketFile(socketPath));

      await expect(
        postRpc({ socketPath, method: 'x' }),
      ).rejects.toMatchObject({ kind: 'stale-socket' });
    },
  );

  it('throws HttpClientError(bad-response) when response body is not valid JSON', async () => {
    const socketPath = makeTestSocketPath();
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('not-json');
    });
    cleanups.push(async () => {
      await closeServer(server);
      removeSocketFile(socketPath);
    });
    await listen(server, socketPath);

    await expect(postRpc({ socketPath, method: 'x' })).rejects.toMatchObject({
      kind: 'bad-response',
    });
  });
});
