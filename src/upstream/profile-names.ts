import type { Profile } from './endpoint-resolver.js';

export const protocolSchemeForProfile = (profile: Profile): string =>
  profile === 'prod' ? 'neosql' : `neosql-${profile}`;

export const mcpPackageNameForProfile = (profile: Profile): string =>
  protocolSchemeForProfile(profile);
