import type { Profile } from './endpoint-resolver.js';

export type ActivationUrl = `${string}://mcp/activate`;

/** The NeoSQL Desktop build that a profile targets. */
export interface ActivationTarget {
  profile: Profile;
  productName: string;
  appId: string;
  /**
   * Deep link that wakes the app. Absent for builds that register no URL scheme
   * (NeoSQLEnterprise): activation then launches the app itself.
   */
  activationUrl?: ActivationUrl;
}

export const protocolSchemeForProfile = (profile: Profile): string =>
  profile === 'prod' ? 'neosql' : `neosql-${profile}`;

export const mcpPackageNameForProfile = (profile: Profile): string =>
  protocolSchemeForProfile(profile);

export const activationTargetForProfile = (profile: Profile): ActivationTarget => {
  const productName = profile === 'prod' ? 'NeoSQL' : `NeoSQL${capitalizeProfile(profile)}`;
  const appId = profile === 'prod' ? 'com.unvus.neosql' : `com.unvus.neosql.${profile}`;
  // NeoSQLEnterprise (connects to customer-installed servers) registers no URL scheme:
  // its sign-in returns to the app over loopback instead.
  if (profile === 'enterprise') return { profile, productName, appId };
  return { profile, productName, appId, activationUrl: activationUrlForProfile(profile) };
};

const capitalizeProfile = (profile: Exclude<Profile, 'prod'>): string =>
  `${profile.charAt(0).toUpperCase()}${profile.slice(1)}`;

const activationUrlForProfile = (profile: Profile): ActivationUrl =>
  `${protocolSchemeForProfile(profile)}://mcp/activate`;
