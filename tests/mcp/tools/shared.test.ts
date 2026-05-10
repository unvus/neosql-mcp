import { describe, expect, it } from 'vitest';
import { HttpClientError } from '../../../src/upstream/http-client.js';
import { callUpstreamTool, type UpstreamToolDeps } from '../../../src/mcp/tools/shared.js';
import { createContextStore } from '../../../src/mcp/tools/context/store.js';

describe('callUpstreamTool desktop lifecycle handling', () => {
  it('does not call upstream RPC when desktop activation was requested', async () => {
    const rpcCalls: string[] = [];
    const deps: UpstreamToolDeps = {
      postRpc: async (method) => {
        rpcCalls.push(method);
        return { ok: true } as never;
      },
      contextStore: createContextStore(),
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
      }),
    };

    const result = await callUpstreamTool(deps, 'schema.listTables', {});

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
      contextStore: createContextStore(),
      sessionId: 'session-1',
      ensureDesktopReady: async () => ({ status: 'ready', healthStatus: 'running' }),
    };

    const result = await callUpstreamTool(deps, 'schema.listTables', {});

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0]?.text ?? '{}') as {
      status?: string;
      reason?: string;
    };
    expect(payload).toMatchObject({ status: 'unresponsive', reason: 'request_timeout' });
    expect(rpcCalls).toEqual(['schema.listTables']);
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
      contextStore: createContextStore(),
      sessionId: 'session-1',
      ensureDesktopReady: async () => ({ status: 'ready', healthStatus: 'running' }),
    };

    const result = await callUpstreamTool(deps, 'schema.listTables', {});

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0]?.text ?? '{}') as { status?: string };
    expect(payload.status).toBe('app_not_ready');
  });
});
