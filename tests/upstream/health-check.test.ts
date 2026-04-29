import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { checkHealth } from '../../src/upstream/health-check.js';

const isWin32 = process.platform === 'win32';

// Keep paths short — POSIX UDS sun_path is limited to ~104 bytes (macOS) and
// os.tmpdir() on macOS already eats ~50 chars (`/var/folders/.../T/`).
const makeTestSocketPath = (): string => {
  const id = randomBytes(4).toString('hex');
  if (isWin32) return `\\\\.\\pipe\\nm-test-${id}`;
  return path.join(os.tmpdir(), `nm-test-${id}.sock`);
};

const closeServer = (server: net.Server | http.Server): Promise<void> =>
  new Promise((resolve) => {
    if (!server.listening) return resolve();
    // server.close() only stops accepting new connections; existing sockets
    // keep it alive. http.Server has closeAllConnections() (Node 18.2+); for
    // net.Server tests must track and destroy sockets themselves.
    const maybeHttp = server as http.Server & { closeAllConnections?: () => void };
    if (typeof maybeHttp.closeAllConnections === 'function') {
      maybeHttp.closeAllConnections();
    }
    server.close(() => resolve());
  });

const listen = (
  server: net.Server | http.Server,
  socketPath: string,
): Promise<void> =>
  new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });

describe('checkHealth', () => {
  const cleanups: Array<() => Promise<void> | void> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      const fn = cleanups.pop();
      if (fn) await fn();
    }
  });

  it('returns running when an HTTP listener responds on the socket', async () => {
    const socketPath = makeTestSocketPath();
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
    });
    cleanups.push(async () => {
      await closeServer(server);
      if (!isWin32 && fs.existsSync(socketPath)) fs.unlinkSync(socketPath);
    });
    await listen(server, socketPath);

    const result = await checkHealth(socketPath);
    expect(result).toEqual({ status: 'running' });
  });

  it('returns not_running when the socket path does not exist', async () => {
    const socketPath = makeTestSocketPath();
    const result = await checkHealth(socketPath);
    expect(result).toEqual({ status: 'not_running' });
  });

  it('returns timeout when listener accepts connection but never responds', async () => {
    const socketPath = makeTestSocketPath();
    const openSockets = new Set<net.Socket>();
    const server = net.createServer((sock) => {
      // intentionally never write a response — the client request will time out.
      openSockets.add(sock);
      sock.on('error', () => undefined);
      sock.on('close', () => openSockets.delete(sock));
    });
    cleanups.push(async () => {
      for (const sock of openSockets) sock.destroy();
      await closeServer(server);
      if (!isWin32 && fs.existsSync(socketPath)) fs.unlinkSync(socketPath);
    });
    await listen(server, socketPath);

    const result = await checkHealth(socketPath, { timeoutMs: 50 });
    expect(result).toEqual({ status: 'timeout' });
  });

  it.skipIf(isWin32)('returns stale_socket when a leftover socket file exists with no listener', async () => {
    const socketPath = makeTestSocketPath();
    fs.writeFileSync(socketPath, '');
    cleanups.push(() => {
      if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath);
    });

    const result = await checkHealth(socketPath);
    expect(result).toEqual({ status: 'stale_socket' });
  });

  it.skipIf(isWin32)('returns stale_socket after a listener has listened and closed leaving the socket file behind', async () => {
    const socketPath = makeTestSocketPath();
    const server = net.createServer();
    await listen(server, socketPath);
    // Close server but leave the file in place to simulate abnormal exit.
    await new Promise<void>((resolve) => server.close(() => resolve()));
    // Recreate the file in case Node cleaned it up on close.
    if (!fs.existsSync(socketPath)) fs.writeFileSync(socketPath, '');
    cleanups.push(() => {
      if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath);
    });

    const result = await checkHealth(socketPath);
    expect(result).toEqual({ status: 'stale_socket' });
  });
});
