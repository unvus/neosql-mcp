import { logger } from '../../../src/infra/logger.js';
import { describe, expect, it, vi } from 'vitest';
import { HttpClientError } from '../../../src/upstream/http-client.js';
import { callUpstreamTool, type UpstreamToolDeps } from '../../../src/mcp/tools/shared.js';
import { ensureDesktopReady } from '../../../src/upstream/desktop-readiness.js';

describe('callUpstreamTool desktop lifecycle handling', () => {
  it.each<{ label: string; state: unknown }>([
    { label: 'ready array', state: ['ready'] },
    { label: 'loading array', state: ['loading'] },
    { label: 'authentication array', state: ['authentication_required'] },
    { label: 'nested array', state: [['ready']] },
    { label: 'object', state: {} },
    { label: 'object with a non-callable toString', state: { toString: null } },
    { label: 'number', state: 1 },
    { label: 'null', state: null },
  ])(
    'rejects a $label project state before retrying or sending the operation',
    async ({ state }) => {
      const runtimeStatus = (projectState: unknown) => ({
        app: 'neosql',
        profile: 'prod',
        renderer: 'responsive',
        project: { state: projectState, projectId: 'A' },
      });
      const queryStatus = vi
        .fn()
        .mockResolvedValueOnce(runtimeStatus(state))
        .mockResolvedValue(runtimeStatus('ready'));
      const postRpc = vi.fn();
      const requestActivation = vi.fn();
      const checkInstallation = vi.fn();
      const result = await callUpstreamTool(
        {
          sessionId: 'malformed-state-test',
          postRpc,
          ensureDesktopReady: (context) =>
            ensureDesktopReady({
              ...context,
              socketPath: '/unused.sock',
              profile: 'prod',
              queryStatus,
              requestActivation,
              checkInstallation,
            }),
        },
        'list-connections',
        {},
      );

      expect(result.isError).toBe(true);
      expect(JSON.parse(result.content[0]!.text)).toEqual({
        status: 'status_check_failed',
        requestSent: false,
        message: expect.any(String),
        nextAction: expect.any(String),
      });
      expect(queryStatus).toHaveBeenCalledOnce();
      expect(postRpc).not.toHaveBeenCalled();
      expect(requestActivation).not.toHaveBeenCalled();
      expect(checkInstallation).not.toHaveBeenCalled();
    },
  );

  it('does not request activation again when an already-sent upstream request times out', async () => {
    const rpcCalls: string[] = [];
    const deps: UpstreamToolDeps = {
      postRpc: async (method) => {
        rpcCalls.push(method);
        throw new HttpClientError({ kind: 'timeout', message: 'Upstream request timed out.' });
      },
      sessionId: 'session-1',
      ensureDesktopReady: async () => ({ status: 'ready' }),
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
      ensureDesktopReady: async () => ({ status: 'ready' }),
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
      ensureDesktopReady: async () => ({ status: 'ready' }),
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
      ensureDesktopReady: async () => ({ status: 'ready' }),
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
      ensureDesktopReady: async () => ({ status: 'ready' }),
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
      ensureDesktopReady: async () => ({ status: 'ready' }),
    };

    const result = await callUpstreamTool(
      deps,
      'execute-query',
      { sql: 'SELECT 1' },
      {
        mapErrorResult: () => ({
          content: [{ type: 'text', text: 'tool-specific wrapper' }],
        }),
      },
    );

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

describe('T19/T20 preparation results and request context', () => {
  it.each([
    'installation_not_found',
    'installation_check_failed',
    'activation_failed',
    'project_not_selected',
    'project_load_failed',
    'authentication_required',
    'readiness_timeout',
    'user_action_required',
    'status_check_failed',
  ] as const)(
    'returns exactly four public fields for %s before sending any action',
    async (status) => {
      const postRpc = vi.fn();
      const result = await callUpstreamTool(
        {
          postRpc,
          sessionId: 's',
          ensureDesktopReady: async () => ({ status, reason: 'unlock_project' }),
        },
        'list-connections',
        {},
      );
      expect(result.isError).toBe(true);
      const payload = JSON.parse(result.content[0]!.text);
      expect(Object.keys(payload).sort()).toEqual([
        'message',
        'nextAction',
        'requestSent',
        'status',
      ]);
      expect(payload).toMatchObject({
        status,
        requestSent: false,
        message: expect.any(String),
        nextAction: expect.any(String),
      });
      expect(postRpc).not.toHaveBeenCalled();
    },
  );
  it.each([undefined, 0, 'progress-1'])('preserves progressToken %s', async (progressToken) => {
    const signal = new AbortController().signal;
    const sendNotification = vi.fn(async () => {});
    const postRpc = vi.fn(async () => ({ ok: true }) as never);
    const result = await callUpstreamTool(
      {
        postRpc,
        sessionId: 's',
        ensureDesktopReady: async (context) => {
          expect(context?.signal).toBe(signal);
          await context?.onState?.('project_loading');
          await context?.onState?.('ready');
          return { status: 'ready' };
        },
      },
      'list-connections',
      {},
      {
        request: {
          signal,
          sendNotification,
          ...(progressToken === undefined ? {} : { _meta: { progressToken } }),
        },
      },
    );
    expect(result.isError).toBeUndefined();
    expect(postRpc).toHaveBeenCalledOnce();
    expect(sendNotification).toHaveBeenCalledTimes(progressToken === undefined ? 0 : 2);
    if (progressToken !== undefined) {
      expect(sendNotification.mock.calls).toEqual([
        [
          {
            method: 'notifications/progress',
            params: { progressToken, progress: 1, message: 'Loading the selected project.' },
          },
        ],
        [
          {
            method: 'notifications/progress',
            params: {
              progressToken,
              progress: 2,
              message: 'The project is ready. Proceeding with the requested operation.',
            },
          },
        ],
      ]);
    }
  });
  it('T09 does not send the operation if ready returns after the deadline', async () => {
    const postRpc = vi.fn();
    const result = await callUpstreamTool(
      {
        postRpc,
        sessionId: 's',
        ensureDesktopReady: async () => ({ status: 'ready', deadline: performance.now() - 1 }),
      },
      'list-connections',
      {},
    );
    expect(JSON.parse(result.content[0]!.text).status).toBe('readiness_timeout');
    expect(postRpc).not.toHaveBeenCalled();
  });
  it('T18 propagates cancellation after ready without starting the operation', async () => {
    const controller = new AbortController();
    const postRpc = vi.fn();
    await expect(
      callUpstreamTool(
        {
          postRpc,
          sessionId: 's',
          ensureDesktopReady: async () => {
            controller.abort();
            return { status: 'ready' };
          },
        },
        'list-connections',
        {},
        { request: { signal: controller.signal, sendNotification: async () => {} } },
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(postRpc).not.toHaveBeenCalled();
  });
});

describe('preparation progress diagnostics', () => {
  it.each([undefined, 0, 'host-token'])(
    'records progress delivery for token %s without input data',
    async (token) => {
      const debug = vi.spyOn(logger, 'debug').mockImplementation(() => {});
      try {
        await callUpstreamTool(
          {
            sessionId: 'private-session',
            postRpc: async () => ({}) as never,
            ensureDesktopReady: async (context) => {
              await context?.onState?.('project_loading');
              return { status: 'ready' };
            },
          },
          'list-connections',
          { secret: 'private-input' },
          {
            request: {
              signal: new AbortController().signal,
              sendNotification: async () => {},
              ...(token === undefined ? {} : { _meta: { progressToken: token } }),
            },
          },
        );
        const events = debug.mock.calls.map(
          (call) => call[0] as unknown as Record<string, unknown>,
        );
        expect(events).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              event: 'preparation_started',
              progressTokenPresent: token !== undefined,
            }),
            expect.objectContaining({
              event: token === undefined ? 'progress_skipped' : 'progress_send_completed',
              state: 'project_loading',
            }),
            expect.objectContaining({ event: 'operation_completed' }),
          ]),
        );
        expect(new Set(events.map((event) => event.traceId)).size).toBe(1);
        expect(JSON.stringify(events)).not.toMatch(/private-input|private-session|host-token/);
      } finally {
        debug.mockRestore();
      }
    },
  );
  it('records send failure and preserves the readiness error handling', async () => {
    const debug = vi.spyOn(logger, 'debug').mockImplementation(() => {});
    const failure = new Error('private-transport-error');
    try {
      await callUpstreamTool(
        {
          sessionId: 's',
          postRpc: async () => ({}) as never,
          ensureDesktopReady: async (context) => {
            await expect(context?.onState?.('project_loading')).rejects.toBe(failure);
            return { status: 'ready' };
          },
        },
        'list-connections',
        {},
        {
          request: {
            signal: new AbortController().signal,
            _meta: { progressToken: 0 },
            sendNotification: async () => {
              throw failure;
            },
          },
        },
      );
      expect(debug).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'progress_send_failed', state: 'project_loading' }),
        expect.any(String),
      );
      expect(JSON.stringify(debug.mock.calls)).not.toContain('private-transport-error');
    } finally {
      debug.mockRestore();
    }
  });
});
