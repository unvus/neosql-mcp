import { describe, it, expect, vi, beforeEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { resolveSocketPath, HTTP_PATH, getTempDir } from '../../src/upstream/endpoint-resolver.js';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

describe('getTempDir', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns os.tmpdir() on non-darwin platforms', () => {
    expect(getTempDir()).toBe(os.tmpdir());
  });

  it('uses getconf on darwin when available', async () => {
    const original = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
      configurable: true,
    });
    try {
      const { execSync } = await import('node:child_process');
      vi.mocked(execSync).mockReturnValueOnce('/var/folders/test/T/\n');
      const result = getTempDir();
      expect(execSync).toHaveBeenCalledWith(
        'getconf DARWIN_USER_TEMP_DIR',
        expect.objectContaining({ encoding: 'utf-8' })
      );
      expect(result).toBe('/var/folders/test/T/');
    } finally {
      if (original) {
        Object.defineProperty(process, 'platform', original);
      }
    }
  });

  it('falls back to os.tmpdir() if getconf fails on darwin', async () => {
    const original = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
      configurable: true,
    });
    try {
      const { execSync } = await import('node:child_process');
      vi.mocked(execSync).mockImplementationOnce(() => {
        throw new Error('getconf failed');
      });
      expect(getTempDir()).toBe(os.tmpdir());
    } finally {
      if (original) {
        Object.defineProperty(process, 'platform', original);
      }
    }
  });
});

describe('resolveSocketPath', () => {
  it('returns the current OS socket path for the prod profile', () => {
    const expected =
      process.platform === 'win32'
        ? '\\\\.\\pipe\\neosql-mcp'
        : path.join(getTempDir(), 'neosql-mcp.sock');
    expect(resolveSocketPath('prod')).toBe(expected);
  });

  it('returns the current OS socket path for the dev profile', () => {
    const expected =
      process.platform === 'win32'
        ? '\\\\.\\pipe\\neosql-mcp-dev'
        : path.join(getTempDir(), 'neosql-mcp-dev.sock');
    expect(resolveSocketPath('dev')).toBe(expected);
  });

  it('returns the current OS socket path for the local profile', () => {
    const expected =
      process.platform === 'win32'
        ? '\\\\.\\pipe\\neosql-mcp-local'
        : path.join(getTempDir(), 'neosql-mcp-local.sock');
    expect(resolveSocketPath('local')).toBe(expected);
  });

  it('returns the current OS socket path for the stage profile', () => {
    const expected =
      process.platform === 'win32'
        ? '\\\\.\\pipe\\neosql-mcp-stage'
        : path.join(getTempDir(), 'neosql-mcp-stage.sock');
    expect(resolveSocketPath('stage')).toBe(expected);
  });
});

describe('HTTP_PATH', () => {
  it('is "/mcp/rpc"', () => {
    expect(HTTP_PATH).toBe('/mcp/rpc');
  });
});
