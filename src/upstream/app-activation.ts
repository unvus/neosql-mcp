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

// Desktop installer 는 NeoSQL(prod) 과 NeoSQLDev(non-prod) 두 종류만 생성하므로
// activation target 도 prod / non-prod 바이너리로 분리한다. local/dev/stage 모두 NeoSQLDev 를 깨움.
export const activationTargetForProfile = (profile: Profile): ActivationTarget => ({
  profile,
  productName: profile === 'prod' ? 'NeoSQL' : 'NeoSQLDev',
  appId: profile === 'prod' ? 'com.unvus.neosql' : 'com.unvus.neosql.dev',
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
