import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  detectDesktopInstallation,
  macDesktopExecutableCandidates,
} from '../../src/upstream/desktop-installation.js';

describe('desktop installation detection', () => {
  it('checks the macOS system and user Applications directories for the profile product', async () => {
    const homeDir = path.join(os.tmpdir(), 'neosql-home');

    const result = await detectDesktopInstallation({
      profile: 'prod',
      platform: 'darwin',
      homeDir,
      pathExists: async () => false,
    });

    expect(result).toEqual({
      status: 'not_installed',
      platform: 'darwin',
      target: {
        profile: 'prod',
        productName: 'NeoSQL',
        appId: 'com.unvus.neosql',
        activationUrl: 'neosql://mcp/activate',
      },
      checkedExecutablePaths: [
        '/Applications/NeoSQL.app/Contents/MacOS/NeoSQL',
        path.join(homeDir, 'Applications/NeoSQL.app/Contents/MacOS/NeoSQL'),
      ],
      installGuideUrl: 'https://neosql.unvus.com/ko/docs/install',
    });
  });

  it('returns installed when a macOS profile executable exists', async () => {
    const homeDir = path.join(os.tmpdir(), 'neosql-home');
    const expectedPath = path.join(homeDir, 'Applications/NeoSQLDev.app/Contents/MacOS/NeoSQLDev');

    const result = await detectDesktopInstallation({
      profile: 'dev',
      platform: 'darwin',
      homeDir,
      pathExists: async (candidate) => candidate === expectedPath,
    });

    expect(result).toEqual({
      status: 'installed',
      platform: 'darwin',
      target: {
        profile: 'dev',
        productName: 'NeoSQLDev',
        appId: 'com.unvus.neosql.dev',
        activationUrl: 'neosql://mcp/activate',
      },
      executablePath: expectedPath,
      checkedExecutablePaths: [
        '/Applications/NeoSQLDev.app/Contents/MacOS/NeoSQLDev',
        expectedPath,
      ],
    });
  });

  it('checks profile-specific macOS executable paths for local profile', async () => {
    const homeDir = path.join(os.tmpdir(), 'neosql-home');

    const result = await detectDesktopInstallation({
      profile: 'local',
      platform: 'darwin',
      homeDir,
      pathExists: async () => false,
    });

    expect(result).toEqual({
      status: 'not_installed',
      platform: 'darwin',
      target: {
        profile: 'local',
        productName: 'NeoSQLLocal',
        appId: 'com.unvus.neosql.local',
        activationUrl: 'neosql://mcp/activate',
      },
      checkedExecutablePaths: [
        '/Applications/NeoSQLLocal.app/Contents/MacOS/NeoSQLLocal',
        path.join(homeDir, 'Applications/NeoSQLLocal.app/Contents/MacOS/NeoSQLLocal'),
      ],
      installGuideUrl: 'https://neosql.unvus.com/ko/docs/install',
    });
  });

  it('does not classify Windows until the installation locations are confirmed', async () => {
    const result = await detectDesktopInstallation({
      profile: 'prod',
      platform: 'win32',
    });

    expect(result).toMatchObject({
      status: 'not_checked',
      platform: 'win32',
      reason: 'unsupported_platform',
    });
  });

  it('builds macOS executable candidates from the product name', () => {
    expect(
      macDesktopExecutableCandidates({
        productName: 'NeoSQL',
        homeDir: '/Users/shock',
      }),
    ).toEqual([
      '/Applications/NeoSQL.app/Contents/MacOS/NeoSQL',
      '/Users/shock/Applications/NeoSQL.app/Contents/MacOS/NeoSQL',
    ]);
  });
});
