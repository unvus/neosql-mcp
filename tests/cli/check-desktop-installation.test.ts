import { describe, expect, it, vi } from 'vitest';
import { runDesktopInstallationCheck } from '../../src/cli/check-desktop-installation.js';

vi.mock('../../src/upstream/desktop-installation.js', () => ({
  detectDesktopInstallation: vi.fn(async ({ profile }: { profile: Profile }) => {
    const productName =
      profile === 'prod'
        ? 'NeoSQL'
        : `NeoSQL${profile.charAt(0).toUpperCase()}${profile.slice(1)}`;

    return {
      status: 'not_installed',
      platform: 'darwin',
      target: {
        profile,
        productName,
        appId: profile === 'prod' ? 'com.unvus.neosql' : `com.unvus.neosql.${profile}`,
        activationUrl: 'neosql://mcp/activate',
      },
      checkedExecutablePaths: [`/Applications/${productName}.app/Contents/MacOS/${productName}`],
      installGuideUrl: 'https://neosql.unvus.com/ko/docs/install',
    };
  }),
}));

type Profile = 'prod' | 'dev' | 'local' | 'stage';

describe('check-desktop-installation CLI', () => {
  it('prints the desktop installation result as JSON for the selected profile', async () => {
    let output = '';

    await runDesktopInstallationCheck(['--profile', 'dev'], (text) => {
      output += text;
    });

    expect(JSON.parse(output)).toEqual({
      status: 'not_installed',
      platform: 'darwin',
      target: {
        profile: 'dev',
        productName: 'NeoSQLDev',
        appId: 'com.unvus.neosql.dev',
        activationUrl: 'neosql://mcp/activate',
      },
      checkedExecutablePaths: ['/Applications/NeoSQLDev.app/Contents/MacOS/NeoSQLDev'],
      installGuideUrl: 'https://neosql.unvus.com/ko/docs/install',
    });
  });
});
