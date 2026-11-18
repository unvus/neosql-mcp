import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * NeoSQL 실행 profile.
 * - `prod`: 배포 빌드 (suffix 없음)
 * - `dev`/`local`/`stage`: non-prod 환경. socket 은 profile 별로 분리되어
 *   서로 다른 모드의 데스크톱 앱이 같은 머신에서 충돌 없이 공존할 수 있다.
 * - `enterprise`: NeoSQLEnterprise(고객 서버 설치형) 배포 빌드. 이름 · socket 규칙은 다른 non-prod 와 같고,
 *   딥링크를 등록하지 않는다(profile-names.ts).
 * - `test`: 이 저장소의 spawn 테스트 전용. 실제 Desktop 은 이 profile 로 실행되지 않으므로
 *   테스트 mock 서버가 실사용 socket 과 충돌하지 않는다.
 */
export type Profile = 'prod' | 'dev' | 'local' | 'stage' | 'enterprise' | 'test';

export const HTTP_PATH = '/mcp/rpc';

export const resolveSocketPath = (profile: Profile): string => {
  // prod 는 suffix 없음; 그 외 profile 은 모두 `-${profile}` 로 분리.
  const suffix = profile === 'prod' ? '' : `-${profile}`;
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\neosql-mcp${suffix}`;
  }
  // MCP host 가 TMPDIR 을 빼고 실행할 수 있으므로 env 대신 OS 에 사용자 temp 경로를 묻는다.
  const tempDir = execFileSync('/usr/bin/getconf', ['DARWIN_USER_TEMP_DIR'], {
    encoding: 'utf8',
  }).trim();
  return path.join(tempDir, `neosql-mcp${suffix}.sock`);
};
