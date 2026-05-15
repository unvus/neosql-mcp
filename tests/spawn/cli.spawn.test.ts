import { describe, it, expect, afterAll, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_PATH = resolve(__dirname, '../../dist/cli.js');

describe('built CLI via stdio spawn', () => {
  const clients: Client[] = [];
  let logParentDir: string;

  afterAll(async () => {
    await Promise.all(clients.map((c) => c.close()));
  });

  beforeEach(() => {
    logParentDir = mkdtempSync(path.join(os.tmpdir(), 'neosql-mcp-spawn-logs-'));
  });

  afterEach(() => {
    rmSync(logParentDir, { recursive: true, force: true });
  });

  it('responds to ping over stdio after spawn', async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [CLI_PATH],
      env: {
        NEOSQL_MCP_LOG_PARENT_DIR: logParentDir,
      },
    });
    const client = new Client({ name: 'spawn-test-client', version: '0.0.0' });
    clients.push(client);
    await client.connect(transport);

    const result = await client.callTool({ name: 'ping', arguments: {} });
    const content = result.content as Array<{ type: string; text?: string }>;
    expect(content[0]?.text).toBe('pong');
  });

  it('returns a stable mcpSessionId within the spawned process', async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [CLI_PATH],
      env: {
        NEOSQL_MCP_LOG_PARENT_DIR: logParentDir,
      },
    });
    const client = new Client({ name: 'spawn-test-client', version: '0.0.0' });
    clients.push(client);
    await client.connect(transport);

    const first = await client.callTool({ name: 'get-mcp-session-id', arguments: {} });
    const second = await client.callTool({ name: 'get-mcp-session-id', arguments: {} });
    const firstContent = first.content as Array<{ type: string; text?: string }>;
    const secondContent = second.content as Array<{ type: string; text?: string }>;

    expect(first.isError).not.toBe(true);
    expect(second.isError).not.toBe(true);
    expect(firstContent[0]?.text).toMatch(/^[0-9a-f-]{36}$/);
    expect(secondContent[0]?.text).toBe(firstContent[0]?.text);
  });
});
