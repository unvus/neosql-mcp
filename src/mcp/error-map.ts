import { HttpClientError } from '../upstream/http-client.js';

export interface ToolErrorResult {
  [key: string]: unknown;
  isError: true;
  content: Array<{ type: 'text'; text: string }>;
}

export const toolErrorResult = (err: unknown): ToolErrorResult => ({
  isError: true,
  content: [{ type: 'text', text: messageForError(err) }],
});

const messageForError = (err: unknown): string => {
  if (!(err instanceof HttpClientError)) {
    return err instanceof Error ? err.message : String(err);
  }

  switch (err.kind) {
    case 'not-running':
    case 'stale-socket':
      return 'NeoSQL Desktop is not running.';
    case 'timeout':
      return 'No response from upstream.';
    case 'http-4xx':
      return `Bad request (${err.status ?? 'unknown'}): ${err.message}`;
    case 'http-5xx':
      return `Server error (${err.status ?? 'unknown'}): ${err.message}`;
    case 'rpc-error':
      return `Upstream RPC error (${err.rpcCode ?? 'unknown'}): ${err.message}`;
    case 'bad-response':
      return `Bad upstream response: ${err.message}`;
  }
};
