import http from 'node:http';
import { getSocketPath } from './socket-path.mjs';

const SOCKET = getSocketPath();

function rpcCall(body) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(body));
    const req = http.request({
      socketPath: SOCKET,
      path: '/rpc',
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': data.length },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks).toString('utf8');
        try { resolve({ status: res.statusCode, body: JSON.parse(buf) }); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

const result = await rpcCall({ jsonrpc: '2.0', id: 1, method: 'ping', params: { hello: 'uds' } });

const ok = result.status === 200
  && result.body.jsonrpc === '2.0'
  && result.body.id === 1
  && result.body.result?.echo?.hello === 'uds';
console.log(`[S1] ${ok ? 'PASS' : 'FAIL'} status=${result.status} body=${JSON.stringify(result.body)}`);
process.exit(ok ? 0 : 1);
