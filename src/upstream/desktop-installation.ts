import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { activationTargetForProfile, type ActivationPlatform } from './app-activation.js';
import type { Profile } from './endpoint-resolver.js';

export const NEOSQL_INSTALL_GUIDE_URL = 'https://neosql.unvus.com/ko/docs/install';

const ELECTRON_BUILDER_NS_UUID = '50e065bc-3134-11e6-9bab-38c9862bdaf3';
const WINDOWS_UNINSTALL_KEY_PREFIX =
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall';
const execFileAsync = promisify(execFile);

export type PathExists = (candidate: string) => Promise<boolean>;
export type WindowsRegistryQuery = (key: string) => Promise<string>;
export type WindowsNotInstalledReason =
  | 'registry_missing'
  | 'display_icon_missing'
  | 'executable_missing';

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
      status: 'installed';
      platform: 'win32';
      target: ReturnType<typeof activationTargetForProfile>;
      executablePath: string;
      checkedRegistryKey: string;
      displayName?: string;
      displayVersion?: string;
      displayIcon?: string;
      publisher?: string;
      uninstallString?: string;
    }
  | {
      status: 'not_installed';
      platform: 'win32';
      target: ReturnType<typeof activationTargetForProfile>;
      checkedRegistryKey: string;
      reason: WindowsNotInstalledReason;
      executablePath?: string;
      displayName?: string;
      displayVersion?: string;
      displayIcon?: string;
      publisher?: string;
      uninstallString?: string;
      installGuideUrl: typeof NEOSQL_INSTALL_GUIDE_URL;
    }
  | {
      status: 'not_checked';
      platform: Exclude<ActivationPlatform, 'darwin' | 'win32'>;
      target: ReturnType<typeof activationTargetForProfile>;
      reason: 'unsupported_platform';
    };

export interface DetectDesktopInstallationOptions {
  profile: Profile;
  platform?: ActivationPlatform;
  homeDir?: string;
  pathExists?: PathExists;
  registryQuery?: WindowsRegistryQuery;
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

  if (platform === 'win32') {
    return detectWindowsDesktopInstallation({
      profile: opts.profile,
      target,
      pathExists: opts.pathExists ?? defaultPathExists,
      registryQuery: opts.registryQuery ?? defaultWindowsRegistryQuery,
    });
  }

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

export const windowsNsisUninstallGuid = (profile: Profile): string =>
  uuidV5(activationTargetForProfile(profile).appId, ELECTRON_BUILDER_NS_UUID);

export const windowsNsisUninstallRegistryKey = (profile: Profile): string =>
  `${WINDOWS_UNINSTALL_KEY_PREFIX}\\${windowsNsisUninstallGuid(profile)}`;

interface DetectWindowsDesktopInstallationOptions {
  profile: Profile;
  target: ReturnType<typeof activationTargetForProfile>;
  pathExists: PathExists;
  registryQuery: WindowsRegistryQuery;
}

interface WindowsUninstallRegistryValues {
  displayName?: string;
  displayVersion?: string;
  displayIcon?: string;
  publisher?: string;
  uninstallString?: string;
}

const detectWindowsDesktopInstallation = async (
  opts: DetectWindowsDesktopInstallationOptions,
): Promise<DesktopInstallationResult> => {
  const checkedRegistryKey = windowsNsisUninstallRegistryKey(opts.profile);

  let registryValues: WindowsUninstallRegistryValues;
  try {
    registryValues = parseWindowsUninstallRegistry(await opts.registryQuery(checkedRegistryKey));
  } catch {
    return {
      status: 'not_installed',
      platform: 'win32',
      target: opts.target,
      checkedRegistryKey,
      reason: 'registry_missing',
      installGuideUrl: NEOSQL_INSTALL_GUIDE_URL,
    };
  }

  const executablePath = executablePathFromDisplayIcon(registryValues.displayIcon);
  if (!executablePath) {
    return windowsNotInstalledFromRegistry({
      target: opts.target,
      checkedRegistryKey,
      registryValues,
      reason: 'display_icon_missing',
    });
  }

  if (!(await opts.pathExists(executablePath))) {
    return windowsNotInstalledFromRegistry({
      target: opts.target,
      checkedRegistryKey,
      registryValues,
      reason: 'executable_missing',
      executablePath,
    });
  }

  return {
    status: 'installed',
    platform: 'win32',
    target: opts.target,
    checkedRegistryKey,
    executablePath,
    ...registryValues,
  };
};

const windowsNotInstalledFromRegistry = (opts: {
  target: ReturnType<typeof activationTargetForProfile>;
  checkedRegistryKey: string;
  registryValues: WindowsUninstallRegistryValues;
  reason: WindowsNotInstalledReason;
  executablePath?: string;
}): DesktopInstallationResult => {
  const result: DesktopInstallationResult = {
    status: 'not_installed',
    platform: 'win32',
    target: opts.target,
    checkedRegistryKey: opts.checkedRegistryKey,
    reason: opts.reason,
    ...opts.registryValues,
    installGuideUrl: NEOSQL_INSTALL_GUIDE_URL,
  };
  if (opts.executablePath !== undefined) result.executablePath = opts.executablePath;
  return result;
};

const parseWindowsUninstallRegistry = (output: string): WindowsUninstallRegistryValues => {
  const values: WindowsUninstallRegistryValues = {};
  for (const line of output.split(/\r?\n/)) {
    const match = /^\s+(DisplayName|DisplayVersion|DisplayIcon|Publisher|UninstallString)\s+REG_\w+\s*(.*)$/.exec(
      line,
    );
    if (!match) continue;

    const [, name, value = ''] = match;
    const trimmedValue = value.trim();
    if (name === 'DisplayName') values.displayName = trimmedValue;
    if (name === 'DisplayVersion') values.displayVersion = trimmedValue;
    if (name === 'DisplayIcon') values.displayIcon = trimmedValue;
    if (name === 'Publisher') values.publisher = trimmedValue;
    if (name === 'UninstallString') values.uninstallString = trimmedValue;
  }
  return values;
};

const executablePathFromDisplayIcon = (displayIcon: string | undefined): string | undefined => {
  if (!displayIcon) return undefined;

  const trimmed = displayIcon.trim();
  const quoted = /^"([^"]+\.exe)"(?:,\d+)?$/i.exec(trimmed);
  if (quoted?.[1]) return quoted[1];

  const exeIndex = trimmed.toLowerCase().indexOf('.exe');
  if (exeIndex === -1) return undefined;
  return trimmed.slice(0, exeIndex + '.exe'.length);
};

const uuidV5 = (name: string, namespace: string): string => {
  const namespaceBytes = Buffer.from(namespace.replaceAll('-', ''), 'hex');
  const hash = createHash('sha1').update(namespaceBytes).update(name, 'utf8').digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] ?? 0) & 0x0f | 0x50;
  bytes[8] = (bytes[8] ?? 0) & 0x3f | 0x80;
  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
};

const defaultWindowsRegistryQuery: WindowsRegistryQuery = async (key) => {
  const { stdout } = await execFileAsync('reg', ['query', key], { windowsHide: true });
  return String(stdout);
};

const defaultPathExists: PathExists = async (candidate) => {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
};
