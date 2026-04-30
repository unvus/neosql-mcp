import http from 'node:http';
import { closeServer, listen } from './socket.js';

export interface MockRpcRequest {
  method: string;
  params?: unknown;
  id: string | number | null;
}

export type MockRpcResponse =
  | { kind: 'result'; result: unknown }
  | { kind: 'rpc-error'; code: number; message: string }
  | { kind: 'http'; status: number; body?: string; contentType?: string };

export interface StartMockOpts {
  socketPath: string;
  handler: (req: MockRpcRequest) => MockRpcResponse | Promise<MockRpcResponse>;
}

export interface StartedMock {
  close: () => Promise<void>;
}

export const startMockRpcServer = async (opts: StartMockOpts): Promise<StartedMock> => {
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/mcp/rpc') {
      res.writeHead(404);
      res.end();
      return;
    }
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString('utf8');
    });
    req.on('end', () => {
      void (async () => {
        let parsed: { method: string; params?: unknown; id?: string | number | null };
        try {
          parsed = JSON.parse(body) as typeof parsed;
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'invalid json' }));
          return;
        }
        const responseId = parsed.id ?? null;
        const handlerResult = await opts.handler({
          method: parsed.method,
          params: parsed.params,
          id: responseId,
        });
        switch (handlerResult.kind) {
          case 'result':
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                jsonrpc: '2.0',
                id: responseId,
                result: handlerResult.result,
              }),
            );
            break;
          case 'rpc-error':
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                jsonrpc: '2.0',
                id: responseId,
                error: { code: handlerResult.code, message: handlerResult.message },
              }),
            );
            break;
          case 'http':
            res.writeHead(handlerResult.status, {
              'Content-Type': handlerResult.contentType ?? 'application/json',
            });
            res.end(handlerResult.body ?? '');
            break;
        }
      })();
    });
  });
  await listen(server, opts.socketPath);
  return {
    close: () => closeServer(server),
  };
};
