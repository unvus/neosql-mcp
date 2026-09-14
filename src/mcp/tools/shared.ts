import { toolErrorResult } from '../error-map.js';
import { HttpClientError } from '../../upstream/http-client.js';
import type { ProgressNotification } from '@modelcontextprotocol/sdk/types.js';
import { preparationPayload, progressMessages } from './preparation-messages.js';
import type { DesktopReadyResult, PreparationContext } from '../../upstream/desktop-readiness.js';
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
export type DesktopFocusRequester = () => Promise<void>;

export interface UpstreamToolDeps {
  postRpc: PostRpc;
  sessionId: string;
  ensureDesktopReady?: (context?: PreparationContext) => Promise<DesktopReadyResult>;
  requestDesktopFocus?: DesktopFocusRequester;
}

export interface ToolRequestContext {
  signal: AbortSignal;
  _meta?: { progressToken?: string | number | undefined };
  sendNotification: (notification: ProgressNotification) => Promise<void>;
}

export interface UpstreamToolParams<TInput> {
  sessionId: string;
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
  opts: {
    request?: ToolRequestContext;
    timeoutMs?: number;
    stringifyResult?: JsonStringifier;
    mapErrorResult?: ErrorResultMapper;
  } = {},
): Promise<ToolTextResult> => {
  const request = opts.request;
  request?.signal.throwIfAborted();
  let progress = 0;
  if (deps.ensureDesktopReady !== undefined) {
    // Preparation has its own terminal results; operation errors below keep their existing mapping.
    const desktopReady = await deps.ensureDesktopReady({
      ...(request ? { signal: request.signal } : {}),
      onState: async (state) => {
        request?.signal.throwIfAborted();
        const progressToken = request?._meta?.progressToken;
        if (progressToken === undefined) return;
        await request!.sendNotification({
          method: 'notifications/progress',
          params: { progressToken, progress: ++progress, message: progressMessages[state] },
        });
      },
    });
    request?.signal.throwIfAborted();
    if (desktopReady.status !== 'ready')
      return jsonToolErrorResult(preparationPayload(desktopReady));
    if (desktopReady.deadline !== undefined && performance.now() >= desktopReady.deadline) {
      return jsonToolErrorResult(
        preparationPayload({ status: 'readiness_timeout', lastState: 'ready' }),
      );
    }
  }
  request?.signal.throwIfAborted();
  try {
    const params: UpstreamToolParams<TInput> = {
      sessionId: deps.sessionId,
      input,
    };
    const rpcOpts = opts.timeoutMs === undefined ? undefined : { timeoutMs: opts.timeoutMs };
    const result = await deps.postRpc<TResult>(method, params, rpcOpts);
    return jsonTextResult(result, opts.stringifyResult);
  } catch (err) {
    const desktopLifecycleError = desktopLifecycleErrorResult(err, deps);
    if (desktopLifecycleError !== undefined) return desktopLifecycleError;

    const mappedError = opts.mapErrorResult?.(err);
    if (mappedError !== undefined) return mappedError;

    logger.error({ component: 'McpTool', err }, 'Upstream tool call failed');
    return toolErrorResult(err);
  }
};

export const normalizeOptionalNullableString = (
  value: string | null | undefined,
): string | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null || value.trim() === '') return null;
  return value;
};

export const jacksonPrettyJsonStringify = (payload: unknown): string => {
  const compact = JSON.stringify(payload);
  if (compact === undefined) return 'null';
  return formatJacksonPrettyValue(JSON.parse(compact), 0);
};

const desktopLifecycleErrorResult = (
  err: unknown,
  deps: UpstreamToolDeps,
): ToolTextResult | undefined => {
  if (!(err instanceof HttpClientError)) return undefined;

  if (err.kind === 'timeout') {
    return jsonToolErrorResult({
      status: 'unresponsive',
      reason: 'request_timeout',
      message:
        'NeoSQL Desktop did not respond before the request timeout. The request was sent once and was not retried.',
    });
  }

  if (
    err.kind === 'rpc-error' &&
    (err.rpcKind === 'app-not-ready' || err.rpcKind === 'unavailable')
  ) {
    return jsonToolErrorResult({
      status: 'app_not_ready',
      reason: err.rpcKind,
      message:
        'NeoSQL Desktop is running, but the renderer or project session is not ready yet. Run the tool again after the app finishes loading.',
    });
  }

  if (err.kind === 'rpc-error' && err.rpcKind === 'project-not-selected') {
    return textToolErrorResult(err.message);
  }

  if (err.kind === 'rpc-error' && err.rpcKind === 'unauthenticated') {
    requestDesktopFocusWithoutBlockingResponse(deps);
    return jsonToolErrorResult({
      status: 'unauthenticated',
      reason: err.rpcKind,
      message:
        'NeoSQL Desktop is running, but no user is signed in. Sign in to NeoSQL Desktop, then run the tool again.',
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

const requestDesktopFocusWithoutBlockingResponse = (deps: UpstreamToolDeps): void => {
  // Intentionally fire-and-forget so focus failures never alter MCP tool responses.
  try {
    const focusRequest = deps.requestDesktopFocus?.();
    void Promise.resolve(focusRequest).catch((focusErr) => {
      logger.warn({ component: 'McpTool', err: focusErr }, 'Desktop focus request failed');
    });
  } catch (focusErr) {
    logger.warn({ component: 'McpTool', err: focusErr }, 'Desktop focus request failed');
  }
};

const jsonToolErrorResult = (payload: unknown): ToolTextResult => ({
  isError: true,
  content: [{ type: 'text', text: JSON.stringify(payload) }],
});

const textToolErrorResult = (message: string): ToolTextResult => ({
  isError: true,
  content: [{ type: 'text', text: message }],
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
