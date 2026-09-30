#!/usr/bin/env node
// Polls GitHub Actions and the npm registry until a release tag is fully published.
//
//   node scripts/wait-for-release.mjs v1.8.8 [--timeout-min=20] [--interval-sec=30]
//
// Exit 0: publish workflow succeeded and npm serves the version.
// Exit 1: workflow failed/cancelled, or timed out.
// Set GITHUB_TOKEN to raise the unauthenticated API rate limit (60 req/h).

import { execFileSync } from 'node:child_process';

const REPO = 'unvus/neosql-mcp';
const PACKAGE = 'neosql-mcp';
const WORKFLOW_FILE = 'publish.yml';

const args = process.argv.slice(2);
const tag = args.find((a) => !a.startsWith('--'));
if (!tag || !/^v\d+\.\d+\.\d+/.test(tag)) {
  console.error(
    'usage: node scripts/wait-for-release.mjs vX.Y.Z [--timeout-min=20] [--interval-sec=30]',
  );
  process.exit(2);
}
const version = tag.slice(1);
const opt = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : fallback;
};
const timeoutMs = opt('timeout-min', 20) * 60_000;
const intervalMs = opt('interval-sec', 30) * 1_000;

const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'neosql-mcp-release' };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

const now = () => new Date().toISOString().slice(11, 19);
const log = (msg) => console.log(`[${now()}] ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`GitHub API ${res.status} for ${url}`);
  return res.json();
}

async function findRun() {
  const data = await fetchJson(
    `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW_FILE}/runs?event=push&per_page=10`,
  );
  return data.workflow_runs?.find((r) => r.head_branch === tag) ?? null;
}

async function jobSummary(run) {
  const data = await fetchJson(run.jobs_url);
  return (data.jobs ?? [])
    .map((j) => `${j.name}=${j.status}${j.conclusion ? `/${j.conclusion}` : ''}`)
    .join(', ');
}

function npmVersionPublished() {
  try {
    const out = execFileSync('npm', ['view', `${PACKAGE}@${version}`, 'version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return out === version;
  } catch {
    return false;
  }
}

const started = Date.now();
let runDone = false;
let runUrl = null;

log(`waiting for ${tag}: workflow ${WORKFLOW_FILE} on ${REPO}, then ${PACKAGE}@${version} on npm`);

while (Date.now() - started < timeoutMs) {
  if (!runDone) {
    try {
      const run = await findRun();
      if (!run) {
        log('workflow run for the tag not visible yet');
      } else {
        runUrl = run.html_url;
        const jobs = await jobSummary(run);
        log(`run ${run.status}${run.conclusion ? `/${run.conclusion}` : ''}: ${jobs}`);
        if (run.status === 'completed') {
          if (run.conclusion !== 'success') {
            log(`workflow finished with conclusion=${run.conclusion}: ${runUrl}`);
            process.exit(1);
          }
          runDone = true;
        }
      }
    } catch (err) {
      log(`GitHub API check failed: ${err.message}`);
    }
  }

  if (npmVersionPublished()) {
    log(`npm serves ${PACKAGE}@${version}`);
    if (runDone) {
      log(`release complete: ${runUrl ?? '(run url unknown)'}`);
      process.exit(0);
    }
    log('npm has the version; waiting for the workflow to finish (release-plugin job)');
  } else {
    log(`npm does not serve ${version} yet`);
  }

  await sleep(intervalMs);
}

log(
  `timed out after ${timeoutMs / 60_000} min; check ${runUrl ?? `https://github.com/${REPO}/actions`}`,
);
process.exit(1);
