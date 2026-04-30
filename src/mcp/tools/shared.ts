import { toolErrorResult } from '../error-map.js';
import {
  mergeContext,
  type ContextStore,
  type NeosqlContext,
  type NeosqlContextPatch,
} from './context/store.js';

export interface ToolTextResult {
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
}

export type PostRpc = <T = unknown>(
  method: string,
  params?: unknown,
  opts?: { timeoutMs?: number },
) => Promise<T>;

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

export const jsonTextResult = (payload: unknown): ToolTextResult => ({
  content: [{ type: 'text', text: JSON.stringify(payload) }],
});

export const callUpstreamTool = async <TResult = unknown, TInput = unknown>(
  deps: UpstreamToolDeps,
  method: string,
  input: TInput,
  contextPatch: NeosqlContextPatch = {},
  opts: { timeoutMs?: number } = {},
): Promise<ToolTextResult> => {
  try {
    const context = mergeContext(deps.contextStore.get(), contextPatch);
    const params: UpstreamToolParams<TInput> = {
      sessionId: deps.sessionId,
      context,
      input,
    };
    const result = await deps.postRpc<TResult>(method, params, opts);
    return jsonTextResult(result);
  } catch (err) {
    return toolErrorResult(err);
  }
};
