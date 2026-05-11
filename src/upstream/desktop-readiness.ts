import { checkHealth, type HealthResult, type HealthStatus } from './health-check.js';
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
import type { Profile } from './endpoint-resolver.js';

export type DesktopReadyStatus =
  | 'ready'
  | 'activation_requested'
  | 'not_installed'
  | 'unresponsive';

export type DesktopReadyResult =
  | { status: 'ready'; healthStatus: 'running' }
  | {
      status: 'activation_requested';
      healthStatus: 'not_running' | 'stale_socket';
      activation: ActivationResult;
      installation: Exclude<DesktopInstallationResult, { status: 'not_installed' }>;
    }
  | {
      status: 'not_installed';
      healthStatus: 'not_running' | 'stale_socket';
      installation: Extract<DesktopInstallationResult, { status: 'not_installed' }>;
    }
  | { status: 'unresponsive'; healthStatus: 'timeout' };

export type HealthChecker = (
  socketPath: string,
  opts?: { timeoutMs?: number },
) => Promise<HealthResult>;

export type AppActivationRequester = (
  opts: RequestAppActivationOptions,
) => Promise<ActivationResult>;

export type DesktopInstallationChecker = (
  opts: DetectDesktopInstallationOptions,
) => Promise<DesktopInstallationResult>;

export interface EnsureDesktopReadyOptions {
  socketPath: string;
  profile: Profile;
  timeoutMs?: number;
  checkHealth?: HealthChecker;
  requestActivation?: AppActivationRequester;
  checkInstallation?: DesktopInstallationChecker;
}

export const ensureDesktopReady = async (
  opts: EnsureDesktopReadyOptions,
): Promise<DesktopReadyResult> => {
  const healthChecker = opts.checkHealth ?? checkHealth;
  const activationRequester = opts.requestActivation ?? requestAppActivation;
  const installationChecker = opts.checkInstallation ?? detectDesktopInstallation;
  const health = await healthChecker(
    opts.socketPath,
    opts.timeoutMs === undefined ? undefined : { timeoutMs: opts.timeoutMs },
  );

  if (health.status === 'running') return { status: 'ready', healthStatus: 'running' };
  if (isActivationHealthStatus(health.status)) {
    const installation = await installationChecker({ profile: opts.profile });
    if (installation.status === 'not_installed') {
      return { status: 'not_installed', healthStatus: health.status, installation };
    }

    const activation = await activationRequester({ profile: opts.profile });
    return {
      status: 'activation_requested',
      healthStatus: health.status,
      activation,
      installation,
    };
  }

  return { status: 'unresponsive', healthStatus: 'timeout' };
};

const isActivationHealthStatus = (status: HealthStatus): status is 'not_running' | 'stale_socket' =>
  status === 'not_running' || status === 'stale_socket';
