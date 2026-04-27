import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
import { logger } from './logger.js';

const main = async (): Promise<void> => {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info({ transport: 'stdio' }, 'neosql-mcp ready');
};

main().catch((err: unknown) => {
  logger.error({ err }, 'neosql-mcp failed to start');
  process.exit(1);
});
