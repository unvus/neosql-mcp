import os from 'node:os';
import path from 'node:path';
import type { Profile } from '../upstream/endpoint-resolver.js';

export const LOG_FILE_NAME = 'neosql-mcp.log';

export const resolveLogAppName = (profile: Profile): string => {
  if (profile === 'prod') return 'NeoSqlMcp';
  return `NeoSqlMcp${profile.charAt(0).toUpperCase()}${profile.slice(1)}`;
};

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
