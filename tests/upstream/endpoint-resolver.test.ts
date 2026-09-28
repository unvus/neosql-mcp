import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { resolveSocketPath, HTTP_PATH, getTempDir } from '../../src/upstream/endpoint-resolver.js';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

const setPlatform = (value: NodeJS.Platform): void => {
  Object.defineProperty(process, 'platform', { value, configurable: true });
};

describe('getTempDir', () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;

  beforeEach(() => {
    vi.mocked(execSync).mockReset();
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', originalPlatform);
    vi.unstubAllEnvs();
  });

  it('returns os.tmpdir() on non-darwin platforms without calling getconf', () => {
    setPlatform('linux');
    expect(getTempDir()).toBe(os.tmpdir());
    expect(execSync).not.toHaveBeenCalled();
  });

  it('respects TMPDIR on darwin without calling getconf', () => {
    setPlatform('darwin');
    vi.stubEnv('TMPDIR', '/custom/tmp');
    expect(getTempDir()).toBe(os.tmpdir());
    expect(execSync).not.toHaveBeenCalled();
  });

  it('uses getconf on darwin when TMPDIR is missing', () => {
    setPlatform('darwin');
    vi.stubEnv('TMPDIR', '');
    vi.mocked(execSync).mockReturnValueOnce('/var/folders/test/T/\n');
    expect(getTempDir()).toBe('/var/folders/test/T/');
    expect(execSync).toHaveBeenCalledWith(
      'getconf DARWIN_USER_TEMP_DIR',
      expect.objectContaining({ encoding: 'utf-8' }),
    );
  });

  it('falls back to os.tmpdir() when getconf fails on darwin', () => {
    setPlatform('darwin');
    vi.stubEnv('TMPDIR', '');
    vi.mocked(execSync).mockImplementationOnce(() => {
      throw new Error('getconf failed');
    });
    expect(getTempDir()).toBe(os.tmpdir());
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
