import { describe, it, expect, afterAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_PATH = resolve(__dirname, '../../dist/cli.js');

describe('built CLI via stdio spawn', () => {
  const clients: Client[] = [];

  afterAll(async () => {
    await Promise.all(clients.map((c) => c.close()));
  });

  it('responds to ping over stdio after spawn', async () => {
    const transport = new StdioClientTransport({
      command: 'node',
      args: [CLI_PATH],
    });
    const client = new Client({ name: 'spawn-test-client', version: '0.0.0' });
    clients.push(client);
    await client.connect(transport);

    const result = await client.callTool({ name: 'ping', arguments: {} });
    const content = result.content as Array<{ type: string; text?: string }>;
    expect(content[0]?.text).toBe('pong');
  });
});
