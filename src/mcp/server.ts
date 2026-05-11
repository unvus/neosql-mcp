import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerPingTool } from './tools/ping.js';
import { resolveSocketPath, type Profile } from '../upstream/endpoint-resolver.js';
import { postRpc as defaultPostRpc } from '../upstream/http-client.js';
import { ensureDesktopReady as defaultEnsureDesktopReady } from '../upstream/desktop-readiness.js';
import type {
  AppActivationRequester,
  DesktopInstallationChecker,
} from '../upstream/desktop-readiness.js';
import { createContextStore } from './tools/context/store.js';
import type { NeosqlContextPatch } from './tools/context/store.js';
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
  initialContext?: NeosqlContextPatch;
  desktopHealthTimeoutMs?: number;
  requestAppActivation?: AppActivationRequester;
  checkDesktopInstallation?: DesktopInstallationChecker;
}

export const createServer = (opts: CreateServerOptions = {}): McpServer => {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  const profile = opts.profile ?? 'prod';
  const socketPath = opts.socketPath ?? resolveSocketPath(profile);
  const contextStore = createContextStore();
  if (opts.initialContext !== undefined) contextStore.set(opts.initialContext);
  const postRpc = <T = unknown>(
    method: string,
    params?: unknown,
    rpcOpts?: { timeoutMs?: number },
  ): Promise<T> =>
    defaultPostRpc<T>({
      socketPath,
      method,
      params,
      ...(rpcOpts?.timeoutMs === undefined ? {} : { timeoutMs: rpcOpts.timeoutMs }),
    });
  const ensureDesktopReady = () =>
    defaultEnsureDesktopReady({
      socketPath,
      profile,
      ...(opts.desktopHealthTimeoutMs === undefined
        ? {}
        : { timeoutMs: opts.desktopHealthTimeoutMs }),
      ...(opts.requestAppActivation === undefined
        ? {}
        : { requestActivation: opts.requestAppActivation }),
      ...(opts.checkDesktopInstallation === undefined
        ? {}
        : { checkInstallation: opts.checkDesktopInstallation }),
    });
  const upstreamDeps = { postRpc, contextStore, sessionId: mcpSessionId, ensureDesktopReady };

  registerPingTool(server);
  registerGetMcpSessionIdTool(server, mcpSessionId);
  registerGenerateCodeTool(server, upstreamDeps);
  registerListTablesTool(server, upstreamDeps);
  registerGetTableDetailsTool(server, upstreamDeps);
  registerSetContextTool(server, contextStore);
  registerGetContextTool(server, contextStore);
  registerGetContextHelpTool(server);
  registerCreateTablesTool(server, upstreamDeps);
  registerModifyTablesTool(server, upstreamDeps);
  registerExecuteQueryTool(server, upstreamDeps);

  return server;
};
