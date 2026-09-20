import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from '../mcp/server.js';
import { configureLogger, flushLogger, logger } from '../infra/logger.js';
import { parseCliArgs } from './cli-args.js';
import { resolveSocketPath, HTTP_PATH } from '../upstream/endpoint-resolver.js';

const main = async (): Promise<void> => {
  const { profile, projectId } = parseCliArgs(process.argv.slice(2));
  configureLogger(profile);
  const socketPath = resolveSocketPath(profile);

  const server = createServer({ profile, socketPath, ...(projectId === undefined ? {} : { projectId }) });
  const transport = new StdioServerTransport();
  let closing = false;
  const closeOnInputEnd = (): void => {
    if (closing) return;
    closing = true;
    process.stdin.off('end', closeOnInputEnd);
    process.stdin.off('close', closeOnInputEnd);
    // The SDK transport does not turn stdin EOF into onclose/request cancellation.
    void server.close().catch((err: unknown) => {
      logger.error({ component: 'McpServer', err }, 'neosql-mcp failed to close');
      flushLogger();
      process.exitCode = 1;
    });
  };
  process.stdin.once('end', closeOnInputEnd);
  process.stdin.once('close', closeOnInputEnd);
  try {
    await server.connect(transport);
  } catch (err) {
    process.stdin.off('end', closeOnInputEnd);
    process.stdin.off('close', closeOnInputEnd);
    throw err;
  }
  logger.info(
    { component: 'McpServer', transport: 'stdio', profile, socketPath, httpPath: HTTP_PATH },
    'neosql-mcp ready',
  );
};

main().catch((err: unknown) => {
  logger.error({ component: 'McpServer', err }, 'neosql-mcp failed to start');
  flushLogger();
  process.exit(1);
});
