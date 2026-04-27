import { describe, it, expect, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from './server.js';

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
});
