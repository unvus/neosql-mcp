import http from 'node:http';
import { getSocketPath } from './socket-path.mjs';

const clientId = process.argv[2] ?? '?';
const iterations = parseInt(process.argv[3] ?? '100', 10);
const SOCKET = getSocketPath();

const agent = new http.Agent({ keepAlive: true });

function rpcCall(body) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(body));
    const req = http.request({
      socketPath: SOCKET,
      path: '/rpc',
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': data.length },
      agent,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

let okCount = 0;
let mismatch = 0;

for (let i = 1; i <= iterations; i++) {
  const id = `${clientId}-${i}`;
  try {
    const r = await rpcCall({ jsonrpc: '2.0', id, method: 'echo', params: { client: clientId, i } });
    if (r.status === 200 && r.body.id === id && r.body.result?.echo?.client === clientId && r.body.result?.echo?.i === i) {
      okCount++;
    } else {
      mismatch++;
    }
  } catch {
    mismatch++;
  }
}

console.log(JSON.stringify({ clientId, ok: okCount, mismatch, total: iterations }));
process.exit(mismatch === 0 ? 0 : 1);
