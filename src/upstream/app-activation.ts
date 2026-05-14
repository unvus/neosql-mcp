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
  const activationCommand = await commandForPlatform(platform, target, opts);

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

const commandForPlatform = async (
  platform: ActivationPlatform,
  target: ActivationTarget,
  opts: {
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
    homeDir?: string;
    readMcpConfigFile?: McpConfigFileReader;
    pathExists?: ActivationPathExists;
  },
): Promise<string> => {
  const pathExists = opts.pathExists ?? defaultPathExists;
  const homeDir = opts.homeDir ?? os.homedir();

  for (const appPath of macDesktopAppBundleCandidates({
    productName: target.productName,
    homeDir,
  })) {
    if (await pathExists(appPath)) return target.productName;
  }

  const recordedAppPath = await readRecordedAppPath(recordedAppPathOptions(target.profile, opts));
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
