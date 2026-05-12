import { describe, it, expect } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { resolveSocketPath, HTTP_PATH } from '../../src/upstream/endpoint-resolver.js';

describe('resolveSocketPath', () => {
  it('returns the current OS socket path for the prod profile', () => {
    const expected =
      process.platform === 'win32'
        ? '\\\\.\\pipe\\neosql-mcp'
        : path.join(os.tmpdir(), 'neosql-mcp.sock');
    expect(resolveSocketPath('prod')).toBe(expected);
  });

  it('returns the current OS socket path for the dev profile', () => {
    const expected =
      process.platform === 'win32'
        ? '\\\\.\\pipe\\neosql-mcp-dev'
        : path.join(os.tmpdir(), 'neosql-mcp-dev.sock');
    expect(resolveSocketPath('dev')).toBe(expected);
  });

  it('returns the current OS socket path for the local profile', () => {
    const expected =
      process.platform === 'win32'
        ? '\\\\.\\pipe\\neosql-mcp-local'
        : path.join(os.tmpdir(), 'neosql-mcp-local.sock');
    expect(resolveSocketPath('local')).toBe(expected);
  });

  it('returns the current OS socket path for the stage profile', () => {
    const expected =
      process.platform === 'win32'
        ? '\\\\.\\pipe\\neosql-mcp-stage'
        : path.join(os.tmpdir(), 'neosql-mcp-stage.sock');
    expect(resolveSocketPath('stage')).toBe(expected);
  });
});

describe('HTTP_PATH', () => {
  it('is "/mcp/rpc"', () => {
    expect(HTTP_PATH).toBe('/mcp/rpc');
  });
});
