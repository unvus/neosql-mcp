import { describe, expect, it, vi } from 'vitest';
import { runDesktopInstallationCheck } from '../../src/cli/check-desktop-installation.js';

vi.mock('../../src/upstream/desktop-installation.js', () => ({
  detectDesktopInstallation: vi.fn(async ({ profile }: { profile: 'prod' | 'dev' }) => ({
    status: 'not_installed',
    platform: 'darwin',
    target: {
      profile,
      productName: profile === 'dev' ? 'NeoSQLDev' : 'NeoSQL',
      appId: profile === 'dev' ? 'com.unvus.neosql.dev' : 'com.unvus.neosql',
      activationUrl: 'neosql://mcp/activate',
    },
    checkedExecutablePaths: [
      `/Applications/${profile === 'dev' ? 'NeoSQLDev' : 'NeoSQL'}.app/Contents/MacOS/${
        profile === 'dev' ? 'NeoSQLDev' : 'NeoSQL'
      }`,
    ],
    installGuideUrl: 'https://neosql.unvus.com/ko/docs/install',
  })),
}));

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
