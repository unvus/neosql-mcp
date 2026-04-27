import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerPingTool } from './tools/ping.js';

export const SERVER_NAME = 'neosql-mcp';
export const SERVER_VERSION = '0.0.1';

export const createServer = (): McpServer => {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  registerPingTool(server);
  return server;
};
