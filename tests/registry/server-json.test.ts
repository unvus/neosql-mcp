import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const readJson = (path: string) => JSON.parse(readFileSync(`${root}${path}`, 'utf8'));
const readServer = () => {
  expect(existsSync(`${root}server.json`)).toBe(true);
  return readJson('server.json');
};

describe('MCP Registry server.json', () => {
  it('declares io.github.unvus/neosql-mcp as the package mcpName', () => {
    expect(readJson('package.json').mcpName).toBe('io.github.unvus/neosql-mcp');
  });

  it('uses the package mcpName as the server.json name', () => {
    expect(readServer().name).toBe(readJson('package.json').mcpName);
  });

  it('declares only the neosql-mcp npm package over stdio without arguments or environment variables', () => {
    expect(readServer().packages).toEqual([
      {
        registryType: 'npm',
        identifier: 'neosql-mcp',
        version: '0.0.0',
        transport: { type: 'stdio' },
      },
    ]);
    expect(readServer().remotes).toBeUndefined();
  });

  it('keeps the description within 100 characters and links the GitHub repository', () => {
    const server = readServer();
    expect(server.description.length).toBeGreaterThan(0);
    expect(server.description.length).toBeLessThanOrEqual(100);
    expect(server.repository).toEqual({
      url: 'https://github.com/unvus/neosql-mcp',
      source: 'github',
    });
  });

  it('leaves both server.json versions as the 0.0.0 placeholder for CI injection', () => {
    const server = readServer();
    expect(server.version).toBe('0.0.0');
    expect(server.packages.map((pkg: { version: string }) => pkg.version)).toEqual(['0.0.0']);
  });
});
