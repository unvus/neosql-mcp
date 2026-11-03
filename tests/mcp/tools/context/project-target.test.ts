import { afterEach, describe, expect, it, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { resolveProjectTarget } from '../../../../src/mcp/tools/context/project-target.js';
import type { UpstreamToolDeps } from '../../../../src/mcp/tools/shared.js';
import { registerListConnectionsTool } from '../../../../src/mcp/tools/connection/list-connections.js';
import { registerListTablesTool } from '../../../../src/mcp/tools/schema/list-tables.js';
import { registerGetTableDetailsTool } from '../../../../src/mcp/tools/schema/get-table-details.js';
import { registerErdCreateTablesTool } from '../../../../src/mcp/tools/erd/erd-create-tables.js';
import { registerErdModifyTablesTool } from '../../../../src/mcp/tools/erd/erd-modify-tables.js';
import { registerExecuteQueryTool } from '../../../../src/mcp/tools/sql/execute-query.js';
import { registerGenerateCodeTool } from '../../../../src/mcp/tools/code-generation/generate-code.js';

describe('resolveProjectTarget', () => {
  it.each([
    [undefined, undefined, undefined],
    ['A', undefined, 'A'],
    [undefined, 'B', 'B'],
    ['B', 'B', 'B'],
  ])('targets configured=%s requested=%s as %s', (configured, requested, expected) => {
    expect(resolveProjectTarget(configured, requested)).toEqual({ ok: true, projectId: expected });
  });
  it('rejects a requested project that differs from --project-id', () => {
    expect(resolveProjectTarget('A', 'B')).toMatchObject({
      ok: false,
      payload: { status: 'project_conflict', requestSent: false },
    });
  });
});

describe('projectId input on project tools', () => {
  const cleanups: Array<() => Promise<void>> = [];
  afterEach(async () => {
    while (cleanups.length) await cleanups.pop()!();
  });

  const connect = async () => {
    const postRpc = vi.fn(async (method: string, _params?: unknown) =>
      (method === 'get-code-generation-policy'
        ? { version: 1, executionTimeoutMs: 60_000, responseGraceMs: 5_000 }
        : method === 'generate-code'
          ? { status: 'completed' }
          : {}) as never,
    );
    const ensureDesktopReady = vi.fn<NonNullable<UpstreamToolDeps['ensureDesktopReady']>>(
      async () => ({ status: 'ready' }),
    );
    const deps: UpstreamToolDeps = { sessionId: 's', postRpc, ensureDesktopReady };
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    for (const register of [
      registerListConnectionsTool,
      registerListTablesTool,
      registerGetTableDetailsTool,
      registerErdCreateTablesTool,
      registerErdModifyTablesTool,
      registerExecuteQueryTool,
      registerGenerateCodeTool,
    ]) {
      register(server, deps);
    }
    const [st, ct] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    const client = new Client({ name: 'test', version: '0.0.0' });
    await client.connect(ct);
    cleanups.push(() => client.close());
    return { client, postRpc, ensureDesktopReady };
  };

  it.each([
    ['list-connections', {}, {}],
    ['list-tables', { search: 'user' }, { search: 'user' }],
    ['get-table-details', { tableNames: ['users'] }, { tableNames: ['users'] }],
    ['erd-create-tables', { tableDefinitions: [] }, { tableDefinitions: [] }],
    ['erd-modify-tables', { alterations: [] }, { alterations: [] }],
    ['execute-query', { sql: 'SELECT 1' }, { sql: 'SELECT 1' }],
    ['generate-code', { tableNames: ['users'] }, { tableNames: ['users'] }],
  ])('%s targets projectId through context and strips it from input', async (name, args, input) => {
    const { client, postRpc, ensureDesktopReady } = await connect();

    const result = await client.callTool({ name, arguments: { ...args, projectId: ' B ' } });

    expect(result.isError, name).not.toBe(true);
    expect(ensureDesktopReady).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'B' }));
    const call = postRpc.mock.calls.find(([method]) => method === name);
    expect(call?.[1]).toEqual(
      expect.objectContaining({ sessionId: 's', input, context: { expectedProjectId: 'B' } }),
    );
  });
  it('rejects a blank projectId as invalid input', async () => {
    const { client, postRpc } = await connect();

    const result = await client.callTool({ name: 'list-tables', arguments: { projectId: '  ' } });

    expect(result.isError).toBe(true);
    expect((result.content as Array<{ text: string }>)[0]!.text).toContain('projectId must not be blank.');
    expect(postRpc).not.toHaveBeenCalled();
  });
});
