import { z } from 'zod';
import { HttpClientError } from '../../upstream/http-client.js';
import { jsonToolErrorResult, type PostRpc, type ToolTextResult } from './shared.js';

/**
 * Feature ids that NeoSQL Desktop reports from the internal `get-capabilities` RPC.
 * An id exists only for input an older app would silently handle differently; a new RPC
 * method needs none because an older app rejects it with method-not-found.
 *
 * - virtualRelations: erd-modify-tables foreignKeyOperations with virtual / identifying /
 *   conditions / pkSchemaName. An older app ignores those fields and treats the operation as
 *   a real foreign key, so such a request must never reach it.
 */
export type AppFeature = 'virtualRelations';

/** What to tell the caller about an app that lacks the feature. */
const featureRequirements: Record<
  AppFeature,
  { name: string; appVersion: string; noFallback: string }
> = {
  virtualRelations: {
    name: 'Virtual relations',
    appVersion: 'newer than 4.3.0',
    noFallback: 'Do not send them as regular foreign keys instead.',
  },
};

const capabilitiesSchema = z
  .object({ appVersion: z.string(), features: z.array(z.string()) })
  .passthrough();

export type AppFeatureSupport =
  | { status: 'supported' }
  | { status: 'unsupported'; appVersion?: string }
  | { status: 'unknown' };

/**
 * Ask the running app once. Never cached: there is no persistent upstream connection whose
 * reconnect could invalidate a cache, and the user may update or downgrade NeoSQL Desktop
 * between two calls. A stale "supported" would send virtual relations to an old app.
 */
export const checkAppFeature = async (
  postRpc: PostRpc,
  feature: AppFeature,
): Promise<AppFeatureSupport> => {
  let response: unknown;
  try {
    response = await postRpc('get-capabilities', {}, { timeoutMs: 1000 });
  } catch (error) {
    const oldApp =
      error instanceof HttpClientError &&
      error.kind === 'rpc-error' &&
      (error.rpcKind === 'method-not-found' || error.rpcCode === -32601);
    return oldApp ? { status: 'unsupported' } : { status: 'unknown' };
  }
  const parsed = capabilitiesSchema.safeParse(response);
  if (!parsed.success) return { status: 'unknown' };
  return parsed.data.features.includes(feature)
    ? { status: 'supported' }
    : { status: 'unsupported', appVersion: parsed.data.appVersion };
};

class AppFeatureUnavailableError extends Error {
  constructor(readonly result: ToolTextResult) {
    super('NeoSQL Desktop does not support a feature this request needs.');
  }
}

/**
 * callUpstreamTool options that send the operation only when the app reports `feature`.
 * The check runs after Desktop preparation; otherwise nothing of the operation is sent.
 */
export const requireAppFeature = (
  postRpc: PostRpc,
  feature: AppFeature,
  method: string,
  operationTimeoutMs: number,
): {
  prepareRpc: () => Promise<{ timeoutMs: number }>;
  mapOperationErrorResult: (error: unknown) => ToolTextResult | undefined;
} => ({
  prepareRpc: async () => {
    const support = await checkAppFeature(postRpc, feature);
    if (support.status !== 'supported')
      throw new AppFeatureUnavailableError(featureUnavailableResult(feature, method, support));
    return { timeoutMs: operationTimeoutMs };
  },
  mapOperationErrorResult: (error) =>
    error instanceof AppFeatureUnavailableError ? error.result : undefined,
});

const featureUnavailableResult = (
  feature: AppFeature,
  method: string,
  support: Exclude<AppFeatureSupport, { status: 'supported' }>,
): ToolTextResult => {
  const { name, appVersion, noFallback } = featureRequirements[feature];
  if (support.status === 'unknown') {
    return jsonToolErrorResult({
      status: 'capability_check_failed',
      feature,
      requestSent: false,
      message:
        `Could not confirm that NeoSQL Desktop supports ${name.toLowerCase()}, so ${method} was not sent. ` +
        'Nothing in this request was created or changed.',
      nextAction:
        'Run the tool again. If this keeps happening, ask the user to restart or update NeoSQL Desktop. ' +
        noFallback,
    });
  }
  return jsonToolErrorResult({
    status: 'app_update_required',
    feature,
    ...(support.appVersion === undefined ? {} : { appVersion: support.appVersion }),
    requestSent: false,
    message:
      `${name} need NeoSQL Desktop ${appVersion}. This NeoSQL Desktop does not support them, so ${method} ` +
      'was not sent. Nothing in this request was created or changed.',
    nextAction: `Ask the user to update NeoSQL Desktop to the latest version, then request again. ${noFallback}`,
  });
};
