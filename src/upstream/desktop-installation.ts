import { access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { activationTargetForProfile, type ActivationPlatform } from './app-activation.js';
import type { Profile } from './endpoint-resolver.js';

export type DesktopInstallationStatus = 'installed' | 'not_installed' | 'not_checked';

export const NEOSQL_INSTALL_GUIDE_URL = 'https://neosql.unvus.com/ko/docs/install';

export type PathExists = (candidate: string) => Promise<boolean>;

export type DesktopInstallationResult =
  | {
      status: 'installed';
      platform: 'darwin';
      target: ReturnType<typeof activationTargetForProfile>;
      executablePath: string;
      checkedExecutablePaths: string[];
    }
  | {
      status: 'not_installed';
      platform: 'darwin';
      target: ReturnType<typeof activationTargetForProfile>;
      checkedExecutablePaths: string[];
      installGuideUrl: typeof NEOSQL_INSTALL_GUIDE_URL;
    }
  | {
      status: 'not_checked';
      platform: Exclude<ActivationPlatform, 'darwin'>;
      target: ReturnType<typeof activationTargetForProfile>;
      reason: 'unsupported_platform';
    };

export interface DetectDesktopInstallationOptions {
  profile: Profile;
  platform?: ActivationPlatform;
  homeDir?: string;
  pathExists?: PathExists;
}

export interface MacDesktopExecutableCandidateOptions {
  productName: string;
  homeDir: string;
}

export const detectDesktopInstallation = async (
  opts: DetectDesktopInstallationOptions,
): Promise<DesktopInstallationResult> => {
  const target = activationTargetForProfile(opts.profile);
  const platform = opts.platform ?? process.platform;

  if (platform !== 'darwin') {
    return {
      status: 'not_checked',
      platform,
      target,
      reason: 'unsupported_platform',
    };
  }

  const pathExists = opts.pathExists ?? defaultPathExists;
  const checkedExecutablePaths = macDesktopExecutableCandidates({
    productName: target.productName,
    homeDir: opts.homeDir ?? os.homedir(),
  });

  for (const executablePath of checkedExecutablePaths) {
    if (await pathExists(executablePath)) {
      return { status: 'installed', platform, target, executablePath, checkedExecutablePaths };
    }
  }

  return {
    status: 'not_installed',
    platform,
    target,
    checkedExecutablePaths,
    installGuideUrl: NEOSQL_INSTALL_GUIDE_URL,
  };
};

export const macDesktopExecutableCandidates = (
  opts: MacDesktopExecutableCandidateOptions,
): string[] => [
  path.join('/Applications', `${opts.productName}.app`, 'Contents', 'MacOS', opts.productName),
  path.join(
    opts.homeDir,
    'Applications',
    `${opts.productName}.app`,
    'Contents',
    'MacOS',
    opts.productName,
  ),
];

const defaultPathExists: PathExists = async (candidate) => {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
};
