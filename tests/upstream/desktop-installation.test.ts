import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  detectDesktopInstallation,
  macDesktopExecutableCandidates,
  windowsNsisUninstallGuid,
  windowsNsisUninstallRegistryKey,
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
        activationUrl: 'neosql-dev://mcp/activate',
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
        activationUrl: 'neosql-local://mcp/activate',
      },
      checkedExecutablePaths: [
        '/Applications/NeoSQLLocal.app/Contents/MacOS/NeoSQLLocal',
        path.join(homeDir, 'Applications/NeoSQLLocal.app/Contents/MacOS/NeoSQLLocal'),
      ],
      installGuideUrl: 'https://neosql.unvus.com/ko/docs/install',
    });
  });

  it('computes the electron-builder NSIS uninstall GUID for each profile app id', () => {
    expect(windowsNsisUninstallGuid('prod')).toBe('45315cf5-be09-5107-ad81-bd3145331a04');
    expect(windowsNsisUninstallGuid('dev')).toBe('e2fc7451-e33b-52fb-ad6e-90987868f2e4');
    expect(windowsNsisUninstallGuid('stage')).toBe('8ca05a6c-d77c-53a8-96f8-a66895be5391');
    expect(windowsNsisUninstallGuid('local')).toBe('507e3cc9-4de0-5788-b852-f143471d08d0');
  });

  it('builds the HKCU NSIS uninstall registry key for Windows profiles', () => {
    expect(windowsNsisUninstallRegistryKey('prod')).toBe(
      'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\45315cf5-be09-5107-ad81-bd3145331a04',
    );
  });

  it('returns installed when the Windows HKCU uninstall registry points to an existing executable', async () => {
    const executablePath = 'C:\\Users\\shock\\AppData\\Local\\Programs\\NeoSQL\\NeoSQL.exe';

    const result = await detectDesktopInstallation({
      profile: 'prod',
      platform: 'win32',
      registryQuery: async () => `
HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\45315cf5-be09-5107-ad81-bd3145331a04
    DisplayName    REG_SZ    NeoSQL 0.0.2
    DisplayVersion    REG_SZ    0.0.2
    DisplayIcon    REG_SZ    ${executablePath},0
    Publisher    REG_SZ    Unvus Co., Ltd.
`,
      pathExists: async (candidate) => candidate === executablePath,
    });

    expect(result).toEqual({
      status: 'installed',
      platform: 'win32',
      target: {
        profile: 'prod',
        productName: 'NeoSQL',
        appId: 'com.unvus.neosql',
        activationUrl: 'neosql://mcp/activate',
      },
      executablePath,
      checkedRegistryKey:
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\45315cf5-be09-5107-ad81-bd3145331a04',
      displayName: 'NeoSQL 0.0.2',
      displayVersion: '0.0.2',
      displayIcon: `${executablePath},0`,
      publisher: 'Unvus Co., Ltd.',
    });
  });

  it('returns not_installed when the Windows HKCU uninstall registry is missing', async () => {
    const result = await detectDesktopInstallation({
      profile: 'prod',
      platform: 'win32',
      registryQuery: async () => {
        throw new Error('registry key not found');
      },
    });

    expect(result).toEqual({
      status: 'not_installed',
      platform: 'win32',
      target: {
        profile: 'prod',
        productName: 'NeoSQL',
        appId: 'com.unvus.neosql',
        activationUrl: 'neosql://mcp/activate',
      },
      checkedRegistryKey:
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\45315cf5-be09-5107-ad81-bd3145331a04',
      reason: 'registry_missing',
      installGuideUrl: 'https://neosql.unvus.com/ko/docs/install',
    });
  });

  it('returns not_installed when the Windows uninstall registry executable is missing', async () => {
    const executablePath = 'C:\\Users\\shock\\AppData\\Local\\Programs\\NeoSQL\\NeoSQL.exe';

    const result = await detectDesktopInstallation({
      profile: 'prod',
      platform: 'win32',
      registryQuery: async () => `
HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\45315cf5-be09-5107-ad81-bd3145331a04
    DisplayName    REG_SZ    NeoSQL 0.0.2
    DisplayIcon    REG_SZ    "${executablePath}",0
`,
      pathExists: async () => false,
    });

    expect(result).toEqual({
      status: 'not_installed',
      platform: 'win32',
      target: {
        profile: 'prod',
        productName: 'NeoSQL',
        appId: 'com.unvus.neosql',
        activationUrl: 'neosql://mcp/activate',
      },
      checkedRegistryKey:
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\45315cf5-be09-5107-ad81-bd3145331a04',
      reason: 'executable_missing',
      executablePath,
      displayName: 'NeoSQL 0.0.2',
      displayIcon: `"${executablePath}",0`,
      installGuideUrl: 'https://neosql.unvus.com/ko/docs/install',
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
