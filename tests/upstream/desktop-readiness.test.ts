import { describe, expect, it } from 'vitest';
import { ensureDesktopReady } from '../../src/upstream/desktop-readiness.js';
import type { ActivationResult } from '../../src/upstream/app-activation.js';
import type { HealthResult } from '../../src/upstream/health-check.js';

const activationResult: ActivationResult = {
  status: 'requested',
  target: {
    profile: 'prod',
    productName: 'NeoSQL',
    appId: 'com.unvus.neosql',
    activationUrl: 'neosql://mcp/activate',
  },
};

describe('ensureDesktopReady', () => {
  it('returns ready without activation when the upstream health check is running', async () => {
    const activationCalls: string[] = [];

    const result = await ensureDesktopReady({
      socketPath: '/tmp/neosql-mcp.sock',
      profile: 'prod',
      checkHealth: async (): Promise<HealthResult> => ({ status: 'running' }),
      requestActivation: async () => {
        activationCalls.push('called');
        return activationResult;
      },
    });

    expect(result).toEqual({ status: 'ready', healthStatus: 'running' });
    expect(activationCalls).toEqual([]);
  });

  it.each(['not_running', 'stale_socket'] as const)(
    'requests activation and does not mark ready when health status is %s',
    async (healthStatus) => {
      const activationCalls: string[] = [];

      const result = await ensureDesktopReady({
        socketPath: '/tmp/neosql-mcp.sock',
        profile: 'prod',
        checkHealth: async () => ({ status: healthStatus }),
        checkInstallation: async ({ profile }) => ({
          status: 'installed',
          platform: 'darwin',
          target: {
            profile,
            productName: profile === 'dev' ? 'NeoSQLDev' : 'NeoSQL',
            appId: profile === 'dev' ? 'com.unvus.neosql.dev' : 'com.unvus.neosql',
            activationUrl: 'neosql://mcp/activate',
          },
          executablePath: '/Applications/NeoSQL.app/Contents/MacOS/NeoSQL',
          checkedExecutablePaths: ['/Applications/NeoSQL.app/Contents/MacOS/NeoSQL'],
        }),
        requestActivation: async () => {
          activationCalls.push(healthStatus);
          return activationResult;
        },
      });

      expect(result).toEqual({
        status: 'activation_requested',
        healthStatus,
        activation: activationResult,
        installation: {
          status: 'installed',
          platform: 'darwin',
          target: {
            profile: 'prod',
            productName: 'NeoSQL',
            appId: 'com.unvus.neosql',
            activationUrl: 'neosql://mcp/activate',
          },
          executablePath: '/Applications/NeoSQL.app/Contents/MacOS/NeoSQL',
          checkedExecutablePaths: ['/Applications/NeoSQL.app/Contents/MacOS/NeoSQL'],
        },
      });
      expect(activationCalls).toEqual([healthStatus]);
    },
  );

  it('returns not_installed without activation when macOS installation paths are empty', async () => {
    const activationCalls: string[] = [];

    const result = await ensureDesktopReady({
      socketPath: '/tmp/neosql-mcp.sock',
      profile: 'prod',
      checkHealth: async (): Promise<HealthResult> => ({ status: 'not_running' }),
      checkInstallation: async ({ profile }) => ({
        status: 'not_installed',
        platform: 'darwin',
        target: {
          profile,
          productName: 'NeoSQL',
          appId: 'com.unvus.neosql',
          activationUrl: 'neosql://mcp/activate',
        },
        checkedExecutablePaths: [
          '/Applications/NeoSQL.app/Contents/MacOS/NeoSQL',
          '/Users/shock/Applications/NeoSQL.app/Contents/MacOS/NeoSQL',
        ],
        installGuideUrl: 'https://neosql.unvus.com/ko/docs/install',
      }),
      requestActivation: async () => {
        activationCalls.push('called');
        return activationResult;
      },
    });

    expect(result).toEqual({
      status: 'not_installed',
      healthStatus: 'not_running',
      installation: {
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
          '/Users/shock/Applications/NeoSQL.app/Contents/MacOS/NeoSQL',
        ],
        installGuideUrl: 'https://neosql.unvus.com/ko/docs/install',
      },
    });
    expect(activationCalls).toEqual([]);
  });

  it('returns unresponsive without activation when the health check times out', async () => {
    const activationCalls: string[] = [];

    const result = await ensureDesktopReady({
      socketPath: '/tmp/neosql-mcp.sock',
      profile: 'prod',
      checkHealth: async (): Promise<HealthResult> => ({ status: 'timeout' }),
      requestActivation: async () => {
        activationCalls.push('called');
        return activationResult;
      },
    });

    expect(result).toEqual({ status: 'unresponsive', healthStatus: 'timeout' });
    expect(activationCalls).toEqual([]);
  });
});
