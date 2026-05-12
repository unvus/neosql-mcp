import os from 'node:os';
import path from 'node:path';

/**
 * NeoSQL 실행 profile.
 * - `prod`: 배포 빌드 (suffix 없음)
 * - `dev`/`local`/`stage`: non-prod 환경. socket 은 profile 별로 분리되어
 *   서로 다른 모드의 데스크톱 앱이 같은 머신에서 충돌 없이 공존할 수 있다.
 */
export type Profile = 'prod' | 'dev' | 'local' | 'stage';

export const HTTP_PATH = '/mcp/rpc';

export const resolveSocketPath = (profile: Profile): string => {
  // prod 는 suffix 없음; 그 외 profile 은 모두 `-${profile}` 로 분리.
  const suffix = profile === 'prod' ? '' : `-${profile}`;
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\neosql-mcp${suffix}`;
  }
  return path.join(os.tmpdir(), `neosql-mcp${suffix}.sock`);
};
