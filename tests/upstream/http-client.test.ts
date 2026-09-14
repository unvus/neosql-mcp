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
import { startMockRpcServer, type MockRpcRequest } from '../helpers/mock-uds-server.js';

describe('postRpc', () => {
  const cleanups: Array<() => Promise<void> | void> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      const fn = cleanups.pop();
      if (fn) await fn();
    }
  });

  it.each([
    'null',
    '[]',
    '{"jsonrpc":"1.0","id":77,"result":{}}',
    '{"jsonrpc":"2.0","id":77,"error":null}',
    '{"jsonrpc":"2.0","id":77,"result":{},"error":{"code":1,"message":"x"}}',
  ])('T08 rejects invalid JSON-RPC envelopes: %s', async (body) => {
    const socketPath = makeTestSocketPath();
    const mock = await startMockRpcServer({
      socketPath,
      handler: () => ({ kind: 'http', status: 200, body }),
    });
    cleanups.push(async () => {
      await mock.close();
      removeSocketFile(socketPath);
    });
    await expect(
      postRpc({ socketPath, method: 'get-runtime-status', id: 77 }),
    ).rejects.toMatchObject({ kind: 'bad-response' });
  });

  it('T18 destroys a pending HTTP observation on cancellation', async () => {
    const socketPath = makeTestSocketPath();
    let observed!: () => void;
    let closed!: () => void;
    const received = new Promise<void>((resolve) => {
      observed = resolve;
    });
    const disconnected = new Promise<void>((resolve) => {
      closed = resolve;
    });
    const server = http.createServer((_req, res) => {
      res.on('close', closed);
      observed();
    });
    await listen(server, socketPath);
    cleanups.push(async () => {
      await closeServer(server);
      removeSocketFile(socketPath);
    });
    const controller = new AbortController();
    const work = postRpc({ socketPath, method: 'get-runtime-status', signal: controller.signal });
    const assertion = expect(work).rejects.toMatchObject({ name: 'AbortError' });
    await received;
    controller.abort();
    await assertion;
    await disconnected;
  });

  it('T08 rejects a response whose connection closes before the body ends', async () => {
    const socketPath = makeTestSocketPath();
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.write('{');
      setTimeout(() => res.destroy(), 10);
    });
    await listen(server, socketPath);
    cleanups.push(async () => {
      await closeServer(server);
      removeSocketFile(socketPath);
    });
    await expect(postRpc({ socketPath, method: 'get-runtime-status' })).rejects.toMatchObject({
      kind: 'bad-response',
    });
  });

  it('T09 caps the entire HTTP lifetime even while response bytes keep arriving', async () => {
    const socketPath = makeTestSocketPath();
    let closed!: () => void;
    const disconnected = new Promise<void>((resolve) => {
      closed = resolve;
    });
    const server = http.createServer((_req, res) => {
      res.writeHead(200);
      res.write('{');
      const timer = setInterval(() => res.write(' '), 5);
      res.on('close', () => {
        clearInterval(timer);
        closed();
      });
    });
    await listen(server, socketPath);
    cleanups.push(async () => {
      await closeServer(server);
      removeSocketFile(socketPath);
    });
    const began = performance.now();
    await expect(
      postRpc({ socketPath, method: 'get-runtime-status', timeoutMs: 60 }),
    ).rejects.toMatchObject({ kind: 'timeout' });
    await disconnected;
    expect(performance.now() - began).toBeLessThan(1000);
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
      method: 'list-tables',
      params: { schema: 'public' },
    });

    expect(result).toEqual({ tables: ['users', 'orders'] });
    expect(received).toHaveLength(1);
    expect(received[0]?.method).toBe('list-tables');
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

  it('throws HttpClientError(bad-response) when JSON-RPC response id does not match', async () => {
    const socketPath = makeTestSocketPath();
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 'other-id',
          result: { ok: true },
        }),
      );
    });
    cleanups.push(async () => {
      await closeServer(server);
      removeSocketFile(socketPath);
    });
    await listen(server, socketPath);

    await expect(postRpc({ socketPath, method: 'x', id: 'expected-id' })).rejects.toMatchObject({
      kind: 'bad-response',
      message: 'Upstream JSON-RPC response id does not match the request id.',
    });
  });

  it('preserves JSON-RPC error data.kind for lifecycle error mapping', async () => {
    const socketPath = makeTestSocketPath();
    const mock = await startMockRpcServer({
      socketPath,
      handler: () => ({
        kind: 'rpc-error',
        code: -32002,
        message: 'NeoSQL renderer is not ready.',
        rpcKind: 'app-not-ready',
      }),
    });
    cleanups.push(async () => {
      await mock.close();
      removeSocketFile(socketPath);
    });

    await expect(postRpc({ socketPath, method: 'list-tables' })).rejects.toMatchObject({
      kind: 'rpc-error',
      rpcCode: -32002,
      rpcKind: 'app-not-ready',
    });
  });

  it('preserves unauthenticated JSON-RPC error kind from the renderer handler', async () => {
    const socketPath = makeTestSocketPath();
    const mock = await startMockRpcServer({
      socketPath,
      handler: () => ({
        kind: 'rpc-error',
        code: -32001,
        message: 'User is not authenticated. Sign in to the NeoSQL app first.',
        rpcKind: 'unauthenticated',
      }),
    });
    cleanups.push(async () => {
      await mock.close();
      removeSocketFile(socketPath);
    });

    await expect(postRpc({ socketPath, method: 'list-tables' })).rejects.toMatchObject({
      kind: 'rpc-error',
      rpcCode: -32001,
      rpcKind: 'unauthenticated',
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

    await expect(postRpc({ socketPath, method: 'x', timeoutMs: 50 })).rejects.toMatchObject({
      kind: 'timeout',
    });
  });

  it('throws HttpClientError(not-running) when socket path does not exist', async () => {
    const socketPath = makeTestSocketPath();
    await expect(postRpc({ socketPath, method: 'x' })).rejects.toMatchObject({
      kind: 'not-running',
    });
  });

  it.skipIf(isWin32)(
    'rejects a regular file as bad-response rather than a stale socket',
    async () => {
      const socketPath = makeTestSocketPath();
      fs.writeFileSync(socketPath, '');
      cleanups.push(() => removeSocketFile(socketPath));
      await expect(postRpc({ socketPath, method: 'x' })).rejects.toMatchObject({
        kind: 'bad-response',
      });
    },
  );

  it.skipIf(isWin32)(
    'reports stale-socket for an actual socket inode without a listener',
    async () => {
      const socketPath = makeTestSocketPath();
      const stalePath = makeTestSocketPath();
      const server = net.createServer();
      await listen(server, socketPath);
      fs.renameSync(socketPath, stalePath);
      await closeServer(server);
      cleanups.push(() => removeSocketFile(stalePath));
      expect(fs.statSync(stalePath).isSocket()).toBe(true);
      await expect(postRpc({ socketPath: stalePath, method: 'x' })).rejects.toMatchObject({
        kind: 'stale-socket',
      });
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
