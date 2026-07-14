import type { Profile } from '../upstream/endpoint-resolver.js';

const LEGACY_CONTEXT_ARG_PREFIXES = [
  '--project=',
  '--default-connection=',
  '--default-database=',
  '--default-schema=',
] as const;

export interface ParsedCliArgs {
  profile: Profile;
}

export const parseCliArgs = (argv: readonly string[]): ParsedCliArgs => {
  let profile: Profile = 'prod';

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? '';
    if (arg.startsWith('--profile=')) profile = parseProfile(valueAfterEquals(arg)) ?? profile;
    else if (isLegacyContextArg(arg)) continue;
  }
  return { profile };
};

const valueAfterEquals = (arg: string): string => arg.slice(arg.indexOf('=') + 1);

const isLegacyContextArg = (arg: string): boolean =>
  LEGACY_CONTEXT_ARG_PREFIXES.some((prefix) => arg.startsWith(prefix));

const parseProfile = (value: string | undefined): Profile | undefined => {
  if (value === 'prod' || value === 'dev' || value === 'local' || value === 'stage') return value;
  return undefined;
};
