import type { Profile } from '../upstream/endpoint-resolver.js';

const LEGACY_CONTEXT_ARG_PREFIXES = [
  '--project=',
  '--default-connection=',
  '--default-database=',
  '--default-schema=',
] as const;

export interface ParsedCliArgs {
  profile: Profile;
  projectId?: string;
}

export const parseCliArgs = (argv: readonly string[]): ParsedCliArgs => {
  let profile: Profile = 'prod';
  let projectId: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? '';
    if (arg === '--projectId' || arg.startsWith('--projectId='))
      throw new Error('Use --project-id instead of --projectId.');
    if (arg === '--project-id' || arg.startsWith('--project-id=')) {
      if (projectId !== undefined) throw new Error('--project-id must be specified only once.');
      const value = arg === '--project-id' ? argv[++i] : valueAfterEquals(arg);
      if (!value?.trim() || value.startsWith('--')) throw new Error('--project-id requires a nonempty project ID.');
      projectId = value.trim();
    } else if (arg.startsWith('--profile=')) profile = parseProfile(valueAfterEquals(arg)) ?? profile;
    else if (isLegacyContextArg(arg)) continue;
  }
  return { profile, ...(projectId === undefined ? {} : { projectId }) };
};

const valueAfterEquals = (arg: string): string => arg.slice(arg.indexOf('=') + 1);

const isLegacyContextArg = (arg: string): boolean =>
  LEGACY_CONTEXT_ARG_PREFIXES.some((prefix) => arg.startsWith(prefix));

const parseProfile = (value: string | undefined): Profile | undefined => {
  if (value === 'prod' || value === 'dev' || value === 'local' || value === 'stage') return value;
  return undefined;
};
