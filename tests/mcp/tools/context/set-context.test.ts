import { describe, it, expect, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../../../../src/mcp/server.js';

describe('setContext tool', () => {
  const cleanups: Array<() => Promise<void> | void> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      const fn = cleanups.pop();
      if (fn) await fn();
    }
  });

  it('updates the in-memory context and reflects new values in the response', async () => {
    const server = createServer();
    const [st, ct] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    const client = new Client({ name: 'test', version: '0.0.0' });
    await client.connect(ct);
    cleanups.push(() => client.close());

    const result = await client.callTool({
      name: 'setContext',
      arguments: { projectId: 'proj-1', schema: 'public' },
    });

    expect(result.isError).not.toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0]?.text ?? '{}') as {
      success?: boolean;
      message?: string;
      context: { projectId?: string; schema?: string };
    };
    expect(data.success).toBe(true);
    expect(data.message).toBe('Context updated successfully');
    expect(data.context.projectId).toBe('proj-1');
    expect(data.context.schema).toBe('public');
  });

  it('returns the existing context in the success envelope when called without arguments', async () => {
    const server = createServer();
    const [st, ct] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    const client = new Client({ name: 'test', version: '0.0.0' });
    await client.connect(ct);
    cleanups.push(() => client.close());

    await client.callTool({
      name: 'setContext',
      arguments: {
        projectId: '35c1fe0d425a428a92b4c71eaaeacc26',
        connectionId: '57',
        schema: 'skrulldb',
      },
    });
    const result = await client.callTool({
      name: 'setContext',
      arguments: {},
    });

    expect(result.isError).not.toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0]?.text ?? '{}') as {
      success?: boolean;
      message?: string;
      context: {
        projectId?: string;
        connectionId?: string;
        schema?: string;
      };
    };
    expect(data).toEqual({
      success: true,
      message: 'Context updated successfully',
      context: {
        projectId: '35c1fe0d425a428a92b4c71eaaeacc26',
        connectionId: '57',
        schema: 'skrulldb',
      },
    });
  });

  it('keeps existing string values when blank strings are provided', async () => {
    const server = createServer();
    const [st, ct] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    const client = new Client({ name: 'test', version: '0.0.0' });
    await client.connect(ct);
    cleanups.push(() => client.close());

    await client.callTool({
      name: 'setContext',
      arguments: { projectId: 'proj-1', connectionId: '0', schema: 'public' },
    });
    const result = await client.callTool({
      name: 'setContext',
      arguments: { projectId: '', connectionId: '   ', schema: '' },
    });

    expect(result.isError).not.toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0]?.text ?? '{}') as {
      success?: boolean;
      message?: string;
      context: { projectId?: string; connectionId?: string; schema?: string };
    };
    expect(data.success).toBe(true);
    expect(data.message).toBe('Context updated successfully');
    expect(data.context).toMatchObject({
      projectId: 'proj-1',
      connectionId: '0',
      schema: 'public',
    });
  });

  it('ignores removed commit and DDL execution context fields', async () => {
    const server = createServer();
    const [st, ct] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    const client = new Client({ name: 'test', version: '0.0.0' });
    await client.connect(ct);
    cleanups.push(() => client.close());

    const result = await client.callTool({
      name: 'setContext',
      arguments: { ddlExecute: true, autoCommit: true },
    });

    expect(result.isError).not.toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0]?.text ?? '{}') as {
      success?: boolean;
      context: Record<string, unknown>;
    };
    expect(data.success).toBe(true);
    expect(data.context).not.toHaveProperty('ddlExecute');
    expect(data.context).not.toHaveProperty('autoCommit');
  });
});
