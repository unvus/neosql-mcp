import os from 'node:os';
import path from 'node:path';
import type { Profile } from '../upstream/endpoint-resolver.js';

export const LOG_FILE_NAME = 'neosql-mcp.log';

// Log 디렉토리는 prod / non-prod 두 갈래로만 분리한다. local/dev/stage 모두 NeoSqlMcpDev 를 공유.
// (사용자 머신에 동시에 여러 non-prod 인스턴스가 떠도 같은 폴더 안에 누적되는 것을 의도)
export const resolveLogAppName = (profile: Profile): string =>
  profile === 'prod' ? 'NeoSqlMcp' : 'NeoSqlMcpDev';

export const resolveLogParentDir = (): string => {
  const override = process.env['NEOSQL_MCP_LOG_PARENT_DIR'];
  if (override) return override;

  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Logs');
  }
  if (process.platform === 'win32') {
    return process.env['APPDATA'] ?? path.join(os.homedir(), 'AppData', 'Roaming');
  }
  return process.env['XDG_CONFIG_HOME'] ?? path.join(os.homedir(), '.config');
};

export const resolveLogDir = (profile: Profile): string =>
  path.join(resolveLogParentDir(), resolveLogAppName(profile));

export const resolveLogFilePath = (profile: Profile): string =>
  path.join(resolveLogDir(profile), LOG_FILE_NAME);
