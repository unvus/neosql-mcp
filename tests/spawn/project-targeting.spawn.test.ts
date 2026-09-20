import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ProgressNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import { closeServer, listen } from '../helpers/socket.js';

const cli = fileURLToPath(new URL('../../dist/cli.js', import.meta.url));
describe.skipIf(process.platform === 'win32')('project targeting stdio → HTTP', () => {
  it.each([true, false])('지정 이동 뒤 원래 작업을 한 번 전송한다 (progress=%s)', async progress => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'npt-'));
    let selected: string | null = null;
    let loading = false;
    const requests: any[] = [];
    const server = http.createServer((req, res) => {
      let body = ''; req.on('data', c => { body += c; }); req.on('end', () => {
        const rpc = JSON.parse(body); requests.push(rpc);
        let result: unknown;
        if (rpc.method === 'get-runtime-status') {
          result = { app: 'neosql', profile: 'local', renderer: 'responsive', project: { state: selected ? loading ? 'loading' : 'ready' : 'not_selected', projectId: selected } };
          loading = false;
        } else if (rpc.method === 'open-project') {
          selected = rpc.params.input.projectId; loading = true;
          result = { status: 'navigated', projectId: selected };
        } else result = { connections: [] };
        res.end(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result }));
      });
    });
    const client = new Client({ name: 'targeting-test', version: '1' });
    const messages: string[] = [];
    client.setNotificationHandler(ProgressNotificationSchema, notification => { messages.push(notification.params.message ?? ''); });
    try {
      await listen(server, path.join(dir, 'neosql-mcp-local.sock'));
      await client.connect(new StdioClientTransport({ command: process.execPath, args: [cli, '--profile=local', '--project-id=B'], env: { TMPDIR: dir, TMP: dir, TEMP: dir, NEOSQL_MCP_LOG_PARENT_DIR: dir } }));
      await client.listTools(); await client.callTool({ name: 'ping', arguments: {} });
      expect(requests).toHaveLength(0);
      const result = await client.callTool({ name: 'list-connections', arguments: {}, ...(progress ? { _meta: { progressToken: 'p' } } : {}) });
      expect(result.isError).not.toBe(true);
      expect(requests.map(r => r.method)).toEqual(['get-runtime-status', 'open-project', 'get-runtime-status', 'get-runtime-status', 'list-connections']);
      expect(requests[1].params.preparationDeadlineAt).toBeGreaterThan(Date.now() - 20_000);
      expect(requests[4].params.context).toEqual({ expectedProjectId: 'B' });
      expect(messages.length).toBe(progress ? 3 : 0);
    } finally { await client.close(); await closeServer(server); rmSync(dir, { recursive: true, force: true }); }
  });
});
