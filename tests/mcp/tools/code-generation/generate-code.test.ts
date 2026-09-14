import { describe, it, expect, vi } from 'vitest';
import { registerGenerateCodeTool } from '../../../../src/mcp/tools/code-generation/generate-code.js';
import { HttpClientError } from '../../../../src/upstream/http-client.js';
const policy = { version: 1, executionTimeoutMs: 60000, responseGraceMs: 5000 };
function setup() {
  let handler: any;
  let definition: any;
  const deps = {
    sessionId: 's',
    ensureDesktopReady: vi.fn().mockResolvedValue({ status: 'ready' }),
    postRpc: vi
      .fn()
      .mockResolvedValueOnce(policy)
      .mockResolvedValue({ status: 'completed', files: [] }),
  };
  registerGenerateCodeTool(
    {
      registerTool: (_name: string, def: any, fn: any) => {
        definition = def;
        handler = fn;
      },
    } as any,
    deps,
  );
  const run = (input = { tableNames: ['users'] }) =>
    handler(input, { signal: new AbortController().signal, sendNotification: vi.fn() });
  return { deps, run, definition };
}
describe('generate-code', () => {
  it('prepares once, queries policy and forwards coordinates with derived timeout', async () => {
    const { deps, run } = setup();
    await run({
      tableNames: ['users'],
      connectionId: '1',
      database: null,
      schema: 'public',
    } as any);
    expect(deps.ensureDesktopReady).toHaveBeenCalledTimes(1);
    expect(deps.postRpc).toHaveBeenNthCalledWith(
      1,
      'get-code-generation-policy',
      {},
      { timeoutMs: 1000 },
    );
    expect(deps.postRpc).toHaveBeenNthCalledWith(
      2,
      'generate-code',
      {
        sessionId: 's',
        input: { tableNames: ['users'], connectionId: '1', database: null, schema: 'public' },
        expectedTimeoutMs: 60000,
      },
      { timeoutMs: 65000 },
    );
  });
  it('validates a nonempty array without an upper count limit', () => {
    const { definition } = setup();
    expect(definition.inputSchema.tableNames.safeParse([]).success).toBe(false);
    expect(definition.inputSchema.tableNames.safeParse(['']).success).toBe(false);
    expect(
      definition.inputSchema.tableNames.safeParse(Array.from({ length: 100 }, (_, i) => `t${i}`))
        .success,
    ).toBe(true);
  });
  it('does not generate when policy is unsupported', async () => {
    const { deps, run } = setup();
    deps.postRpc.mockReset().mockResolvedValue({ ...policy, version: 2 });
    expect((await run()).isError).toBe(true);
    expect(deps.postRpc).toHaveBeenCalledTimes(1);
  });
  it.each(['completed', 'partial', 'skipped', 'needs-configuration', 'failed'])(
    'maps %s without losing results',
    async (status) => {
      const { deps, run } = setup();
      deps.postRpc
        .mockReset()
        .mockResolvedValueOnce(policy)
        .mockResolvedValue({ status, files: [], failures: [{ reason: 'render-error' }] });
      const result = await run();
      expect(result.isError === true).toBe(status === 'failed');
      expect(JSON.parse(result.content[0].text).status).toBe(status);
    },
  );
  it.each([
    ['rpc-error', 'timeout', 'timed-out'],
    ['timeout', undefined, 'outcome-unknown'],
    ['bad-response', undefined, 'outcome-unknown'],
    ['rpc-error', 'app-not-ready', 'outcome-unknown'],
    ['rpc-error', 'unavailable', 'outcome-unknown'],
  ])('maps %s %s to incomplete %s without retry', async (kind, rpcKind, status) => {
    const { deps, run } = setup();
    deps.postRpc
      .mockReset()
      .mockResolvedValueOnce(policy)
      .mockRejectedValue(
        new HttpClientError({
          kind: kind as any,
          ...(rpcKind ? { rpcKind } : {}),
          message: 'timeout',
        }),
      );
    const result = await run();
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text)).toMatchObject({ status, resultsComplete: false });
    expect(deps.postRpc).toHaveBeenCalledTimes(2);
  });
});

it('derives the timeout from a changed Electron policy', async () => {
  const { deps, run } = setup();
  deps.postRpc
    .mockReset()
    .mockResolvedValueOnce({ ...policy, executionTimeoutMs: 120000 })
    .mockResolvedValue({ status: 'completed' });
  await run();
  expect(deps.postRpc.mock.calls[1]?.[2]).toEqual({ timeoutMs: 125000 });
});
it('does not query policy or generate before Desktop readiness succeeds', async () => {
  const { deps, run } = setup();
  deps.ensureDesktopReady.mockResolvedValue({ status: 'readiness_timeout', lastState: 'starting' });
  expect((await run()).isError).toBe(true);
  expect(deps.postRpc).not.toHaveBeenCalled();
});
