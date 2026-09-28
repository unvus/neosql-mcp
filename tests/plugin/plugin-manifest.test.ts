import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const plugin = 'plugins/neosql-mcp/';
const readJson = (path: string) => JSON.parse(readFileSync(`${root}${path}`, 'utf8'));

describe('Claude plugin bundle', () => {
  it('does not ignore the plugin files in git but keeps root configuration private', () => {
    for (const path of ['.claude-plugin/plugin.json', '.mcp.json', 'README.md']) {
      expect(
        spawnSync('git', ['check-ignore', '--no-index', '-q', plugin + path], {
          cwd: root,
        }).status,
      ).toBe(1);
    }
    expect(
      spawnSync('git', ['check-ignore', '--no-index', '-q', '.mcp.json'], {
        cwd: root,
      }).status,
    ).toBe(0);
  });

  it('keeps the plugin name neosql-mcp', () => {
    expect(readJson(`${plugin}.claude-plugin/plugin.json`).name).toBe('neosql-mcp');
  });

  it('sets the plugin version to the package version', () => {
    expect(readJson(`${plugin}.claude-plugin/plugin.json`).version).toBe(
      readJson('package.json').version,
    );
  });

  it('declares only the pinned npx server without project or profile arguments', () => {
    expect(readJson(`${plugin}.mcp.json`)).toEqual({
      mcpServers: {
        neosql: { command: 'npx', args: ['-y', `neosql-mcp@${readJson('package.json').version}`] },
      },
    });
  });

  it('declares the Apache-2.0 license', () => {
    expect(readJson(`${plugin}.claude-plugin/plugin.json`).license).toBe('Apache-2.0');
  });

  it('includes at least 40 README words outside code blocks', () => {
    const prose = readFileSync(`${root}${plugin}README.md`, 'utf8').replace(/```[\s\S]*?```/g, '');
    expect(prose.trim().split(/\s+/).length).toBeGreaterThanOrEqual(40);
  });

  it('contains only the three distribution files', () => {
    expect(
      readdirSync(`${root}${plugin}`, { recursive: true })
        .map((path) => String(path).replaceAll('\\', '/'))
        .sort(),
    ).toEqual(['.claude-plugin', '.claude-plugin/plugin.json', '.mcp.json', 'README.md']);
  });
});
