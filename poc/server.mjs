import http from 'node:http';
import fs from 'node:fs';
import { getSocketPath } from './socket-path.mjs';

const SOCKET = getSocketPath();
if (process.platform !== 'win32') {
  try { fs.unlinkSync(SOCKET); } catch {}
}

let counter = 0;
let connSeq = 0;

function ts() {
  return new Date().toISOString().slice(11, 23); // HH:mm:ss.SSS
}

function preview(value, max = 200) {
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  return s.length > max ? s.slice(0, max) + `…(${s.length}B)` : s;
}

const server = http.createServer((req, res) => {
  const cid = ++connSeq;
  const startedAt = Date.now();
  console.error(`[${ts()}] #${cid} → ${req.method} ${req.url}`);

  if (req.method === 'POST' && req.url === '/rpc') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      let payload = {};
      let parseError = null;
      try { payload = JSON.parse(body || '{}'); } catch (e) { parseError = e.message; }

      console.error(`[${ts()}] #${cid}   body  : ${preview(body)}`);
      if (parseError) console.error(`[${ts()}] #${cid}   parse-error: ${parseError}`);
      console.error(`[${ts()}] #${cid}   parsed: method=${payload.method ?? '-'} id=${payload.id ?? '-'} params=${preview(payload.params)}`);

      const seq = ++counter;
      const response = { jsonrpc: '2.0', id: payload.id ?? null, result: { echo: payload.params ?? null, serverSeq: seq, pid: process.pid } };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));

      const elapsed = Date.now() - startedAt;
      console.error(`[${ts()}] #${cid} ← 200 serverSeq=${seq} (${elapsed}ms)`);
    });
    return;
  }

  if (req.method === 'GET' && req.url === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    res.flushHeaders?.();
    console.error(`[${ts()}] #${cid}   sse stream open`);

    let n = 0;
    const interval = setInterval(() => {
      n += 1;
      const data = JSON.stringify({ seq: n, ts: Date.now() });
      res.write(`id: ${n}\n`);
      res.write(`event: tick\n`);
      res.write(`data: ${data}\n\n`);
      console.error(`[${ts()}] #${cid}   sse event seq=${n}`);
      if (n >= 5) {
        clearInterval(interval);
        res.end();
        const elapsed = Date.now() - startedAt;
        console.error(`[${ts()}] #${cid} ← stream end (${n} events, ${elapsed}ms)`);
      }
    }, 50);
    req.on('close', () => {
      if (n < 5) {
        clearInterval(interval);
        const elapsed = Date.now() - startedAt;
        console.error(`[${ts()}] #${cid} ← client closed (${n} events, ${elapsed}ms)`);
      }
    });
    return;
  }

  res.writeHead(404);
  res.end();
  const elapsed = Date.now() - startedAt;
  console.error(`[${ts()}] #${cid} ← 404 (${elapsed}ms)`);
});

server.listen(SOCKET, () => {
  if (process.platform !== 'win32') {
    try { fs.chmodSync(SOCKET, 0o600); } catch {}
  }
  console.error(`[${ts()}] [server] listening on ${SOCKET} (pid ${process.pid})`);
  console.error(`[${ts()}] [server] ready — try: node poc/cli-rpc.mjs '{"id":1,"method":"hello"}'`);
});

process.on('SIGINT', () => server.close(() => process.exit(0)));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
