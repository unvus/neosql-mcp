import type { Profile } from '../upstream/endpoint-resolver.js';
import type { NeosqlContextPatch } from '../mcp/tools/context/store.js';

export interface ParsedCliArgs {
  profile: Profile;
  initialContext: NeosqlContextPatch;
}

export const parseCliArgs = (argv: readonly string[]): ParsedCliArgs => {
  let profile: Profile = 'prod';
  const initialContext: NeosqlContextPatch = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? '';
    if (arg === '--dev') profile = 'dev';
    else if (arg === '--prod') profile = 'prod';
    else if (arg === '--profile') profile = parseProfile(argv[++i]) ?? profile;
    else if (arg.startsWith('--profile=')) profile = parseProfile(valueAfterEquals(arg)) ?? profile;
    else if (arg === '--project') initialContext.projectId = argv[++i];
    else if (arg.startsWith('--project=')) initialContext.projectId = valueAfterEquals(arg);
    else if (arg === '--connection') initialContext.connectionId = argv[++i];
    else if (arg.startsWith('--connection=')) initialContext.connectionId = valueAfterEquals(arg);
    else if (arg === '--schema') initialContext.schema = argv[++i];
    else if (arg.startsWith('--schema=')) initialContext.schema = valueAfterEquals(arg);
  }
  return { profile, initialContext };
};

const valueAfterEquals = (arg: string): string => arg.slice(arg.indexOf('=') + 1);

const parseProfile = (value: string | undefined): Profile | undefined => {
  if (value === 'prod' || value === 'dev') return value;
  return undefined;
};
