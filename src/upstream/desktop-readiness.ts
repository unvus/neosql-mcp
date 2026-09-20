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
  | 'project_navigation'
  | 'target_loading'
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
  | 'status_check_failed'
  | 'target_unavailable'
  | 'project_lookup_failed'
  | 'project_navigation_failed'
  | 'project_mismatch';
export type DesktopReadyResult =
  | { status: 'ready'; deadline?: number }
  | {
      status: PreparationFailureStatus;
      reason?: ProjectActionReason | 'unsaved_changes';
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
  projectId?: string;
  openProject?: (opts: PostRpcOptions) => Promise<unknown>;
  socketPath: string;
  profile: Profile;
  /** Per-query cap; the overall preparation budget always remains 40 seconds. */
  timeoutMs?: number;
  queryStatus?: (opts: PostRpcOptions) => Promise<unknown>;
  requestActivation?: AppActivationRequester;
  checkInstallation?: DesktopInstallationChecker;
}

export const ensureDesktopReady = async (
  opts: EnsureDesktopReadyOptions,
): Promise<DesktopReadyResult> => {
  opts.signal?.throwIfAborted();
  const deadline = performance.now() + 40_000;
  const controller = new AbortController();
  const expired = new Error('Preparation deadline expired');
  const onAbort = () => controller.abort(opts.signal?.reason);
  opts.signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(expired), 40_000);
  const signal = controller.signal;
  let lastState: PreparationState | undefined;
  let waitingEvidence = false;
  let activationAttempted = false;
  let installationConfirmed = false;
  let targetReached = false;
  let navigationAttempted = false;
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
      if (opts.projectId !== undefined) {
        if (project.projectId !== opts.projectId) {
          if (targetReached || navigationAttempted) return { status: 'project_mismatch' };
          await emit('project_navigation');
          navigationAttempted = true;
          let moved: unknown;
          try {
            const remaining = deadline - performance.now();
            moved = await observe(signal, () => (opts.openProject ?? postRpc)({
              socketPath: opts.socketPath, method: 'open-project', signal, timeoutMs: remaining,
              params: { input: { projectId: opts.projectId }, preparationDeadlineAt: Date.now() + remaining },
            }));
            check();
          } catch { check(); return { status: 'project_navigation_failed' }; }
          if (!moved || typeof moved !== 'object' || Array.isArray(moved)) return { status: 'project_navigation_failed' };
          const result = moved as Record<string, unknown>;
          if (result.projectId !== opts.projectId) return { status: 'project_navigation_failed' };
          switch (result.status) {
            case 'navigated': break;
            case 'authentication_required': return { status: 'authentication_required' };
            case 'target_unavailable': return { status: 'target_unavailable' };
            case 'lookup_failed': return { status: 'project_lookup_failed' };
            case 'user_action_required':
              return result.reason === 'unsaved_changes'
                ? { status: 'user_action_required', reason: 'unsaved_changes' }
                : { status: 'project_navigation_failed' };
            default: return { status: 'project_navigation_failed' };
          }
          targetReached = true;
          waitingEvidence = true;
          await emit('target_loading');
          continue;
        }
        targetReached = true;
      }
      switch (project.state) {
        case 'loading':
          waitingEvidence = true;
          await emit(opts.projectId === undefined ? 'project_loading' : 'target_loading');
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
