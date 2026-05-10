import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import type { Profile } from './endpoint-resolver.js';

export interface ActivationTarget {
  profile: Profile;
  productName: 'NeoSQL' | 'NeoSQLDev';
  appId: 'com.unvus.neosql' | 'com.unvus.neosql.dev';
  activationUrl: 'neosql://mcp/activate';
}

export type ActivationStatus = 'requested' | 'request_failed';

export interface ActivationResult {
  status: ActivationStatus;
  target: ActivationTarget;
  error?: string;
}

export type ActivationPlatform = NodeJS.Platform;

export type ProcessLauncher = (
  command: string,
  args: string[],
  options: SpawnOptions,
) => ChildProcess;

export interface RequestAppActivationOptions {
  profile: Profile;
  platform?: ActivationPlatform;
  launcher?: ProcessLauncher;
}

interface ActivationCommand {
  command: string;
  args: string[];
}

export const activationTargetForProfile = (profile: Profile): ActivationTarget => ({
  profile,
  productName: profile === 'dev' ? 'NeoSQLDev' : 'NeoSQL',
  appId: profile === 'dev' ? 'com.unvus.neosql.dev' : 'com.unvus.neosql',
  activationUrl: 'neosql://mcp/activate',
});

export const requestAppActivation = async (
  opts: RequestAppActivationOptions,
): Promise<ActivationResult> => {
  const target = activationTargetForProfile(opts.profile);
  const platform = opts.platform ?? process.platform;
  const launcher = opts.launcher ?? spawn;
  const activationCommand = commandForPlatform(platform, target);

  try {
    const child = launcher(activationCommand.command, activationCommand.args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();

    return await new Promise<ActivationResult>((resolve) => {
      let settled = false;
      const settle = (result: ActivationResult): void => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      child.once('spawn', () => settle({ status: 'requested', target }));
      child.once('error', (err) =>
        settle({
          status: 'request_failed',
          target,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    });
  } catch (err) {
    return {
      status: 'request_failed',
      target,
      error: err instanceof Error ? err.message : String(err),
    };
  }
};

const commandForPlatform = (
  platform: ActivationPlatform,
  target: ActivationTarget,
): ActivationCommand => {
  if (platform === 'darwin') {
    return {
      command: 'open',
      args: ['-a', target.productName, target.activationUrl],
    };
  }

  if (platform === 'win32') {
    return {
      command: 'cmd',
      args: ['/d', '/s', '/c', `start "" "${target.activationUrl}"`],
    };
  }

  return {
    command: 'xdg-open',
    args: [target.activationUrl],
  };
};
