import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  HTTP_PATH,
  resolveSocketPath,
  type Profile,
} from '../../src/upstream/endpoint-resolver.js';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));

const PROFILE_SUFFIXES: Array<[Profile, string]> = [
  ['prod', ''],
  ['dev', '-dev'],
  ['local', '-local'],
  ['stage', '-stage'],
];
const DARWIN_TEMP_DIR = '/var/folders/ab/cd/T/';
const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;

const setPlatform = (platform: NodeJS.Platform): void => {
  Object.defineProperty(process, 'platform', { ...originalPlatform, value: platform });
};

describe('resolveSocketPath', () => {
  beforeEach(() => {
    vi.mocked(execFileSync).mockReset();
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', originalPlatform);
    vi.unstubAllEnvs();
  });

  it.each(PROFILE_SUFFIXES)(
    'returns the named pipe for the %s profile on win32 without calling getconf',
    (profile, suffix) => {
      setPlatform('win32');
      expect(resolveSocketPath(profile)).toBe(`\\\\.\\pipe\\neosql-mcp${suffix}`);
      expect(execFileSync).not.toHaveBeenCalled();
    },
  );

  it.each(PROFILE_SUFFIXES)(
    'joins the getconf DARWIN_USER_TEMP_DIR result for the %s profile on darwin',
    (profile, suffix) => {
      setPlatform('darwin');
      vi.mocked(execFileSync).mockReturnValue(`${DARWIN_TEMP_DIR}\n`);
      expect(resolveSocketPath(profile)).toBe(
        path.join(DARWIN_TEMP_DIR, `neosql-mcp${suffix}.sock`),
      );
      expect(execFileSync).toHaveBeenCalledWith('/usr/bin/getconf', ['DARWIN_USER_TEMP_DIR'], {
        encoding: 'utf8',
      });
    },
  );

  it('ignores TMPDIR on darwin', () => {
    setPlatform('darwin');
    vi.stubEnv('TMPDIR', '/custom/tmp');
    vi.mocked(execFileSync).mockReturnValue(`${DARWIN_TEMP_DIR}\n`);
    expect(resolveSocketPath('prod')).toBe(path.join(DARWIN_TEMP_DIR, 'neosql-mcp.sock'));
  });

  it('throws when getconf fails on darwin', () => {
    setPlatform('darwin');
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('getconf failed');
    });
    expect(() => resolveSocketPath('prod')).toThrow('getconf failed');
  });
});

describe('HTTP_PATH', () => {
  it('is "/mcp/rpc"', () => {
    expect(HTTP_PATH).toBe('/mcp/rpc');
  });
});
