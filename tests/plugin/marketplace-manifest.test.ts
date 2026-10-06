import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const readJson = (path: string) => JSON.parse(readFileSync(`${root}${path}`, 'utf8'));
const marketplace = readJson('.claude-plugin/marketplace.json');

describe('Claude plugin marketplace manifest', () => {
  it('names the marketplace neosql', () => {
    expect(marketplace.name).toBe('neosql');
  });

  it('lists exactly one plugin whose entry name matches the plugin manifest', () => {
    expect(marketplace.plugins).toHaveLength(1);
    expect(marketplace.plugins[0].name).toBe(
      readJson('plugins/neosql-mcp/.claude-plugin/plugin.json').name,
    );
  });

  it('points the plugin source at the bundle folder', () => {
    const { source } = marketplace.plugins[0];
    expect(source).toBe('./plugins/neosql-mcp');
    expect(existsSync(`${root}${source}/.claude-plugin/plugin.json`)).toBe(true);
  });
});
