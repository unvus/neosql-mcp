import os from 'node:os';
import path from 'node:path';

export type Profile = 'prod' | 'dev';

export const HTTP_PATH = '/mcp/rpc';

export const resolveSocketPath = (profile: Profile): string => {
  const suffix = profile === 'dev' ? '-dev' : '';
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\neosql-mcp${suffix}`;
  }
  return path.join(os.tmpdir(), `neosql-mcp${suffix}.sock`);
};
