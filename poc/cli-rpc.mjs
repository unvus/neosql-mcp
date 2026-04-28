#!/usr/bin/env node
// 수동 테스트용 RPC 클라이언트.
// Usage:
//   node cli-rpc.mjs '<json>'
//   echo '<json>' | node cli-rpc.mjs

import http from 'node:http';
import { getSocketPath } from './socket-path.mjs';

const SOCKET = getSocketPath();

async function readStdin() {
  if (process.stdin.isTTY) return '';
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data.trim();
}

const argJson = process.argv[2];
const stdinJson = argJson ? '' : await readStdin();
const raw = (argJson ?? stdinJson).trim();

if (!raw) {
  console.error('usage: node cli-rpc.mjs \'<json>\'  |  echo \'<json>\' | node cli-rpc.mjs');
  process.exit(2);
}

let body;
try {
  body = JSON.parse(raw);
} catch (e) {
  console.error(`invalid json: ${e.message}`);
  console.error(`input: ${raw}`);
  process.exit(2);
}

const data = Buffer.from(JSON.stringify(body));

console.error(`[cli-rpc] socket=${SOCKET}`);
console.error(`[cli-rpc] → POST /rpc  ${JSON.stringify(body)}`);

const start = Date.now();
const result = await new Promise((resolve, reject) => {
  const req = http.request({
    socketPath: SOCKET,
    path: '/rpc',
    method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': data.length },
  }, (res) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
  });
  req.on('error', reject);
  req.write(data);
  req.end();
}).catch((err) => {
  console.error(`[cli-rpc] connection error: ${err.message}`);
  if (err.code === 'ENOENT') console.error('  → server is not running, or socket path mismatch');
  if (err.code === 'ECONNREFUSED') console.error('  → server not accepting connections');
  process.exit(1);
});

const elapsed = Date.now() - start;
console.error(`[cli-rpc] ← ${result.status} (${elapsed}ms)`);
try {
  const parsed = JSON.parse(result.body);
  console.log(JSON.stringify(parsed, null, 2));
} catch {
  console.log(result.body);
}
