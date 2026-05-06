import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import pino from 'pino';
import type { Logger } from 'pino';
import type { Profile } from '../upstream/endpoint-resolver.js';
import { resolveLogFilePath } from './log-path.js';

const createLogger = (destination: pino.DestinationStream): Logger =>
  pino(
    {
      level: process.env['LOG_LEVEL'] ?? 'info',
      base: { name: 'neosql-mcp' },
    },
    destination,
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
