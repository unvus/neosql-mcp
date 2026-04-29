import http from 'node:http';
import { HTTP_PATH } from './endpoint-resolver.js';

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
  cause?: unknown;
}

export class HttpClientError extends Error {
  readonly kind: HttpClientErrorKind;
  readonly status: number | undefined;
  readonly rpcCode: number | undefined;

  constructor(opts: HttpClientErrorOptions) {
    super(opts.message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = 'HttpClientError';
    this.kind = opts.kind;
    this.status = opts.status;
    this.rpcCode = opts.rpcCode;
  }
}

export interface PostRpcOptions {
  socketPath: string;
  method: string;
  params?: unknown;
  id?: string | number;
  timeoutMs?: number;
}

interface JsonRpcSuccess<T> {
  jsonrpc?: '2.0';
  id?: string | number | null;
  result: T;
}

interface JsonRpcFailure {
  jsonrpc?: '2.0';
  id?: string | number | null;
  error: {
    code: number;
    message: string;
  };
}

let nextId = 1;

export const postRpc = async <T = unknown>(opts: PostRpcOptions): Promise<T> => {
  const id = opts.id ?? nextId++;
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id,
    method: opts.method,
    params: opts.params,
  });

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const settleReject = (err: unknown): void => {
      if (settled) return;
      settled = true;
      reject(err);
    };
    const settleResolve = (value: T): void => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

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
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });
        res.on('end', () => {
          const responseBody = Buffer.concat(chunks).toString('utf8');
          const status = res.statusCode ?? 0;

          if (status >= 400 && status < 500) {
            settleReject(
              new HttpClientError({
                kind: 'http-4xx',
                status,
                message: responseBody || `HTTP ${status}`,
              }),
            );
            return;
          }
          if (status >= 500) {
            settleReject(
              new HttpClientError({
                kind: 'http-5xx',
                status,
                message: responseBody || `HTTP ${status}`,
              }),
            );
            return;
          }
          if (status < 200 || status >= 300) {
            settleReject(
              new HttpClientError({
                kind: 'bad-response',
                status,
                message: `Unexpected HTTP status ${status}`,
              }),
            );
            return;
          }

          let parsed: JsonRpcSuccess<T> | JsonRpcFailure;
          try {
            parsed = JSON.parse(responseBody) as JsonRpcSuccess<T> | JsonRpcFailure;
          } catch (cause) {
            settleReject(
              new HttpClientError({
                kind: 'bad-response',
                message: 'Upstream response body is not valid JSON.',
                cause,
              }),
            );
            return;
          }

          if ('error' in parsed) {
            settleReject(
              new HttpClientError({
                kind: 'rpc-error',
                rpcCode: parsed.error.code,
                message: parsed.error.message,
              }),
            );
            return;
          }

          if (!('result' in parsed)) {
            settleReject(
              new HttpClientError({
                kind: 'bad-response',
                message: 'Upstream JSON-RPC response is missing result.',
              }),
            );
            return;
          }

          settleResolve(parsed.result);
        });
      },
    );

    req.on('error', (cause: NodeJS.ErrnoException) => {
      if (cause instanceof HttpClientError) {
        settleReject(cause);
        return;
      }

      settleReject(mapRequestError(cause));
    });

    req.setTimeout(opts.timeoutMs ?? 30_000, () => {
      req.destroy(
        new HttpClientError({
          kind: 'timeout',
          message: 'Upstream request timed out.',
        }),
      );
    });

    req.end(body);
  });
};

const mapRequestError = (cause: NodeJS.ErrnoException): HttpClientError => {
  if (cause.code === 'ENOENT') {
    return new HttpClientError({
      kind: 'not-running',
      message: cause.message,
      cause,
    });
  }

  if (cause.code === 'ECONNREFUSED' || cause.code === 'ENOTSOCK') {
    return new HttpClientError({
      kind: 'stale-socket',
      message: cause.message,
      cause,
    });
  }

  return new HttpClientError({
    kind: 'bad-response',
    message: cause.message,
    cause,
  });
};
