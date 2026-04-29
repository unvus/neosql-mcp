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

export const postRpc = async <T = unknown>(_opts: PostRpcOptions): Promise<T> => {
  throw new Error('postRpc: not implemented');
};
