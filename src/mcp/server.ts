import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerPingTool } from './tools/ping.js';
import type { Profile } from '../upstream/endpoint-resolver.js';

export const SERVER_NAME = 'neosql-mcp';
export const SERVER_VERSION = '0.0.1';

export interface CreateServerOptions {
  profile?: Profile;
  socketPath?: string;
}

export const createServer = (_opts: CreateServerOptions = {}): McpServer => {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  registerPingTool(server);
  return server;
};
