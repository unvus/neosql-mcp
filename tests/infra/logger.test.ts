import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { configureLogger, flushLogger, formatLogLine, logger } from '../../src/infra/logger.js';
import { resolveLogFilePath } from '../../src/infra/log-path.js';

describe('formatLogLine', () => {
  it('formats pino JSON records as NeoSQL text log lines', () => {
    const time = new Date(2026, 4, 6, 16, 4, 53, 965).getTime();

    expect(
      formatLogLine(
        JSON.stringify({
          level: 30,
          time,
          component: 'McpRpc',
          msg: 'Renderer responded: requestId=1 success=true',
        }),
      ),
    ).toBe(
      '[2026-05-06 16:04:53.965] [info]  [McpRpc] Renderer responded: requestId=1 success=true\n',
    );
  });

  it('appends structured fields after the message', () => {
    const time = new Date(2026, 4, 6, 16, 4, 53, 965).getTime();

    expect(
      formatLogLine(
        JSON.stringify({
          level: 50,
          time,
          component: 'HttpClient',
          msg: 'POST req error',
          code: 'ENOENT',
          retryable: false,
        }),
      ),
    ).toBe(
      '[2026-05-06 16:04:53.965] [error]  [HttpClient] POST req error code=ENOENT retryable=false\n',
    );
  });
});

describe('configureLogger', () => {
  let logParentDir: string;
  let previousLogParentDir: string | undefined;

  beforeEach(() => {
    previousLogParentDir = process.env['NEOSQL_MCP_LOG_PARENT_DIR'];
    logParentDir = mkdtempSync(path.join(os.tmpdir(), 'neosql-mcp-logs-'));
    process.env['NEOSQL_MCP_LOG_PARENT_DIR'] = logParentDir;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    if (previousLogParentDir === undefined) {
      delete process.env['NEOSQL_MCP_LOG_PARENT_DIR'];
    } else {
      process.env['NEOSQL_MCP_LOG_PARENT_DIR'] = previousLogParentDir;
    }
    rmSync(logParentDir, { recursive: true, force: true });
  });

  describe.each(['local', 'dev', 'stage', 'prod'] as const)('%s profile', (profile) => {
    it.each([undefined, 'debug', 'trace', 'silent'])(
      'filters file logs by profile even when LOG_LEVEL is %s',
      (envLevel) => {
        vi.stubEnv('LOG_LEVEL', envLevel);
        configureLogger(profile);
        logger.trace('profile trace marker');
        logger.debug('profile debug marker');
        logger.info('profile info marker');
        logger.warn('profile warn marker');
        logger.error('profile error marker');
        flushLogger();

        const contents = readFileSync(resolveLogFilePath(profile), 'utf8');
        expect(contents.includes('profile debug marker')).toBe(
          profile === 'local' || profile === 'dev',
        );
        expect(contents).not.toContain('profile trace marker');
        expect(contents).toContain('profile info marker');
        expect(contents).toContain('profile warn marker');
        expect(contents).toContain('profile error marker');
      },
    );
  });

  it('writes prod logs to the NeoSqlMcp log file', () => {
    configureLogger('prod');
    logger.info('prod log file test');
    flushLogger();

    const logFilePath = path.join(logParentDir, 'NeoSqlMcp', 'neosql-mcp.log');
    expect(readFileSync(logFilePath, 'utf8')).toMatch(
      /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\] \[info\]  \[NeoSqlMcp\] prod log file test\n$/,
    );
  });

  it('writes dev logs to the NeoSqlMcpDev log file', () => {
    configureLogger('dev');
    logger.info({ component: 'McpRpc' }, 'dev log file test');
    flushLogger();

    const logFilePath = path.join(logParentDir, 'NeoSqlMcpDev', 'neosql-mcp.log');
    expect(readFileSync(logFilePath, 'utf8')).toMatch(
      /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\] \[info\]  \[McpRpc\] dev log file test\n$/,
    );
  });
});
