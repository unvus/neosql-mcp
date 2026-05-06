import { toolErrorResult } from '../error-map.js';
import {
  mergeContext,
  type ContextStore,
  type NeosqlContext,
  type NeosqlContextPatch,
} from './context/store.js';
import { logger } from '../../infra/logger.js';

export interface ToolTextResult {
  [key: string]: unknown;
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

const formatJacksonPrettyValue = (value: unknown, indentLevel: number): string => {
  if (Array.isArray(value)) return formatJacksonPrettyArray(value, indentLevel);
  if (value !== null && typeof value === 'object') {
    return formatJacksonPrettyObject(value as Record<string, unknown>, indentLevel);
  }
  return JSON.stringify(value);
};

const formatJacksonPrettyObject = (
  value: Record<string, unknown>,
  indentLevel: number,
): string => {
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
