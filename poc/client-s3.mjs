import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER = path.join(__dirname, 'client-s3-worker.mjs');
const ITERATIONS = 100;
const CLIENTS = ['A', 'B', 'C'];

const start = Date.now();

const results = await Promise.all(CLIENTS.map((id) => new Promise((resolve) => {
  const child = spawn(process.execPath, [WORKER, id, String(ITERATIONS)], { stdio: ['ignore', 'pipe', 'inherit'] });
  let out = '';
  child.stdout.on('data', (chunk) => { out += chunk; });
  child.on('close', (code) => {
    let parsed = null;
    try { parsed = JSON.parse(out.trim().split('\n').pop()); } catch {}
    resolve({ code, parsed });
  });
})));

const elapsed = Date.now() - start;
const allOk = results.every((r) => r.code === 0 && r.parsed?.ok === ITERATIONS && r.parsed?.mismatch === 0);

console.log(`[S3] ${allOk ? 'PASS' : 'FAIL'} clients=${CLIENTS.length} iterations=${ITERATIONS} elapsed=${elapsed}ms`);
for (const r of results) {
  console.log(`  ${JSON.stringify(r.parsed)} exitCode=${r.code}`);
}
process.exit(allOk ? 0 : 1);
