import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Profile } from './endpoint-resolver.js';
import {
  readRecordedAppPath,
  type McpConfigFileReader,
  type ReadRecordedAppPathOptions,
} from './mcp-config-record.js';
import { observe } from './observation.js';
import { protocolSchemeForProfile } from './profile-names.js';

export interface ActivationTarget {
  profile: Profile;
  productName: string;
  appId: string;
  activationUrl: ActivationUrl;
}

export type ActivationUrl = `${string}://mcp/activate`;
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
export type ActivationPathExists = (candidate: string) => Promise<boolean>;

export interface RequestAppActivationOptions {
  profile: Profile;
  signal?: AbortSignal;
  platform?: ActivationPlatform;
  homeDir?: string;
  readMcpConfigFile?: McpConfigFileReader;
  pathExists?: ActivationPathExists;
  launcher?: ProcessLauncher;
}

interface ActivationCommand {
  command: string;
  args: string[];
}

export const activationTargetForProfile = (profile: Profile): ActivationTarget => {
  const activationUrl = activationUrlForProfile(profile);

  if (profile === 'prod') {
    return {
      profile,
      productName: 'NeoSQL',
      appId: 'com.unvus.neosql',
      activationUrl,
    };
  }

  return {
    profile,
    productName: `NeoSQL${capitalizeProfile(profile)}`,
    appId: `com.unvus.neosql.${profile}`,
    activationUrl,
  };
};

const capitalizeProfile = (profile: Exclude<Profile, 'prod'>): string =>
  `${profile.charAt(0).toUpperCase()}${profile.slice(1)}`;

const activationUrlForProfile = (profile: Profile): ActivationUrl =>
  `${protocolSchemeForProfile(profile)}://mcp/activate`;

export const requestAppActivation = async (
  opts: RequestAppActivationOptions,
): Promise<ActivationResult> => {
  const target = activationTargetForProfile(opts.profile);
  const platform = opts.platform ?? process.platform;
  const launcher = opts.launcher ?? spawn;
  opts.signal?.throwIfAborted();
  try {
    const activationCommand = await observe(opts.signal, () =>
      commandForPlatform(platform, target, opts),
    );
    opts.signal?.throwIfAborted();
    const child = launcher(activationCommand.command, activationCommand.args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();

    return await new Promise<ActivationResult>((resolve, reject) => {
      let settled = false;
      const settle = (result: ActivationResult): void => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(result);
      };

      const onExit = (code: number | null) =>
        settle(
          code === 0
            ? { status: 'requested', target }
            : {
                status: 'request_failed',
                target,
                error: 'Activation command did not exit successfully.',
              },
        );
      const onError = (err: Error) =>
        settle({ status: 'request_failed', target, error: err.message });
      const onAbort = () => {
        if (settled) return;
        settled = true;
        cleanup();
        // Keep the detached app alive. A late launcher error still needs a listener.
        child.once('error', () => {});
        reject(opts.signal?.reason);
      };
      const cleanup = () => {
        child.removeListener('exit', onExit);
        child.removeListener('error', onError);
        opts.signal?.removeEventListener('abort', onAbort);
      };
      child.once('exit', onExit);
      child.once('error', onError);
      opts.signal?.addEventListener('abort', onAbort, { once: true });
      if (opts.signal?.aborted) onAbort();
    });
  } catch (err) {
    opts.signal?.throwIfAborted();
    return {
      status: 'request_failed',
      target,
      error: err instanceof Error ? err.message : String(err),
    };
  }
};

const commandForPlatform = async (
  platform: ActivationPlatform,
  target: ActivationTarget,
  opts: {
    signal?: AbortSignal;
    homeDir?: string;
    readMcpConfigFile?: McpConfigFileReader;
    pathExists?: ActivationPathExists;
  },
): Promise<ActivationCommand> => {
  if (platform === 'darwin') {
    const appSpecifier = await macActivationAppSpecifier(target, opts);
    return {
      command: 'open',
      args: ['-a', appSpecifier, target.activationUrl],
    };
  }

  if (platform === 'win32') {
    return {
      command: 'cmd',
      args: ['/d', '/c', 'start', '""', target.activationUrl],
    };
  }

  return {
    command: 'xdg-open',
    args: [target.activationUrl],
  };
};

const recordedAppPathOptions = (
  profile: Profile,
  opts: {
    signal?: AbortSignal;
    homeDir?: string;
    readMcpConfigFile?: McpConfigFileReader;
    pathExists?: ActivationPathExists;
  },
): ReadRecordedAppPathOptions => {
  const readOptions: ReadRecordedAppPathOptions = { profile };
  if (opts.homeDir !== undefined) readOptions.homeDir = opts.homeDir;
  if (opts.readMcpConfigFile !== undefined) readOptions.readFile = opts.readMcpConfigFile;
  return readOptions;
};

const macActivationAppSpecifier = async (
  target: ActivationTarget,
  opts: {
    signal?: AbortSignal;
    homeDir?: string;
    readMcpConfigFile?: McpConfigFileReader;
    pathExists?: ActivationPathExists;
  },
): Promise<string> => {
  const pathExists = (candidate: string) =>
    observe(opts.signal, () => (opts.pathExists ?? defaultPathExists)(candidate));
  const homeDir = opts.homeDir ?? os.homedir();

  for (const appPath of macDesktopAppBundleCandidates({
    productName: target.productName,
    homeDir,
  })) {
    if (await pathExists(appPath)) return target.productName;
  }

  const recordedAppPath = await observe(opts.signal, () =>
    readRecordedAppPath(recordedAppPathOptions(target.profile, opts)),
  );
  if (recordedAppPath === undefined) return target.productName;

  return (await pathExists(recordedAppPath)) ? recordedAppPath : target.productName;
};

const macDesktopAppBundleCandidates = (opts: {
  productName: string;
  homeDir: string;
}): string[] => [
  path.posix.join('/Applications', `${opts.productName}.app`),
  path.posix.join(opts.homeDir, 'Applications', `${opts.productName}.app`),
];

const defaultPathExists: ActivationPathExists = async (candidate) => {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
};
