import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Profile } from './endpoint-resolver.js';
import { mcpPackageNameForProfile } from './profile-names.js';

export type McpConfigFileReader = (filePath: string) => Promise<string>;

export interface ReadRecordedAppPathOptions {
  profile: Profile;
  homeDir?: string;
  readFile?: McpConfigFileReader;
}

export const mcpConfigPathForProfile = (opts: { profile: Profile; homeDir: string }): string =>
  path.join(opts.homeDir, `.${mcpPackageNameForProfile(opts.profile)}`, 'mcp-config.json');

export const readRecordedAppPath = async (
  opts: ReadRecordedAppPathOptions,
): Promise<string | undefined> => {
  const configPath = mcpConfigPathForProfile({
    profile: opts.profile,
    homeDir: opts.homeDir ?? os.homedir(),
  });
  const reader = opts.readFile ?? defaultReadFile;

  try {
    const parsed = JSON.parse(await reader(configPath)) as { appPath?: unknown };
    return typeof parsed.appPath === 'string' && parsed.appPath.length > 0
      ? parsed.appPath
      : undefined;
  } catch {
    return undefined;
  }
};

const defaultReadFile: McpConfigFileReader = async (filePath) => readFile(filePath, 'utf8');
