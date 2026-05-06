import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { configureLogger, flushLogger, logger } from '../../src/infra/logger.js';

describe('configureLogger', () => {
  let logParentDir: string;
  let previousLogParentDir: string | undefined;

  beforeEach(() => {
    previousLogParentDir = process.env['NEOSQL_MCP_LOG_PARENT_DIR'];
    logParentDir = mkdtempSync(path.join(os.tmpdir(), 'neosql-mcp-logs-'));
    process.env['NEOSQL_MCP_LOG_PARENT_DIR'] = logParentDir;
  });

  afterEach(() => {
    if (previousLogParentDir === undefined) {
      delete process.env['NEOSQL_MCP_LOG_PARENT_DIR'];
    } else {
      process.env['NEOSQL_MCP_LOG_PARENT_DIR'] = previousLogParentDir;
    }
    rmSync(logParentDir, { recursive: true, force: true });
  });

  it('writes prod logs to the NeoSqlMcp log file', () => {
    configureLogger('prod');
    logger.info('prod log file test');
    flushLogger();

    const logFilePath = path.join(logParentDir, 'NeoSqlMcp', 'neosql-mcp.log');
    expect(readFileSync(logFilePath, 'utf8')).toContain('prod log file test');
  });

  it('writes dev logs to the NeoSqlMcpDev log file', () => {
    configureLogger('dev');
    logger.info('dev log file test');
    flushLogger();

    const logFilePath = path.join(logParentDir, 'NeoSqlMcpDev', 'neosql-mcp.log');
    expect(readFileSync(logFilePath, 'utf8')).toContain('dev log file test');
  });
});
