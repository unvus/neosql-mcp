import { describe, it, expect, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../../src/mcp/server.js';
import { mcpSessionId } from '../../src/mcp/session.js';

describe('createServer', () => {
  let client: Client | undefined;

  afterEach(async () => {
    if (client) {
      await client.close();
      client = undefined;
    }
  });

  const connectClientToServer = async () => {
    const server = createServer();
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(clientTransport);
    return { server };
  };

  it('exposes the ping tool in tools/list', async () => {
    await connectClientToServer();
    const result = await client!.listTools();
    const toolNames = result.tools.map((t) => t.name);
    expect(toolNames).toContain('ping');
  });

  it('returns "pong" when the ping tool is called', async () => {
    await connectClientToServer();
    const result = await client!.callTool({ name: 'ping', arguments: {} });

    expect(result.isError).not.toBe(true);
    const content = result.content as Array<{ type: string; text?: string }>;
    expect(content).toHaveLength(1);
    expect(content[0]?.type).toBe('text');
    expect(content[0]?.text).toBe('pong');
  });

  it('returns the process-scoped mcpSessionId when getMcpSessionId is called', async () => {
    await connectClientToServer();
    const first = await client!.callTool({ name: 'getMcpSessionId', arguments: {} });
    const second = await client!.callTool({ name: 'getMcpSessionId', arguments: {} });

    expect(first.isError).not.toBe(true);
    expect(second.isError).not.toBe(true);
    const firstContent = first.content as Array<{ type: string; text?: string }>;
    const secondContent = second.content as Array<{ type: string; text?: string }>;
    expect(firstContent[0]?.text).toBe(mcpSessionId);
    expect(secondContent[0]?.text).toBe(mcpSessionId);
    expect(firstContent[0]?.text).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('exposes the 9 ported embedded-server tools plus local test tools in tools/list', async () => {
    await connectClientToServer();
    const result = await client!.listTools();
    const toolNames = new Set(result.tools.map((t) => t.name));
    expect(toolNames).toEqual(
      new Set([
        'ping',
        'getMcpSessionId',
        'generateCode',
        'listTables',
        'getTableDetails',
        'setContext',
        'getContext',
        'getContextHelp',
        'createTables',
        'modifyTables',
        'executeQuery',
      ]),
    );
  });
});
