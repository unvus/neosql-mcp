import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let root: string;
const manifestPath = 'plugins/neosql/.claude-plugin/plugin.json';
const mcpPath = 'plugins/neosql/.mcp.json';
const writeJson = (path: string, value: unknown) =>
  writeFileSync(join(root, path), JSON.stringify(value));
const readJson = (path: string) => JSON.parse(readFileSync(join(root, path), 'utf8'));
const run = () =>
  spawnSync(process.execPath, [join(root, 'scripts/sync-plugin-version.mjs')], {
    cwd: tmpdir(),
    encoding: 'utf8',
    timeout: 10_000,
  });

describe('plugin version lifecycle script', () => {
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'neosql-version-'));
    mkdirSync(join(root, 'scripts'));
    mkdirSync(join(root, 'plugins/neosql/.claude-plugin'), { recursive: true });
    copyFileSync(
      new URL('../../scripts/sync-plugin-version.mjs', import.meta.url),
      join(root, 'scripts/sync-plugin-version.mjs'),
    );
    writeJson('package.json', { version: '2.3.4' });
    writeJson(manifestPath, { name: 'neosql', version: '1.0.0', license: 'Apache-2.0' });
    writeJson(mcpPath, {
      mcpServers: {
        neosql: { command: 'npx', args: ['-y', 'neosql-mcp@1.0.0'], env: { EXAMPLE: 'preserved' } },
      },
    });
  });
  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it('rewrites the plugin version and npx pin to the package version', () => {
    expect(run().status).toBe(0);
    expect(readJson(manifestPath).version).toBe('2.3.4');
    expect(readJson(mcpPath).mcpServers.neosql.args).toEqual(['-y', 'neosql-mcp@2.3.4']);
  });

  it('keeps other manifest and server fields unchanged', () => {
    expect(run().status).toBe(0);
    expect(readJson(manifestPath)).toEqual({
      name: 'neosql',
      version: '2.3.4',
      license: 'Apache-2.0',
    });
    expect(readJson(mcpPath).mcpServers.neosql).toEqual({
      command: 'npx',
      args: ['-y', 'neosql-mcp@2.3.4'],
      env: { EXAMPLE: 'preserved' },
    });
  });

  it('fails without modifying files when no neosql-mcp launcher argument exists', () => {
    writeJson(mcpPath, {
      mcpServers: { neosql: { command: 'npx', args: ['-y', 'other-package'] } },
    });
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('neosql-mcp launcher');
    expect(readJson(manifestPath).version).toBe('1.0.0');
    expect(readJson(mcpPath).mcpServers.neosql.args).toEqual(['-y', 'other-package']);
  });
});
