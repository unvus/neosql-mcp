import { checkHealth, type HealthResult, type HealthStatus } from './health-check.js';
import {
  requestAppActivation,
  type ActivationResult,
  type RequestAppActivationOptions,
} from './app-activation.js';
import type { Profile } from './endpoint-resolver.js';

export type DesktopReadyStatus = 'ready' | 'activation_requested' | 'unresponsive';

export type DesktopReadyResult =
  | { status: 'ready'; healthStatus: 'running' }
  | {
      status: 'activation_requested';
      healthStatus: 'not_running' | 'stale_socket';
      activation: ActivationResult;
    }
  | { status: 'unresponsive'; healthStatus: 'timeout' };

export type HealthChecker = (
  socketPath: string,
  opts?: { timeoutMs?: number },
) => Promise<HealthResult>;

export type AppActivationRequester = (
  opts: RequestAppActivationOptions,
) => Promise<ActivationResult>;

export interface EnsureDesktopReadyOptions {
  socketPath: string;
  profile: Profile;
  timeoutMs?: number;
  checkHealth?: HealthChecker;
  requestActivation?: AppActivationRequester;
}

export const ensureDesktopReady = async (
  opts: EnsureDesktopReadyOptions,
): Promise<DesktopReadyResult> => {
  const healthChecker = opts.checkHealth ?? checkHealth;
  const activationRequester = opts.requestActivation ?? requestAppActivation;
  const health = await healthChecker(
    opts.socketPath,
    opts.timeoutMs === undefined ? undefined : { timeoutMs: opts.timeoutMs },
  );

  if (health.status === 'running') return { status: 'ready', healthStatus: 'running' };
  if (isActivationHealthStatus(health.status)) {
    const activation = await activationRequester({ profile: opts.profile });
    return { status: 'activation_requested', healthStatus: health.status, activation };
  }

  return { status: 'unresponsive', healthStatus: 'timeout' };
};

const isActivationHealthStatus = (
  status: HealthStatus,
): status is 'not_running' | 'stale_socket' =>
  status === 'not_running' || status === 'stale_socket';
