import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerPingTool } from './tools/ping.js';
import { resolveSocketPath, type Profile } from '../upstream/endpoint-resolver.js';
import { postRpc as defaultPostRpc } from '../upstream/http-client.js';
import { ensureDesktopReady as defaultEnsureDesktopReady } from '../upstream/desktop-readiness.js';
import type {
  AppActivationRequester,
  DesktopInstallationChecker,
} from '../upstream/desktop-readiness.js';
import { requestAppActivation as defaultRequestAppActivation } from '../upstream/app-activation.js';
import { registerGenerateCodeTool } from './tools/code-generation/generate-code.js';
import { registerListConnectionsTool } from './tools/connection/list-connections.js';
import { registerListTablesTool } from './tools/schema/list-tables.js';
import { registerGetTableDetailsTool } from './tools/schema/get-table-details.js';
import { registerGetContextHelpTool } from './tools/context/get-context-help.js';
import { registerExecuteQueryTool } from './tools/sql/execute-query.js';
import { registerErdCreateTablesTool } from './tools/erd/erd-create-tables.js';
import { registerErdModifyTablesTool } from './tools/erd/erd-modify-tables.js';
import { mcpSessionId } from './session.js';
import { registerGetMcpSessionIdTool } from './tools/get-mcp-session-id.js';
import type { PostRpc, UpstreamToolDeps } from './tools/shared.js';

export const SERVER_NAME = 'neosql-mcp';
export const SERVER_VERSION = '0.0.1';

export interface CreateServerOptions {
  profile?: Profile;
  socketPath?: string;
  desktopHealthTimeoutMs?: number;
  requestAppActivation?: AppActivationRequester;
  checkDesktopInstallation?: DesktopInstallationChecker;
}

export const createServer = (opts: CreateServerOptions = {}): McpServer => {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  const profile = opts.profile ?? 'prod';
  const socketPath = opts.socketPath ?? resolveSocketPath(profile);

  const upstreamDeps = createUpstreamToolDeps(opts, profile, socketPath);
  registerTools(server, upstreamDeps);

  return server;
};

const createUpstreamToolDeps = (
  opts: CreateServerOptions,
  profile: Profile,
  socketPath: string,
): UpstreamToolDeps => ({
  postRpc: createPostRpc(socketPath),
  sessionId: mcpSessionId,
  ensureDesktopReady: createDesktopReadyChecker(opts, profile, socketPath),
  requestDesktopFocus: createDesktopFocusRequester(opts, profile),
});

const createPostRpc =
  (socketPath: string): PostRpc =>
  <T = unknown>(method: string, params?: unknown, rpcOpts?: { timeoutMs?: number }): Promise<T> =>
    defaultPostRpc<T>({
      socketPath,
      method,
      params,
      ...(rpcOpts?.timeoutMs === undefined ? {} : { timeoutMs: rpcOpts.timeoutMs }),
    });

const createDesktopReadyChecker =
  (opts: CreateServerOptions, profile: Profile, socketPath: string) => () =>
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

const createDesktopFocusRequester = (opts: CreateServerOptions, profile: Profile) => async () => {
  const activationRequester = opts.requestAppActivation ?? defaultRequestAppActivation;
  await activationRequester({ profile });
};

const registerTools = (server: McpServer, upstreamDeps: UpstreamToolDeps): void => {
  registerPingTool(server);
  registerGetMcpSessionIdTool(server, mcpSessionId);
  registerGenerateCodeTool(server, upstreamDeps);
  registerListConnectionsTool(server, upstreamDeps);
  registerListTablesTool(server, upstreamDeps);
  registerGetTableDetailsTool(server, upstreamDeps);
  registerGetContextHelpTool(server);
  registerErdCreateTablesTool(server, upstreamDeps);
  registerErdModifyTablesTool(server, upstreamDeps);
  registerExecuteQueryTool(server, upstreamDeps);
};
