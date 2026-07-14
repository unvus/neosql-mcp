import { describe, expect, it, vi } from 'vitest';
import { HttpClientError } from '../../../src/upstream/http-client.js';
import { callUpstreamTool, type UpstreamToolDeps } from '../../../src/mcp/tools/shared.js';

describe('callUpstreamTool desktop lifecycle handling', () => {
  it('does not call upstream RPC when desktop activation was requested', async () => {
    const rpcCalls: string[] = [];
    const deps: UpstreamToolDeps = {
      postRpc: async (method) => {
        rpcCalls.push(method);
        return { ok: true } as never;
      },
      sessionId: 'session-1',
      ensureDesktopReady: async () => ({
        status: 'activation_requested',
        healthStatus: 'not_running',
        activation: {
          status: 'requested',
          target: {
            profile: 'prod',
            productName: 'NeoSQL',
            appId: 'com.unvus.neosql',
            activationUrl: 'neosql://mcp/activate',
          },
        },
        installation: {
          status: 'installed',
          platform: 'darwin',
          target: {
            profile: 'prod',
            productName: 'NeoSQL',
            appId: 'com.unvus.neosql',
            activationUrl: 'neosql://mcp/activate',
          },
          executablePath: '/Applications/NeoSQL.app/Contents/MacOS/NeoSQL',
          checkedExecutablePaths: ['/Applications/NeoSQL.app/Contents/MacOS/NeoSQL'],
        },
      }),
    };

    const result = await callUpstreamTool(deps, 'list-tables', {});

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0]?.text ?? '{}') as { status?: string };
    expect(payload.status).toBe('activation_requested');
    expect(rpcCalls).toEqual([]);
  });

  it('does not request activation again when an already-sent upstream request times out', async () => {
    const rpcCalls: string[] = [];
    const deps: UpstreamToolDeps = {
      postRpc: async (method) => {
        rpcCalls.push(method);
        throw new HttpClientError({ kind: 'timeout', message: 'Upstream request timed out.' });
      },
      sessionId: 'session-1',
      ensureDesktopReady: async () => ({ status: 'ready', healthStatus: 'running' }),
    };

    const result = await callUpstreamTool(deps, 'list-tables', {});

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0]?.text ?? '{}') as {
      status?: string;
      reason?: string;
    };
    expect(payload).toMatchObject({ status: 'unresponsive', reason: 'request_timeout' });
    expect(rpcCalls).toEqual(['list-tables']);
  });

  it('does not call upstream RPC when desktop is not installed', async () => {
    const rpcCalls: string[] = [];
    const deps: UpstreamToolDeps = {
      postRpc: async (method) => {
        rpcCalls.push(method);
        return { ok: true } as never;
      },
      sessionId: 'session-1',
      ensureDesktopReady: async () => ({
        status: 'not_installed',
        healthStatus: 'not_running',
        installation: {
          status: 'not_installed',
          platform: 'darwin',
          target: {
            profile: 'prod',
            productName: 'NeoSQL',
            appId: 'com.unvus.neosql',
            activationUrl: 'neosql://mcp/activate',
          },
          checkedExecutablePaths: [
            '/Applications/NeoSQL.app/Contents/MacOS/NeoSQL',
            '/Users/shock/Applications/NeoSQL.app/Contents/MacOS/NeoSQL',
          ],
          installGuideUrl: 'https://neosql.unvus.com/ko/docs/install',
        },
      }),
    };

    const result = await callUpstreamTool(deps, 'list-tables', {});

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0]?.text ?? '{}') as {
      status?: string;
      installGuideUrl?: string;
      installation?: { checkedExecutablePaths?: string[] };
    };
    expect(payload.status).toBe('not_installed');
    expect(payload.installGuideUrl).toBe('https://neosql.unvus.com/ko/docs/install');
    expect(payload.installation?.checkedExecutablePaths).toEqual([
      '/Applications/NeoSQL.app/Contents/MacOS/NeoSQL',
      '/Users/shock/Applications/NeoSQL.app/Contents/MacOS/NeoSQL',
    ]);
    expect(rpcCalls).toEqual([]);
  });

  it('maps app-not-ready JSON-RPC errors to the shared desktop lifecycle result', async () => {
    const deps: UpstreamToolDeps = {
      postRpc: async () => {
        throw new HttpClientError({
          kind: 'rpc-error',
          rpcCode: -32002,
          rpcKind: 'app-not-ready',
          message: 'NeoSQL renderer is not ready.',
        });
      },
      sessionId: 'session-1',
      ensureDesktopReady: async () => ({ status: 'ready', healthStatus: 'running' }),
    };

    const result = await callUpstreamTool(deps, 'list-tables', {});

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0]?.text ?? '{}') as { status?: string };
    expect(payload.status).toBe('app_not_ready');
  });

  it('maps unavailable JSON-RPC errors to the shared desktop lifecycle result', async () => {
    const deps: UpstreamToolDeps = {
      postRpc: async () => {
        throw new HttpClientError({
          kind: 'rpc-error',
          rpcCode: -32002,
          rpcKind: 'unavailable',
          message: 'Timed out waiting for project session initialization.',
        });
      },
      sessionId: 'session-1',
      ensureDesktopReady: async () => ({ status: 'ready', healthStatus: 'running' }),
    };

    const result = await callUpstreamTool(deps, 'list-tables', {});

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0]?.text ?? '{}') as {
      status?: string;
      reason?: string;
    };
    expect(payload).toMatchObject({ status: 'app_not_ready', reason: 'unavailable' });
  });

  it('maps unauthenticated JSON-RPC errors to a sign-in required tool result', async () => {
    const requestDesktopFocus = vi.fn(async () => undefined);
    const deps: UpstreamToolDeps = {
      postRpc: async () => {
        throw new HttpClientError({
          kind: 'rpc-error',
          rpcCode: -32001,
          rpcKind: 'unauthenticated',
          message: 'User is not authenticated. Sign in to the NeoSQL app first.',
        });
      },
      sessionId: 'session-1',
      ensureDesktopReady: async () => ({ status: 'ready', healthStatus: 'running' }),
      requestDesktopFocus,
    };

    const result = await callUpstreamTool(deps, 'list-tables', {});

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0]?.text ?? '{}') as {
      status?: string;
      reason?: string;
      message?: string;
    };
    expect(payload).toMatchObject({
      status: 'unauthenticated',
      reason: 'unauthenticated',
    });
    expect(payload.message).toMatch(/Sign in to NeoSQL Desktop/);
    expect(requestDesktopFocus).toHaveBeenCalledTimes(1);
  });

  it('keeps the unauthenticated tool result when desktop focus request fails', async () => {
    const requestDesktopFocusMock = vi.fn(() => {
      throw new Error('focus failed');
    });
    const requestDesktopFocus = requestDesktopFocusMock as unknown as () => Promise<void>;
    const deps: UpstreamToolDeps = {
      postRpc: async () => {
        throw new HttpClientError({
          kind: 'rpc-error',
          rpcCode: -32001,
          rpcKind: 'unauthenticated',
          message: 'User is not authenticated. Sign in to the NeoSQL app first.',
        });
      },
      sessionId: 'session-1',
      ensureDesktopReady: async () => ({ status: 'ready', healthStatus: 'running' }),
      requestDesktopFocus,
    };

    const result = await callUpstreamTool(deps, 'list-tables', {});

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0]?.text ?? '{}') as {
      status?: string;
      reason?: string;
      focus?: unknown;
    };
    expect(payload).toMatchObject({
      status: 'unauthenticated',
      reason: 'unauthenticated',
    });
    expect(payload.focus).toBeUndefined();
    expect(requestDesktopFocusMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    'No project is selected in NeoSQL Desktop. Select a project and try again.',
    'NeoSQL Desktop에서 프로젝트가 선택되지 않았습니다. 프로젝트를 선택한 뒤 다시 시도하세요.',
  ])('preserves a project-not-selected renderer message exactly: %s', async (message) => {
    const deps: UpstreamToolDeps = {
      postRpc: async () => {
        throw new HttpClientError({
          kind: 'rpc-error',
          rpcCode: -32002,
          rpcKind: 'project-not-selected',
          message,
        });
      },
      sessionId: 'session-1',
      ensureDesktopReady: async () => ({ status: 'ready', healthStatus: 'running' }),
    };

    const result = await callUpstreamTool(deps, 'execute-query', { sql: 'SELECT 1' }, {
      mapErrorResult: () => ({
        content: [{ type: 'text', text: 'tool-specific wrapper' }],
      }),
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toBe(message);
  });
});

describe('callUpstreamTool input forwarding', () => {
  it('forwards omitted coordinates without a context envelope', async () => {
    let receivedParams: unknown;
    const deps: UpstreamToolDeps = {
      postRpc: async (_method, params) => {
        receivedParams = params;
        return { ok: true } as never;
      },
      sessionId: 'session-1',
    };

    await callUpstreamTool(deps, 'list-tables', {});

    expect(receivedParams).toEqual({ sessionId: 'session-1', input: {} });
  });

  it('forwards an explicit coordinate tuple in the input envelope', async () => {
    let receivedParams: unknown;
    const deps: UpstreamToolDeps = {
      postRpc: async (_method, params) => {
        receivedParams = params;
        return { ok: true } as never;
      },
      sessionId: 'session-1',
    };

    await callUpstreamTool(deps, 'list-tables', {
      connectionId: '88',
      database: 'analytics',
      schema: 'public',
    });

    expect(receivedParams).toEqual({
      sessionId: 'session-1',
      input: { connectionId: '88', database: 'analytics', schema: 'public' },
    });
  });
});
