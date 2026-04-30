import { describe, it, expect, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../../../../src/mcp/server.js';
import { startMockRpcServer, type MockRpcRequest } from '../../../helpers/mock-uds-server.js';
import { makeTestSocketPath, removeSocketFile } from '../../../helpers/socket.js';

describe('generateCode tool', () => {
  const cleanups: Array<() => Promise<void> | void> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      const fn = cleanups.pop();
      if (fn) await fn();
    }
  });

  it('calls codeGeneration.generateCode with tableName converted to tableNames', async () => {
    const socketPath = makeTestSocketPath();
    const received: MockRpcRequest[] = [];
    const mock = await startMockRpcServer({
      socketPath,
      handler: (req) => {
        received.push(req);
        return { kind: 'result', result: { files: [{ path: 'User.java', content: '...' }] } };
      },
    });
    cleanups.push(async () => {
      await mock.close();
      removeSocketFile(socketPath);
    });

    const server = createServer({ socketPath });
    const [st, ct] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    const client = new Client({ name: 'test', version: '0.0.0' });
    await client.connect(ct);
    cleanups.push(() => client.close());

    const result = await client.callTool({
      name: 'generateCode',
      arguments: { tableName: 'users', templatePackId: 'java-jpa', schema: 'public' },
    });

    expect(result.isError).not.toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0]?.type).toBe('text');
    const data = JSON.parse(content[0]?.text ?? '{}') as { files: unknown[] };
    expect(data.files).toEqual([{ path: 'User.java', content: '...' }]);
    expect(received).toHaveLength(1);
    expect(received[0]?.method).toBe('codeGeneration.generateCode');
    expect(received[0]?.params).toMatchObject({
      context: { schema: 'public' },
      input: { tableNames: ['users'], templatePackId: 'java-jpa' },
    });
  });
});
