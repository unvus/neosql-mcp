import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerPingTool } from './tools/ping.js';
import { resolveSocketPath, type Profile } from '../upstream/endpoint-resolver.js';
import { postRpc as defaultPostRpc } from '../upstream/http-client.js';
import { createContextStore } from './tools/context/store.js';
import { registerGenerateCodeTool } from './tools/code-generation/generate-code.js';
import { registerListTablesTool } from './tools/schema/list-tables.js';
import { registerGetTableDetailsTool } from './tools/schema/get-table-details.js';
import { registerSetContextTool } from './tools/context/set-context.js';
import { registerGetContextTool } from './tools/context/get-context.js';
import { registerGetContextHelpTool } from './tools/context/get-context-help.js';
import { registerCreateTablesTool } from './tools/ddl/create-tables.js';
import { registerModifyTablesTool } from './tools/ddl/modify-tables.js';
import { registerExecuteQueryTool } from './tools/sql/execute-query.js';
import { mcpSessionId } from './session.js';
import { registerGetMcpSessionIdTool } from './tools/get-mcp-session-id.js';

export const SERVER_NAME = 'neosql-mcp';
export const SERVER_VERSION = '0.0.1';

export interface CreateServerOptions {
  profile?: Profile;
  socketPath?: string;
}

export const createServer = (opts: CreateServerOptions = {}): McpServer => {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  const profile = opts.profile ?? 'prod';
  const socketPath = opts.socketPath ?? resolveSocketPath(profile);
  const contextStore = createContextStore();
  const postRpc = <T = unknown>(method: string, params?: unknown): Promise<T> =>
    defaultPostRpc<T>({ socketPath, method, params });

  registerPingTool(server);
  registerGetMcpSessionIdTool(server, mcpSessionId);
  registerGenerateCodeTool(server, { postRpc });
  registerListTablesTool(server, { postRpc });
  registerGetTableDetailsTool(server, { postRpc });
  registerSetContextTool(server, contextStore);
  registerGetContextTool(server, contextStore);
  registerGetContextHelpTool(server);
  registerCreateTablesTool(server, { postRpc, contextStore });
  registerModifyTablesTool(server, { postRpc, contextStore });
  registerExecuteQueryTool(server, { postRpc, contextStore });

  return server;
};
