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
      arguments: { projectId: 'proj-1', schema: 'public', ddlExecute: true },
    });

    expect(result.isError).not.toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0]?.text ?? '{}') as {
      context: { projectId?: string; schema?: string; ddlExecute?: boolean };
    };
    expect(data.context.projectId).toBe('proj-1');
    expect(data.context.schema).toBe('public');
    expect(data.context.ddlExecute).toBe(true);
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
      context: { projectId?: string; connectionId?: string; schema?: string };
    };
    expect(data.context).toMatchObject({
      projectId: 'proj-1',
      connectionId: '0',
      schema: 'public',
    });
  });

  it('stores false boolean values as explicit context values', async () => {
    const server = createServer();
    const [st, ct] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    const client = new Client({ name: 'test', version: '0.0.0' });
    await client.connect(ct);
    cleanups.push(() => client.close());

    await client.callTool({
      name: 'setContext',
      arguments: { ddlExecute: true, autoCommit: true },
    });
    const result = await client.callTool({
      name: 'setContext',
      arguments: { ddlExecute: false, autoCommit: false },
    });

    expect(result.isError).not.toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0]?.text ?? '{}') as {
      context: { ddlExecute?: boolean; autoCommit?: boolean };
    };
    expect(data.context.ddlExecute).toBe(false);
    expect(data.context.autoCommit).toBe(false);
  });
});
