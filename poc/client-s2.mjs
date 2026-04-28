import http from 'node:http';
import { getSocketPath } from './socket-path.mjs';

const SOCKET = getSocketPath();

const events = await new Promise((resolve, reject) => {
  const collected = [];
  const req = http.request({ socketPath: SOCKET, path: '/events', method: 'GET' }, (res) => {
    if (res.statusCode !== 200 || !res.headers['content-type']?.includes('text/event-stream')) {
      reject(new Error(`bad sse response: status=${res.statusCode} ct=${res.headers['content-type']}`));
      return;
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
        if (evt.data) collected.push(evt);
      }
    });
    res.on('end', () => resolve(collected));
    res.on('error', reject);
  });
  req.on('error', reject);
  req.end();
});

const ok = events.length === 5
  && events.every((e, i) => e.event === 'tick' && JSON.parse(e.data).seq === i + 1);
console.log(`[S2] ${ok ? 'PASS' : 'FAIL'} received=${events.length} events`);
if (!ok) console.log(JSON.stringify(events, null, 2));
process.exit(ok ? 0 : 1);
