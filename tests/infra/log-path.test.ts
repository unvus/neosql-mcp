import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import {
  LOG_FILE_NAME,
  resolveLogAppName,
  resolveLogDir,
  resolveLogFilePath,
  resolveLogParentDir,
} from '../../src/infra/log-path.js';

let previousLogParentDir: string | undefined;

beforeEach(() => {
  previousLogParentDir = process.env['NEOSQL_MCP_LOG_PARENT_DIR'];
  delete process.env['NEOSQL_MCP_LOG_PARENT_DIR'];
});

afterEach(() => {
  if (previousLogParentDir === undefined) {
    delete process.env['NEOSQL_MCP_LOG_PARENT_DIR'];
  } else {
    process.env['NEOSQL_MCP_LOG_PARENT_DIR'] = previousLogParentDir;
  }
});

describe('resolveLogAppName', () => {
  it('returns the production app name for the prod profile', () => {
    expect(resolveLogAppName('prod')).toBe('NeoSqlMcp');
  });

  it('returns the development app name for the dev profile', () => {
    expect(resolveLogAppName('dev')).toBe('NeoSqlMcpDev');
  });

  it('treats local and stage as non-prod (share the dev log dir)', () => {
    expect(resolveLogAppName('local')).toBe('NeoSqlMcpDev');
    expect(resolveLogAppName('stage')).toBe('NeoSqlMcpDev');
  });
});

describe('resolveLogParentDir', () => {
  it('returns the Electron-style logs parent for the current OS', () => {
    if (process.platform === 'darwin') {
      expect(resolveLogParentDir()).toBe(path.join(os.homedir(), 'Library', 'Logs'));
    } else if (process.platform === 'win32') {
      expect(resolveLogParentDir()).toBe(
        process.env['APPDATA'] ?? path.join(os.homedir(), 'AppData', 'Roaming'),
      );
    } else {
      expect(resolveLogParentDir()).toBe(
        process.env['XDG_CONFIG_HOME'] ?? path.join(os.homedir(), '.config'),
      );
    }
  });

  it('returns the configured log parent when NEOSQL_MCP_LOG_PARENT_DIR is set', () => {
    process.env['NEOSQL_MCP_LOG_PARENT_DIR'] = path.join(os.tmpdir(), 'neosql-mcp-log-parent');

    expect(resolveLogParentDir()).toBe(process.env['NEOSQL_MCP_LOG_PARENT_DIR']);
  });
});

describe('resolveLogDir', () => {
  it('returns the prod log directory under the current OS log parent', () => {
    expect(resolveLogDir('prod')).toBe(path.join(resolveLogParentDir(), 'NeoSqlMcp'));
  });

  it('returns the dev log directory under the current OS log parent', () => {
    expect(resolveLogDir('dev')).toBe(path.join(resolveLogParentDir(), 'NeoSqlMcpDev'));
  });
});

describe('resolveLogFilePath', () => {
  it('returns the prod log file path under the prod log directory', () => {
    expect(resolveLogFilePath('prod')).toBe(path.join(resolveLogDir('prod'), LOG_FILE_NAME));
  });

  it('returns the dev log file path under the dev log directory', () => {
    expect(resolveLogFilePath('dev')).toBe(path.join(resolveLogDir('dev'), LOG_FILE_NAME));
  });
});
