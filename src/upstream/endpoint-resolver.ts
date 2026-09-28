import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';

/**
 * NeoSQL 실행 profile.
 * - `prod`: 배포 빌드 (suffix 없음)
 * - `dev`/`local`/`stage`: non-prod 환경. socket 은 profile 별로 분리되어
 *   서로 다른 모드의 데스크톱 앱이 같은 머신에서 충돌 없이 공존할 수 있다.
 */
export type Profile = 'prod' | 'dev' | 'local' | 'stage';

export const HTTP_PATH = '/mcp/rpc';

// MCP host 가 TMPDIR 을 뺀 env 로 띄우면 os.tmpdir() 이 /tmp 로 떨어져 앱 socket 과 어긋난다.
export const getTempDir = (): string => {
  if (process.platform === 'darwin' && !process.env.TMPDIR) {
    try {
      return execSync('getconf DARWIN_USER_TEMP_DIR', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
    } catch {
      // fallback if getconf fails
    }
  }
  return os.tmpdir();
};

export const resolveSocketPath = (profile: Profile): string => {
  // prod 는 suffix 없음; 그 외 profile 은 모두 `-${profile}` 로 분리.
  const suffix = profile === 'prod' ? '' : `-${profile}`;
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\neosql-mcp${suffix}`;
  }
  return path.join(getTempDir(), `neosql-mcp${suffix}.sock`);
};
