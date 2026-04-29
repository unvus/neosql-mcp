import http from 'node:http';
import { HTTP_PATH } from './endpoint-resolver.js';

export type HealthStatus = 'running' | 'not_running' | 'stale_socket' | 'timeout';

export interface HealthResult {
  status: HealthStatus;
}

export interface CheckHealthOptions {
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 1000;

export const checkHealth = (
  socketPath: string,
  opts: CheckHealthOptions = {},
): Promise<HealthResult> => {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise((resolve) => {
    let settled = false;
    const settle = (result: HealthResult): void => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const req = http.request({
      socketPath,
      method: 'GET',
      path: HTTP_PATH,
      timeout: timeoutMs,
    });

    // Receiving any HTTP response means the upstream is alive and processing
    // requests. A successful TCP connect alone is not sufficient — a hung
    // electron-main process would still accept the socket but never reply.
    req.on('response', (res) => {
      res.resume(); // drain so the socket can be closed
      req.destroy();
      settle({ status: 'running' });
    });

    req.on('timeout', () => {
      req.destroy();
      settle({ status: 'timeout' });
    });

    req.on('error', (err: NodeJS.ErrnoException) => {
      const code = err.code;
      if (code === 'ENOENT') settle({ status: 'not_running' });
      else if (code === 'ECONNREFUSED' || code === 'ENOTSOCK') settle({ status: 'stale_socket' });
      else settle({ status: 'not_running' });
    });

    req.end();
  });
};
