import type { Profile } from '../upstream/endpoint-resolver.js';

export interface ParsedCliArgs {
  profile: Profile;
}

export const parseCliArgs = (argv: readonly string[]): ParsedCliArgs => {
  let profile: Profile = 'prod';
  for (const arg of argv) {
    if (arg === '--dev') profile = 'dev';
    else if (arg === '--prod') profile = 'prod';
  }
  return { profile };
};
