import {
  requestAppActivation,
  type ActivationResult,
  type RequestAppActivationOptions,
} from './app-activation.js';
import {
  detectDesktopInstallation,
  type DetectDesktopInstallationOptions,
  type DesktopInstallationResult,
} from './desktop-installation.js';
import { postRpc, HttpClientError, type PostRpcOptions } from './http-client.js';
import type { Profile } from './endpoint-resolver.js';
import { isRuntimeStatus, type ProjectActionReason } from './runtime-status.js';
import { observe, pause } from './observation.js';

export type PreparationState =
  | 'activation_requesting'
  | 'activation_requested'
  | 'renderer_loading'
  | 'project_loading'
  | 'ready';
export type PreparationFailureStatus =
  | 'installation_not_found'
  | 'installation_check_failed'
  | 'activation_failed'
  | 'project_not_selected'
  | 'project_load_failed'
  | 'authentication_required'
  | 'readiness_timeout'
  | 'user_action_required'
  | 'status_check_failed';
export type DesktopReadyResult =
  | { status: 'ready'; deadline?: number }
  | {
      status: PreparationFailureStatus;
      reason?: ProjectActionReason;
      lastState?: PreparationState;
    };
export type AppActivationRequester = (
  opts: RequestAppActivationOptions,
) => Promise<ActivationResult>;
export type DesktopInstallationChecker = (
  opts: DetectDesktopInstallationOptions,
) => Promise<DesktopInstallationResult>;
export interface PreparationContext {
  signal?: AbortSignal;
  onState?: (state: PreparationState) => Promise<void> | void;
}
export interface EnsureDesktopReadyOptions extends PreparationContext {
  socketPath: string;
  profile: Profile;
  /** Per-query cap; the overall preparation budget always remains 20 seconds. */
  timeoutMs?: number;
  queryStatus?: (opts: PostRpcOptions) => Promise<unknown>;
  requestActivation?: AppActivationRequester;
  checkInstallation?: DesktopInstallationChecker;
}

export const ensureDesktopReady = async (
  opts: EnsureDesktopReadyOptions,
): Promise<DesktopReadyResult> => {
  opts.signal?.throwIfAborted();
  const deadline = performance.now() + 20_000;
  const controller = new AbortController();
  const expired = new Error('Preparation deadline expired');
  const onAbort = () => controller.abort(opts.signal?.reason);
  opts.signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(expired), 20_000);
  const signal = controller.signal;
  let lastState: PreparationState | undefined;
  let waitingEvidence = false;
  let activationAttempted = false;
  let installationConfirmed = false;
  const check = () => {
    opts.signal?.throwIfAborted();
    if (performance.now() >= deadline) controller.abort(expired);
    signal.throwIfAborted();
  };
  const emit = async (state: PreparationState) => {
    check();
    if (state === lastState) return;
    lastState = state;
    try {
      await observe(signal, async () => {
        await opts.onState?.(state);
      });
    } catch {
      check(); /* Notification failures alone do not fail preparation. */
    }
    check();
  };
  const wait = async () => {
    check();
    await pause(Math.min(500, deadline - performance.now()), signal);
    check();
  };
  try {
    while (true) {
      check();
      let response: unknown;
      try {
        response = await observe(signal, () =>
          (opts.queryStatus ?? postRpc)({
            socketPath: opts.socketPath,
            method: 'get-runtime-status',
            params: {},
            signal,
            timeoutMs: Math.min(opts.timeoutMs ?? 1000, 1000, deadline - performance.now()),
          }),
        );
        check();
      } catch (error) {
        check();
        const missing =
          error instanceof HttpClientError &&
          (error.kind === 'not-running' || error.kind === 'stale-socket');
        const timeout =
          error instanceof HttpClientError &&
          (error.kind === 'timeout' || (error.kind === 'rpc-error' && error.rpcKind === 'timeout'));
        if (waitingEvidence && (missing || timeout)) {
          await wait();
          continue;
        }
        if (!missing || activationAttempted) return { status: 'status_check_failed' };
        if (!installationConfirmed) {
          let installation: DesktopInstallationResult;
          try {
            installation = await observe(signal, () =>
              (opts.checkInstallation ?? detectDesktopInstallation)({
                profile: opts.profile,
                signal,
              }),
            );
            check();
          } catch {
            check();
            return { status: 'installation_check_failed' };
          }
          if (installation.status === 'not_installed') return { status: 'installation_not_found' };
          if (installation.status !== 'installed') return { status: 'installation_check_failed' };
          installationConfirmed = true;
          await wait();
          continue;
        }
        await emit('activation_requesting');
        check();
        activationAttempted = true;
        let activation: ActivationResult;
        try {
          activation = await observe(signal, () =>
            (opts.requestActivation ?? requestAppActivation)({
              profile: opts.profile,
              signal,
            }),
          );
          check();
        } catch {
          check();
          return { status: 'activation_failed' };
        }
        if (activation.status !== 'requested') return { status: 'activation_failed' };
        waitingEvidence = true;
        await emit('activation_requested');
        await wait();
        continue;
      }
      if (!isRuntimeStatus(response, opts.profile)) return { status: 'status_check_failed' };
      if (response.renderer === 'not_ready') {
        waitingEvidence = true;
        await emit('renderer_loading');
        await wait();
        continue;
      }
      const project = response.project;
      switch (project.state) {
        case 'loading':
          waitingEvidence = true;
          await emit('project_loading');
          await wait();
          break;
        case 'ready':
          await emit('ready');
          check();
          return { status: 'ready', deadline };
        case 'not_selected':
          return { status: 'project_not_selected' };
        case 'failed':
          return { status: 'project_load_failed' };
        case 'authentication_required':
          return { status: 'authentication_required' };
        case 'user_action_required':
          return { status: 'user_action_required', reason: project.reason };
      }
    }
  } catch (error) {
    opts.signal?.throwIfAborted();
    if (error === expired)
      return { status: 'readiness_timeout', ...(lastState ? { lastState } : {}) };
    throw error;
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onAbort);
  }
};
