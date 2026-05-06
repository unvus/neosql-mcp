import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from '../mcp/server.js';
import { configureLogger, flushLogger, logger } from '../infra/logger.js';
import { parseCliArgs } from './cli-args.js';
import { resolveSocketPath, HTTP_PATH } from '../upstream/endpoint-resolver.js';

const main = async (): Promise<void> => {
  const { profile, initialContext } = parseCliArgs(process.argv.slice(2));
  configureLogger(profile);
  const socketPath = resolveSocketPath(profile);

  const server = createServer({ profile, socketPath, initialContext });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info({ transport: 'stdio', profile, socketPath, httpPath: HTTP_PATH }, 'neosql-mcp ready');
};

main().catch((err: unknown) => {
  logger.error({ err }, 'neosql-mcp failed to start');
  flushLogger();
  process.exit(1);
});
