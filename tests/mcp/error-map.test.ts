import { describe, it, expect } from 'vitest';
import { toolErrorResult } from '../../src/mcp/error-map.js';
import { HttpClientError } from '../../src/upstream/http-client.js';

const expectErrorShape = (result: unknown, messageMatch: string | RegExp): void => {
  const r = result as {
    isError?: boolean;
    content?: Array<{ type: string; text: string }>;
  };
  expect(r.isError).toBe(true);
  expect(r.content).toHaveLength(1);
  expect(r.content?.[0]?.type).toBe('text');
  const text = r.content?.[0]?.text ?? '';
  if (typeof messageMatch === 'string') {
    expect(text).toContain(messageMatch);
  } else {
    expect(text).toMatch(messageMatch);
  }
};

describe('toolErrorResult', () => {
  it('maps not-running to "NeoSQL Desktop is not running."', () => {
    const result = toolErrorResult(
      new HttpClientError({ kind: 'not-running', message: 'ENOENT' }),
    );
    expectErrorShape(result, 'NeoSQL Desktop is not running.');
  });

  it('maps stale-socket to the same not-running message', () => {
    const result = toolErrorResult(
      new HttpClientError({ kind: 'stale-socket', message: 'ECONNREFUSED' }),
    );
    expectErrorShape(result, 'NeoSQL Desktop is not running.');
  });

  it('maps timeout to "No response from upstream."', () => {
    const result = toolErrorResult(
      new HttpClientError({ kind: 'timeout', message: 'timed out' }),
    );
    expectErrorShape(result, 'No response from upstream.');
  });

  it('maps http-4xx to a "Bad request (400)"-style message', () => {
    const result = toolErrorResult(
      new HttpClientError({ kind: 'http-4xx', message: 'bad', status: 400 }),
    );
    expectErrorShape(result, /Bad request \(400\)/);
  });

  it('maps http-5xx to a "Server error (500)"-style message', () => {
    const result = toolErrorResult(
      new HttpClientError({ kind: 'http-5xx', message: 'oops', status: 500 }),
    );
    expectErrorShape(result, /Server error \(500\)/);
  });

  it('preserves the rpc-error message and code', () => {
    const result = toolErrorResult(
      new HttpClientError({
        kind: 'rpc-error',
        message: 'method not found',
        rpcCode: -32601,
      }),
    );
    expectErrorShape(result, 'method not found');
    const r = result as { content: Array<{ text: string }> };
    expect(r.content[0]?.text).toMatch(/-32601/);
  });
});
