import { toolErrorResult } from '../error-map.js';
import { HttpClientError } from '../../upstream/http-client.js';
import type { DesktopReadyResult } from '../../upstream/desktop-readiness.js';
import {
  mergeContext,
  type ContextStore,
  type NeosqlContext,
  type NeosqlContextPatch,
} from './context/store.js';
import { logger } from '../../infra/logger.js';

export interface ToolTextResult {
  [key: string]: unknown;
  isError?: true;
  content: Array<{ type: 'text'; text: string }>;
}

export type PostRpc = <T = unknown>(
  method: string,
  params?: unknown,
  opts?: { timeoutMs?: number },
) => Promise<T>;

export type JsonStringifier = (payload: unknown) => string;
export type ErrorResultMapper = (err: unknown) => ToolTextResult | undefined;

export interface UpstreamToolDeps {
  postRpc: PostRpc;
  contextStore: ContextStore;
  sessionId: string;
  ensureDesktopReady?: () => Promise<DesktopReadyResult>;
}

export interface UpstreamToolParams<TInput> {
  sessionId: string;
  context: NeosqlContext;
  input: TInput;
}

export const jsonTextResult = (
  payload: unknown,
  stringify: JsonStringifier = JSON.stringify,
): ToolTextResult => ({
  content: [{ type: 'text', text: stringify(payload) }],
});

export const callUpstreamTool = async <TResult = unknown, TInput = unknown>(
  deps: UpstreamToolDeps,
  method: string,
  input: TInput,
  contextPatch: NeosqlContextPatch = {},
  opts: {
    timeoutMs?: number;
    stringifyResult?: JsonStringifier;
    mapErrorResult?: ErrorResultMapper;
  } = {},
): Promise<ToolTextResult> => {
  try {
    if (deps.ensureDesktopReady !== undefined) {
      const desktopReady = await deps.ensureDesktopReady();
      if (desktopReady.status !== 'ready') return desktopLifecycleResult(desktopReady);
    }

    const context = mergeContext(deps.contextStore.get(), contextPatch);
    const params: UpstreamToolParams<TInput> = {
      sessionId: deps.sessionId,
      context,
      input,
    };
    const rpcOpts = opts.timeoutMs === undefined ? undefined : { timeoutMs: opts.timeoutMs };
    const result = await deps.postRpc<TResult>(method, params, rpcOpts);
    return jsonTextResult(result, opts.stringifyResult);
  } catch (err) {
    const desktopLifecycleError = desktopLifecycleErrorResult(err);
    if (desktopLifecycleError !== undefined) return desktopLifecycleError;

    const mappedError = opts.mapErrorResult?.(err);
    if (mappedError !== undefined) return mappedError;

    logger.error({ component: 'McpTool', err }, 'Upstream tool call failed');
    return toolErrorResult(err);
  }
};

export const jacksonPrettyJsonStringify = (payload: unknown): string => {
  const compact = JSON.stringify(payload);
  if (compact === undefined) return 'null';
  return formatJacksonPrettyValue(JSON.parse(compact), 0);
};

const desktopLifecycleResult = (result: Exclude<DesktopReadyResult, { status: 'ready' }>) => {
  if (result.status === 'activation_requested') {
    return jsonToolErrorResult({
      status: 'activation_requested',
      healthStatus: result.healthStatus,
      message:
        'NeoSQL Desktop is not running. Activation was requested. Run the tool again after NeoSQL Desktop is ready.',
      activation: result.activation,
      desktop: {
        singleton: 'neosql-mcp processes share one NeoSQL Desktop instance.',
      },
    });
  }

  if (result.status === 'not_installed') {
    return jsonToolErrorResult({
      status: 'not_installed',
      healthStatus: result.healthStatus,
      message:
        'NeoSQL Desktop was not found in the supported macOS application directories. Install NeoSQL Desktop or move the app to /Applications or ~/Applications, then run the tool again. See the install guide for details.',
      installGuideUrl: result.installation.installGuideUrl,
      installation: result.installation,
    });
  }

  return jsonToolErrorResult({
    status: 'unresponsive',
    healthStatus: result.healthStatus,
    reason: 'health_timeout',
    message:
      'NeoSQL Desktop did not respond to the readiness check. The original tool request was not sent.',
  });
};

const desktopLifecycleErrorResult = (err: unknown): ToolTextResult | undefined => {
  if (!(err instanceof HttpClientError)) return undefined;

  if (err.kind === 'timeout') {
    return jsonToolErrorResult({
      status: 'unresponsive',
      reason: 'request_timeout',
      message:
        'NeoSQL Desktop did not respond before the request timeout. The request was sent once and was not retried.',
    });
  }

  if (err.kind === 'rpc-error' && err.rpcKind === 'app-not-ready') {
    return jsonToolErrorResult({
      status: 'app_not_ready',
      reason: err.rpcKind,
      message:
        'NeoSQL Desktop is running, but the renderer is not ready yet. Run the tool again after the app finishes loading.',
    });
  }

  if (err.kind === 'rpc-error' && err.rpcKind === 'timeout') {
    return jsonToolErrorResult({
      status: 'unresponsive',
      reason: 'renderer_timeout',
      message:
        'NeoSQL Desktop did not respond before the renderer timeout. The request was sent once and was not retried.',
    });
  }

  return undefined;
};

const jsonToolErrorResult = (payload: unknown): ToolTextResult => ({
  isError: true,
  content: [{ type: 'text', text: JSON.stringify(payload) }],
});

const formatJacksonPrettyValue = (value: unknown, indentLevel: number): string => {
  if (Array.isArray(value)) return formatJacksonPrettyArray(value, indentLevel);
  if (value !== null && typeof value === 'object') {
    return formatJacksonPrettyObject(value as Record<string, unknown>, indentLevel);
  }
  return JSON.stringify(value);
};

const formatJacksonPrettyObject = (value: Record<string, unknown>, indentLevel: number): string => {
  const entries = Object.entries(value);
  if (entries.length === 0) return '{ }';

  const nextIndent = indent(indentLevel + 1);
  const currentIndent = indent(indentLevel);
  const lines = entries.map(
    ([key, entryValue]) =>
      `${nextIndent}${JSON.stringify(key)} : ${formatJacksonPrettyValue(
        entryValue,
        indentLevel + 1,
      )}`,
  );
  return `{\n${lines.join(',\n')}\n${currentIndent}}`;
};

const formatJacksonPrettyArray = (value: unknown[], indentLevel: number): string => {
  if (value.length === 0) return '[ ]';
  const items = value.map((entry) => formatJacksonPrettyValue(entry, indentLevel));
  return `[ ${items.join(', ')} ]`;
};

const indent = (level: number): string => '  '.repeat(level);
