#!/usr/bin/env node
// 수동 테스트용 SSE 스트리밍 클라이언트.
// Usage:
//   node cli-sse.mjs           # /events 에 연결, Ctrl+C 까지 수신
//   node cli-sse.mjs /events   # path 지정 (기본 /events)

import http from 'node:http';
import { getSocketPath } from './socket-path.mjs';

const SOCKET = getSocketPath();
const PATH = process.argv[2] ?? '/events';

console.error(`[cli-sse] socket=${SOCKET}`);
console.error(`[cli-sse] → GET ${PATH}  Accept: text/event-stream`);

const req = http.request({
  socketPath: SOCKET,
  path: PATH,
  method: 'GET',
  headers: { 'accept': 'text/event-stream' },
}, (res) => {
  console.error(`[cli-sse] ← ${res.statusCode} ${res.headers['content-type']}`);
  if (res.statusCode !== 200) {
    res.resume();
    process.exit(1);
  }

  let buf = '';
  res.setEncoding('utf8');
  res.on('data', (chunk) => {
    buf += chunk;
    let idx;
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const evt = {};
      for (const line of block.split('\n')) {
        const m = line.match(/^([^:]+):\s?(.*)$/);
        if (!m) continue;
        evt[m[1]] = m[2];
      }
      const ts = new Date().toISOString().slice(11, 23);
      console.log(`[${ts}] id=${evt.id ?? '-'} event=${evt.event ?? 'message'} data=${evt.data ?? ''}`);
    }
  });
  res.on('end', () => {
    console.error(`[cli-sse] stream ended`);
    process.exit(0);
  });
  res.on('error', (e) => {
    console.error(`[cli-sse] stream error: ${e.message}`);
    process.exit(1);
  });
});
req.on('error', (err) => {
  console.error(`[cli-sse] connection error: ${err.message}`);
  if (err.code === 'ENOENT') console.error('  → server is not running, or socket path mismatch');
  process.exit(1);
});
req.end();

process.on('SIGINT', () => {
  console.error('\n[cli-sse] interrupted');
  req.destroy();
  process.exit(0);
});
