import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';

export const isWin32 = process.platform === 'win32';

// Keep paths short — POSIX UDS sun_path is limited to ~104 bytes (macOS).
export const makeTestSocketPath = (): string => {
  const id = randomBytes(4).toString('hex');
  if (isWin32) return `\\\\.\\pipe\\nm-test-${id}`;
  return path.join(os.tmpdir(), `nm-test-${id}.sock`);
};

export const closeServer = (server: net.Server | http.Server): Promise<void> =>
  new Promise((resolve) => {
    if (!server.listening) return resolve();
    const maybeHttp = server as http.Server & { closeAllConnections?: () => void };
    if (typeof maybeHttp.closeAllConnections === 'function') {
      maybeHttp.closeAllConnections();
    }
    server.close(() => resolve());
  });

export const listen = (
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

export const removeSocketFile = (socketPath: string): void => {
  if (isWin32) return;
  if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath);
};
