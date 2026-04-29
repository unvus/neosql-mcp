import { describe, it, expect } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { resolveSocketPath, HTTP_PATH } from '../../src/upstream/endpoint-resolver.js';

describe('resolveSocketPath', () => {
  it('returns os.tmpdir()/neosql-mcp.sock for prod profile on POSIX', () => {
    expect(resolveSocketPath('prod')).toBe(path.join(os.tmpdir(), 'neosql-mcp.sock'));
  });

  it('returns os.tmpdir()/neosql-mcp-dev.sock for dev profile on POSIX', () => {
    expect(resolveSocketPath('dev')).toBe(path.join(os.tmpdir(), 'neosql-mcp-dev.sock'));
  });
});

describe('HTTP_PATH', () => {
  it('is "/rpc"', () => {
    expect(HTTP_PATH).toBe('/rpc');
  });
});
