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
import {
  detectDesktopInstallation,
  type DesktopInstallationResult,
  type DetectDesktopInstallationOptions,
} from './desktop-installation.js';
import { observe } from './observation.js';
import { activationTargetForProfile, type ActivationTarget } from './profile-names.js';

export {
  activationTargetForProfile,
  type ActivationTarget,
  type ActivationUrl,
} from './profile-names.js';
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
  /** The environment the launch starts from (defaults to this process's). */
  env?: NodeJS.ProcessEnv;
  /** Finds the Windows executable of a build without a URL scheme. */
  checkInstallation?: (
    opts: DetectDesktopInstallationOptions,
  ) => Promise<DesktopInstallationResult>;
}

interface ActivationCommand {
  command: string;
  args: string[];
  /**
   * `exit`: a helper (open, cmd) hands the request to the OS and exits; 0 means requested.
   * `spawn`: the app itself was started. It keeps running, so starting is the evidence.
   */
  completion: 'exit' | 'spawn';
  /** Hides a helper's console. Off for the app itself: it would also hide the app window. */
  windowsHide: boolean;
}

/**
 * The environment for the process that wakes the desktop app. NeoSQLEnterprise runs this server with its own executable in
 * Node mode (`ELECTRON_RUN_AS_NODE=1`). A child inherits that variable, so the app started directly on Windows would also
 * run as Node and exit at once instead of opening its window. Drop it for every launch: no launcher needs it.
 */
export const activationEnv = (env: NodeJS.ProcessEnv): NodeJS.ProcessEnv => {
  const { ELECTRON_RUN_AS_NODE: _runAsNode, ...rest } = env;
  return rest;
};

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
      windowsHide: activationCommand.windowsHide,
      env: activationEnv(opts.env ?? process.env),
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
      const onSpawn = () => settle({ status: 'requested', target });
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
        child.removeListener('spawn', onSpawn);
        child.removeListener('error', onError);
        opts.signal?.removeEventListener('abort', onAbort);
      };
      if (activationCommand.completion === 'spawn') child.once('spawn', onSpawn);
      else child.once('exit', onExit);
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
    checkInstallation?: RequestAppActivationOptions['checkInstallation'];
  },
): Promise<ActivationCommand> => {
  const activationUrl = target.activationUrl;
  if (platform === 'darwin') {
    // `open -a` launches the app or brings the running one to the front, with or without a URL.
    const appSpecifier = await macActivationAppSpecifier(target, opts);
    return {
      command: 'open',
      args: ['-a', appSpecifier, ...(activationUrl === undefined ? [] : [activationUrl])],
      completion: 'exit',
      windowsHide: true,
    };
  }

  if (activationUrl === undefined) {
    if (platform === 'win32') return windowsAppLaunchCommand(target, opts);
    throw new Error(`${target.productName} cannot be launched on ${platform}.`);
  }

  if (platform === 'win32') {
    return {
      command: 'cmd',
      args: ['/d', '/c', 'start', '""', activationUrl],
      completion: 'exit',
      windowsHide: true,
    };
  }

  return {
    command: 'xdg-open',
    args: [activationUrl],
    completion: 'exit',
    windowsHide: true,
  };
};

/**
 * Starts the installed executable. A second start of a running app reaches the running instance,
 * which brings its window to the front, and then exits.
 */
const windowsAppLaunchCommand = async (
  target: ActivationTarget,
  opts: {
    signal?: AbortSignal;
    checkInstallation?: RequestAppActivationOptions['checkInstallation'];
  },
): Promise<ActivationCommand> => {
  const installation = await (opts.checkInstallation ?? detectDesktopInstallation)({
    profile: target.profile,
    platform: 'win32',
    ...(opts.signal === undefined ? {} : { signal: opts.signal }),
  });
  if (installation.status !== 'installed')
    throw new Error(`${target.productName} installation could not be found.`);
  return {
    command: installation.executablePath,
    args: [],
    completion: 'spawn',
    windowsHide: false,
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
