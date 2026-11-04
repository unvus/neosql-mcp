import { afterEach, describe, expect, it, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { HttpClientError } from '../../../../src/upstream/http-client.js';
import { registerListProjectsTool } from '../../../../src/mcp/tools/project/list-projects.js';
import { registerCreateProjectTool } from '../../../../src/mcp/tools/project/create-project.js';
import type { UpstreamToolDeps } from '../../../../src/mcp/tools/shared.js';

const projectList = {
  projects: [
    { projectId: 'A', name: 'Shop', projectType: 'local', lastAccessedDt: '2026-11-01T00:00:00.000Z', active: true },
  ],
  activeProjectId: 'A',
  accountProjects: 'signed_out',
};
const created = {
  status: 'created',
  projectId: 'N',
  name: 'Blog',
  projectType: 'local',
  dataSource: 'PostgreSQL',
  connection: { connectionId: '1', name: 'default', databaseName: 'postgres', schemaName: 'default', designOnly: true },
  navigated: true,
};

describe('project tools', () => {
  const cleanups: Array<() => Promise<void>> = [];
  afterEach(async () => {
    while (cleanups.length) await cleanups.pop()!();
  });

  const connect = async (overrides: Partial<UpstreamToolDeps> = {}) => {
    const postRpc = vi.fn();
    const ensureDesktopReady = vi.fn<NonNullable<UpstreamToolDeps['ensureDesktopReady']>>(
      async () => ({ status: 'ready' }),
    );
    const deps: UpstreamToolDeps = { sessionId: 's', postRpc, ensureDesktopReady, ...overrides };
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerListProjectsTool(server, deps);
    registerCreateProjectTool(server, deps);
    const [st, ct] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    const client = new Client({ name: 'test', version: '0.0.0' });
    await client.connect(ct);
    cleanups.push(() => client.close());
    return { client, postRpc, ensureDesktopReady };
  };
  const text = (result: Awaited<ReturnType<Client['callTool']>>) =>
    (result.content as Array<{ text: string }>)[0]!.text;

  describe('list-projects', () => {
    it.each([
      [undefined, null],
      ['A', 'A'],
    ])('adds configuredProjectId %s to the app result', async (projectId, configured) => {
      const { client, postRpc, ensureDesktopReady } = await connect(
        projectId === undefined ? {} : { projectId },
      );
      postRpc.mockResolvedValue(projectList);

      const result = await client.callTool({ name: 'list-projects', arguments: {} });

      expect(result.isError).not.toBe(true);
      expect(JSON.parse(text(result))).toEqual({ ...projectList, configuredProjectId: configured });
      expect(postRpc).toHaveBeenCalledWith('list-projects', { sessionId: 's', input: {} }, { timeoutMs: 30_000 });
      expect(ensureDesktopReady).toHaveBeenCalledWith(expect.objectContaining({ appOnly: true }));
      expect(ensureDesktopReady.mock.calls[0]![0]).not.toHaveProperty('projectId');
    });
  });

  describe('create-project', () => {
    it('sends the trimmed input with app-only preparation and the 90 s timeout', async () => {
      const { client, postRpc, ensureDesktopReady } = await connect();
      postRpc.mockResolvedValue(created);

      const result = await client.callTool({
        name: 'create-project',
        arguments: { name: '  Blog ', dataSource: ' PostgreSQL ' },
      });

      expect(result.isError).not.toBe(true);
      expect(JSON.parse(text(result))).toEqual(created);
      expect(postRpc).toHaveBeenCalledWith(
        'create-project',
        { sessionId: 's', input: { name: 'Blog', dataSource: 'PostgreSQL' } },
        { timeoutMs: 90_000, signal: expect.any(AbortSignal) },
      );
      expect(ensureDesktopReady).toHaveBeenCalledWith(expect.objectContaining({ appOnly: true }));
    });
    it('rejects blank input before contacting the app', async () => {
      const { client, postRpc } = await connect();
      for (const args of [{ name: ' ', dataSource: 'MySQL' }, { name: 'Blog', dataSource: '' }]) {
        const result = await client.callTool({ name: 'create-project', arguments: args });
        expect(result.isError).toBe(true);
        expect(text(result)).toContain('-32602');
      }
      expect(postRpc).not.toHaveBeenCalled();
    });
    it('refuses to create a project when --project-id fixes the target', async () => {
      const { client, postRpc, ensureDesktopReady } = await connect({ projectId: 'A' });

      const result = await client.callTool({
        name: 'create-project',
        arguments: { name: 'Blog', dataSource: 'MySQL' },
      });

      expect(result.isError).toBe(true);
      expect(JSON.parse(text(result))).toEqual({
        status: 'project_conflict',
        message:
          "This NeoSQL MCP server is configured for project 'A' (--project-id), so its tools could not use a newly created project. No project was created.",
        nextAction:
          'Use the configured project, or remove --project-id from the MCP client configuration to create and use new projects.',
        requestSent: false,
      });
      expect(ensureDesktopReady).not.toHaveBeenCalled();
      expect(postRpc).not.toHaveBeenCalled();
    });
    it.each(['invalid-params', 'unavailable', 'forbidden'])(
      'keeps the app message when nothing was created (%s)',
      async (rpcKind) => {
        const { client, postRpc } = await connect();
        postRpc.mockRejectedValue(
          new HttpClientError({ kind: 'rpc-error', rpcKind, rpcCode: -32002, message: `app says ${rpcKind}` }),
        );

        const result = await client.callTool({
          name: 'create-project',
          arguments: { name: 'Blog', dataSource: 'MySQL' },
        });

        expect(result.isError).toBe(true);
        expect(JSON.parse(text(result))).toEqual({
          status: 'not_created',
          reason: rpcKind,
          message: `app says ${rpcKind}`,
        });
      },
    );
    it('asks to check list-projects when creation failed inside the app', async () => {
      const { client, postRpc } = await connect();
      postRpc.mockRejectedValue(
        new HttpClientError({ kind: 'rpc-error', rpcKind: 'handler-error', rpcCode: -32000, message: 'disk full' }),
      );

      const result = await client.callTool({
        name: 'create-project',
        arguments: { name: 'Blog', dataSource: 'MySQL' },
      });

      expect(JSON.parse(text(result))).toEqual({
        status: 'failed',
        message: 'disk full',
        nextAction: 'Call list-projects to check whether the project exists before trying again.',
      });
    });
    it.each([
      new HttpClientError({ kind: 'timeout', message: 'Upstream request timed out.' }),
      new HttpClientError({ kind: 'rpc-error', rpcKind: 'timeout', rpcCode: -32001, message: 'renderer timeout' }),
    ])('reports an unknown outcome on timeout without retrying', async (error) => {
      const { client, postRpc } = await connect();
      postRpc.mockRejectedValue(error);

      const result = await client.callTool({
        name: 'create-project',
        arguments: { name: 'Blog', dataSource: 'MySQL' },
      });

      expect(result.isError).toBe(true);
      expect(JSON.parse(text(result))).toMatchObject({
        status: 'outcome_unknown',
        nextAction: 'Call list-projects to check whether the project exists before trying again.',
      });
      expect(postRpc).toHaveBeenCalledOnce();
    });
  });
});
