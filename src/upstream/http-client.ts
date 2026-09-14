import http from 'node:http';
import { HTTP_PATH } from './endpoint-resolver.js';
import { logger } from '../infra/logger.js';

export type HttpClientErrorKind =
  | 'not-running'
  | 'stale-socket'
  | 'timeout'
  | 'http-4xx'
  | 'http-5xx'
  | 'rpc-error'
  | 'bad-response';

export interface HttpClientErrorOptions {
  kind: HttpClientErrorKind;
  message: string;
  status?: number;
  rpcCode?: number;
  rpcKind?: string;
  cause?: unknown;
}

export class HttpClientError extends Error {
  readonly kind: HttpClientErrorKind;
  readonly status: number | undefined;
  readonly rpcCode: number | undefined;
  readonly rpcKind: string | undefined;

  constructor(opts: HttpClientErrorOptions) {
    super(opts.message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = 'HttpClientError';
    this.kind = opts.kind;
    this.status = opts.status;
    this.rpcCode = opts.rpcCode;
    this.rpcKind = opts.rpcKind;
  }
}

export interface PostRpcOptions {
  socketPath: string;
  method: string;
  params?: unknown;
  /**
   * JSON-RPC request id for correlating the Electron response with this request.
   * `postRpc` always sends one because it waits for a response; omitted ids are
   * JSON-RPC notifications and must not produce a response.
   */
  id?: string | number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

let nextId = 1;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export const postRpc = async <T = unknown>(opts: PostRpcOptions): Promise<T> => {
  opts.signal?.throwIfAborted();
  const id = opts.id ?? nextId++;
  const body = JSON.stringify({ jsonrpc: '2.0', id, method: opts.method, params: opts.params });
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      req.destroy();
      reject(error);
    };
    const bad = (message: string) => fail(new HttpClientError({ kind: 'bad-response', message }));
    const onAbort = () => fail(opts.signal?.reason);
    const req = http.request(
      {
        socketPath: opts.socketPath,
        method: 'POST',
        path: HTTP_PATH,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        if (settled) {
          res.destroy();
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => {
          if (!settled) chunks.push(chunk);
        });
        res.on('error', () => bad('Upstream response stream failed.'));
        res.on('aborted', () => bad('Upstream response ended prematurely.'));
        res.on('end', () => {
          if (settled) return;
          const status = res.statusCode ?? 0;
          const responseBody = Buffer.concat(chunks).toString('utf8');
          if (status < 200 || status >= 300) {
            fail(
              new HttpClientError({
                kind: status >= 500 ? 'http-5xx' : status >= 400 ? 'http-4xx' : 'bad-response',
                status,
                message: responseBody || `HTTP ${status}`,
              }),
            );
            return;
          }
          let parsed: unknown;
          try {
            parsed = JSON.parse(responseBody);
          } catch {
            bad('Upstream response body is not valid JSON.');
            return;
          }
          if (isRecord(parsed) && parsed.id !== id) {
            bad('Upstream JSON-RPC response id does not match the request id.');
            return;
          }
          if (
            !isRecord(parsed) ||
            parsed.jsonrpc !== '2.0' ||
            'result' in parsed === 'error' in parsed
          ) {
            bad('Upstream JSON-RPC response envelope or id is invalid.');
            return;
          }
          if ('error' in parsed) {
            const error = parsed.error;
            if (
              !isRecord(error) ||
              !Number.isInteger(error.code) ||
              typeof error.message !== 'string' ||
              (error.data !== undefined &&
                (!isRecord(error.data) ||
                  (error.data.kind !== undefined && typeof error.data.kind !== 'string')))
            ) {
              bad('Upstream JSON-RPC error is invalid.');
              return;
            }
            const rpcKind = isRecord(error.data)
              ? (error.data.kind as string | undefined)
              : undefined;
            fail(
              new HttpClientError({
                kind: 'rpc-error',
                rpcCode: error.code as number,
                message: error.message,
                ...(rpcKind === undefined ? {} : { rpcKind }),
              }),
            );
            return;
          }
          settled = true;
          cleanup();
          resolve(parsed.result as T);
        });
      },
    );
    req.on('error', (cause: NodeJS.ErrnoException) => {
      if (settled) return;
      logger.error({ component: 'McpRpc', error: cause.message }, 'POST request failed');
      fail(
        new HttpClientError({
          kind:
            cause.code === 'ENOENT'
              ? 'not-running'
              : cause.code === 'ECONNREFUSED'
                ? 'stale-socket'
                : 'bad-response',
          message: cause.message,
          cause,
        }),
      );
    });
    // Absolute lifetime, not socket inactivity: trickling responses cannot extend it.
    timer = setTimeout(
      () =>
        fail(
          new HttpClientError({
            kind: 'timeout',
            message: 'Upstream request timed out.',
          }),
        ),
      opts.timeoutMs ?? 30_000,
    );
    opts.signal?.addEventListener('abort', onAbort, { once: true });
    if (opts.signal?.aborted) {
      onAbort();
      return;
    }
    req.end(body);
  });
};
