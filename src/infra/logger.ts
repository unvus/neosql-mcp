import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import pino from 'pino';
import type { Logger } from 'pino';
import type { Profile } from '../upstream/endpoint-resolver.js';
import { resolveLogFilePath } from './log-path.js';

const DEFAULT_COMPONENT = 'NeoSqlMcp';
const LOG_RECORD_KEYS = new Set(['level', 'time', 'pid', 'hostname', 'name', 'component', 'msg']);

const createLogger = (destination: pino.DestinationStream): Logger =>
  pino(
    {
      level: process.env['LOG_LEVEL'] ?? 'info',
      base: { component: DEFAULT_COMPONENT },
    },
    createFormattedDestination(destination),
  );

export let logger = createLogger(pino.destination(2));

export const configureLogger = (profile: Profile): void => {
  logger = createLogger(createFileDestination(profile));
};

const createFileDestination = (profile: Profile): pino.DestinationStream => {
  const logFilePath = resolveLogFilePath(profile);
  try {
    mkdirSync(dirname(logFilePath), { recursive: true });
    return pino.destination({ dest: logFilePath, sync: true });
  } catch {
    return pino.destination(2);
  }
};

export const flushLogger = (): void => {
  logger.flush();
};

interface PinoLogRecord {
  level?: number | string;
  time?: number | string;
  name?: string;
  component?: string;
  msg?: string;
  [key: string]: unknown;
}

function createFormattedDestination(destination: pino.DestinationStream): pino.DestinationStream {
  return {
    write: (msg: string): void => {
      destination.write(formatLogLine(msg));
    },
  };
}

export const formatLogLine = (line: string): string => {
  try {
    const record = JSON.parse(line) as PinoLogRecord;
    return `${formatHeader(record)} ${formatMessage(record)}${formatExtraFields(record)}\n`;
  } catch {
    return line;
  }
};

const formatHeader = (record: PinoLogRecord): string => {
  const timestamp = formatTimestamp(record.time);
  const level = formatLevel(record.level);
  const component = record.component ?? record.name ?? DEFAULT_COMPONENT;
  return `[${timestamp}] [${level}]  [${component}]`;
};

const formatTimestamp = (time: number | string | undefined): string => {
  const date = typeof time === 'number' || typeof time === 'string' ? new Date(time) : new Date();
  const pad = (value: number, length = 2): string => String(value).padStart(length, '0');

  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(
      date.getMilliseconds(),
      3,
    )}`,
  ].join(' ');
};

const formatLevel = (level: number | string | undefined): string => {
  if (typeof level === 'string') return level.toLowerCase();
  if (level === 10) return 'trace';
  if (level === 20) return 'debug';
  if (level === 30) return 'info';
  if (level === 40) return 'warn';
  if (level === 50) return 'error';
  if (level === 60) return 'fatal';
  return 'info';
};

const formatMessage = (record: PinoLogRecord): string => record.msg ?? '';

const formatExtraFields = (record: PinoLogRecord): string => {
  const fields = Object.entries(record)
    .filter(([key, value]) => !LOG_RECORD_KEYS.has(key) && value !== undefined)
    .map(([key, value]) => `${key}=${formatFieldValue(value)}`);

  return fields.length > 0 ? ` ${fields.join(' ')}` : '';
};

const formatFieldValue = (value: unknown): string => {
  if (value instanceof Error) return value.message;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return String(value);
  return JSON.stringify(value);
};
