import { EventEmitter } from 'node:events';
import path from 'node:path';
import type { ChildProcess } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import {
  activationTargetForProfile,
  requestAppActivation,
  type ProcessLauncher,
} from '../../src/upstream/app-activation.js';

describe('app activation', () => {
  const missingMcpConfigFile = async (): Promise<string> => {
    throw Object.assign(new Error('mcp-config.json not found'), { code: 'ENOENT' });
  };

  it('resolves product names and app ids from the MCP profile', () => {
    expect(activationTargetForProfile('prod')).toEqual({
      profile: 'prod',
      productName: 'NeoSQL',
      appId: 'com.unvus.neosql',
      activationUrl: 'neosql://mcp/activate',
    });
    expect(activationTargetForProfile('dev')).toEqual({
      profile: 'dev',
      productName: 'NeoSQLDev',
      appId: 'com.unvus.neosql.dev',
      activationUrl: 'neosql-dev://mcp/activate',
    });
  });

  it('resolves local and stage to profile-specific app targets', () => {
    expect(activationTargetForProfile('local')).toEqual({
      profile: 'local',
      productName: 'NeoSQLLocal',
      appId: 'com.unvus.neosql.local',
      activationUrl: 'neosql-local://mcp/activate',
    });
    expect(activationTargetForProfile('stage')).toEqual({
      profile: 'stage',
      productName: 'NeoSQLStage',
      appId: 'com.unvus.neosql.stage',
      activationUrl: 'neosql-stage://mcp/activate',
    });
  });

  it('resolves the enterprise target without an activation URL because the app registers no deep links', () => {
    expect(activationTargetForProfile('enterprise')).toEqual({
      profile: 'enterprise',
      productName: 'NeoSQLEnterprise',
      appId: 'com.unvus.neosql.enterprise',
    });
  });

  it('requests macOS activation with open -a and the profile product name and URL scheme', async () => {
    const launched: Array<{ command: string; args: string[]; detached: boolean | undefined }> = [];
    const launcher: ProcessLauncher = (command, args, options) => {
      launched.push({ command, args, detached: options.detached });
      const child = new EventEmitter() as ReturnType<ProcessLauncher>;
      child.unref = () => undefined;
      queueMicrotask(() => {
        child.emit('spawn');
        child.emit('exit', 0, null);
      });
      return child;
    };

    const result = await requestAppActivation({
      profile: 'local',
      platform: 'darwin',
      readMcpConfigFile: missingMcpConfigFile,
      pathExists: async () => false,
      launcher,
    });

    expect(result).toMatchObject({ status: 'requested', target: { productName: 'NeoSQLLocal' } });
    expect(launched).toEqual([
      {
        command: 'open',
        args: ['-a', 'NeoSQLLocal', 'neosql-local://mcp/activate'],
        detached: true,
      },
    ]);
  });

  it('prefers the macOS product name when a default app bundle exists', async () => {
    const launched: Array<{ command: string; args: string[] }> = [];
    const launcher: ProcessLauncher = (command, args) => {
      launched.push({ command, args });
      const child = new EventEmitter() as ReturnType<ProcessLauncher>;
      child.unref = () => undefined;
      queueMicrotask(() => {
        child.emit('spawn');
        child.emit('exit', 0, null);
      });
      return child;
    };

    const result = await requestAppActivation({
      profile: 'prod',
      platform: 'darwin',
      homeDir: '/Users/shock',
      readMcpConfigFile: async () => JSON.stringify({ appPath: '/Volumes/Work/Apps/NeoSQL.app' }),
      pathExists: async (candidate) => candidate === '/Applications/NeoSQL.app',
      launcher,
    });

    expect(result.status).toBe('requested');
    expect(launched).toEqual([
      {
        command: 'open',
        args: ['-a', 'NeoSQL', 'neosql://mcp/activate'],
      },
    ]);
  });

  it('requests macOS activation with the recorded app path when mcp-config.json has appPath', async () => {
    const launched: Array<{ command: string; args: string[]; detached: boolean | undefined }> = [];
    const launcher: ProcessLauncher = (command, args, options) => {
      launched.push({ command, args, detached: options.detached });
      const child = new EventEmitter() as ReturnType<ProcessLauncher>;
      child.unref = () => undefined;
      queueMicrotask(() => {
        child.emit('spawn');
        child.emit('exit', 0, null);
      });
      return child;
    };

    const result = await requestAppActivation({
      profile: 'dev',
      platform: 'darwin',
      homeDir: '/Users/shock',
      readMcpConfigFile: async (filePath) => {
        expect(filePath).toBe(path.join('/Users/shock', '.neosql-dev', 'mcp-config.json'));
        return JSON.stringify({ appPath: '/Volumes/Work/Apps/NeoSQLDev.app' });
      },
      pathExists: async (candidate) => candidate === '/Volumes/Work/Apps/NeoSQLDev.app',
      launcher,
    });

    expect(result).toMatchObject({ status: 'requested', target: { productName: 'NeoSQLDev' } });
    expect(launched).toEqual([
      {
        command: 'open',
        args: ['-a', '/Volumes/Work/Apps/NeoSQLDev.app', 'neosql-dev://mcp/activate'],
        detached: true,
      },
    ]);
  });

  it('falls back to the macOS product name when the recorded app path is stale', async () => {
    const launched: Array<{ command: string; args: string[] }> = [];
    const launcher: ProcessLauncher = (command, args) => {
      launched.push({ command, args });
      const child = new EventEmitter() as ReturnType<ProcessLauncher>;
      child.unref = () => undefined;
      queueMicrotask(() => {
        child.emit('spawn');
        child.emit('exit', 0, null);
      });
      return child;
    };

    const result = await requestAppActivation({
      profile: 'prod',
      platform: 'darwin',
      homeDir: '/Users/shock',
      readMcpConfigFile: async () => JSON.stringify({ appPath: '/Users/shock/Desktop/NeoSQL.app' }),
      pathExists: async () => false,
      launcher,
    });

    expect(result.status).toBe('requested');
    expect(launched).toEqual([
      {
        command: 'open',
        args: ['-a', 'NeoSQL', 'neosql://mcp/activate'],
      },
    ]);
  });

  it('falls back to the macOS product name when mcp-config.json is invalid', async () => {
    const launched: Array<{ command: string; args: string[] }> = [];
    const launcher: ProcessLauncher = (command, args) => {
      launched.push({ command, args });
      const child = new EventEmitter() as ReturnType<ProcessLauncher>;
      child.unref = () => undefined;
      queueMicrotask(() => {
        child.emit('spawn');
        child.emit('exit', 0, null);
      });
      return child;
    };

    const result = await requestAppActivation({
      profile: 'stage',
      platform: 'darwin',
      homeDir: '/Users/shock',
      readMcpConfigFile: async () => '{',
      pathExists: async () => false,
      launcher,
    });

    expect(result.status).toBe('requested');
    expect(launched).toEqual([
      {
        command: 'open',
        args: ['-a', 'NeoSQLStage', 'neosql-stage://mcp/activate'],
      },
    ]);
  });

  it('opens the macOS enterprise app by name without a URL', async () => {
    const launched: Array<{ command: string; args: string[] }> = [];
    const launcher: ProcessLauncher = (command, args) => {
      launched.push({ command, args });
      const child = new EventEmitter() as ReturnType<ProcessLauncher>;
      child.unref = () => undefined;
      queueMicrotask(() => {
        child.emit('spawn');
        child.emit('exit', 0, null);
      });
      return child;
    };

    const result = await requestAppActivation({
      profile: 'enterprise',
      platform: 'darwin',
      homeDir: '/Users/shock',
      readMcpConfigFile: missingMcpConfigFile,
      pathExists: async (candidate) => candidate === '/Applications/NeoSQLEnterprise.app',
      launcher,
    });

    expect(result).toMatchObject({
      status: 'requested',
      target: { productName: 'NeoSQLEnterprise' },
    });
    expect(launched).toEqual([{ command: 'open', args: ['-a', 'NeoSQLEnterprise'] }]);
  });

  it('opens the recorded macOS enterprise app path without a URL', async () => {
    const launched: Array<{ command: string; args: string[] }> = [];
    const launcher: ProcessLauncher = (command, args) => {
      launched.push({ command, args });
      const child = new EventEmitter() as ReturnType<ProcessLauncher>;
      child.unref = () => undefined;
      queueMicrotask(() => {
        child.emit('spawn');
        child.emit('exit', 0, null);
      });
      return child;
    };

    const result = await requestAppActivation({
      profile: 'enterprise',
      platform: 'darwin',
      homeDir: '/Users/shock',
      readMcpConfigFile: async (filePath) => {
        expect(filePath).toBe(path.join('/Users/shock', '.neosql-enterprise', 'mcp-config.json'));
        return JSON.stringify({ appPath: '/Volumes/Work/NeoSQLEnterprise.app' });
      },
      pathExists: async (candidate) => candidate === '/Volumes/Work/NeoSQLEnterprise.app',
      launcher,
    });

    expect(result.status).toBe('requested');
    expect(launched).toEqual([
      { command: 'open', args: ['-a', '/Volumes/Work/NeoSQLEnterprise.app'] },
    ]);
  });

  it('launches the installed Windows enterprise executable and reports requested once it spawns', async () => {
    const executablePath =
      'C:\\Users\\shock\\AppData\\Local\\Programs\\neosql-enterprise\\NeoSQLEnterprise.exe';
    const launched: Array<{ command: string; args: string[]; windowsHide: boolean | undefined }> =
      [];
    const launchedEnv: Array<NodeJS.ProcessEnv | undefined> = [];
    const launcher: ProcessLauncher = (command, args, options) => {
      launched.push({ command, args, windowsHide: options.windowsHide });
      launchedEnv.push(options.env);
      const child = new EventEmitter() as ReturnType<ProcessLauncher>;
      child.unref = () => undefined;
      // The first instance keeps running, so only the spawn event arrives.
      queueMicrotask(() => child.emit('spawn'));
      return child;
    };
    const checkedProfiles: string[] = [];

    const result = await requestAppActivation({
      profile: 'enterprise',
      platform: 'win32',
      checkInstallation: async (opts) => {
        checkedProfiles.push(opts.profile);
        return {
          status: 'installed',
          platform: 'win32',
          target: activationTargetForProfile('enterprise'),
          executablePath,
          checkedRegistryKey: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\x',
        };
      },
      launcher,
      // This server runs inside NeoSQLEnterprise's executable in Node mode.
      env: { ELECTRON_RUN_AS_NODE: '1', PATH: 'C:\\Windows' },
    });

    expect(result).toMatchObject({
      status: 'requested',
      target: { productName: 'NeoSQLEnterprise' },
    });
    // The app inheriting it would start as Node and exit instead of opening its window.
    expect(launchedEnv).toEqual([{ PATH: 'C:\\Windows' }]);
    expect(checkedProfiles).toEqual(['enterprise']);
    // windowsHide would also hide the window of a GUI app started directly.
    expect(launched).toEqual([{ command: executablePath, args: [], windowsHide: false }]);
  });

  it('reports request_failed without launching when the Windows enterprise app is not installed', async () => {
    const launcher = vi.fn();

    const result = await requestAppActivation({
      profile: 'enterprise',
      platform: 'win32',
      checkInstallation: async () => ({
        status: 'not_installed',
        platform: 'win32',
        target: activationTargetForProfile('enterprise'),
        checkedRegistryKey: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\x',
        reason: 'registry_missing',
        installGuideUrl: 'https://neosql.unvus.com/ko/docs/install',
      }),
      launcher,
    });

    expect(result).toMatchObject({ status: 'request_failed', target: { profile: 'enterprise' } });
    expect(launcher).not.toHaveBeenCalled();
  });

  it('reports request_failed without launching an enterprise app on an unsupported platform', async () => {
    const launcher = vi.fn();

    const result = await requestAppActivation({
      profile: 'enterprise',
      platform: 'linux',
      launcher,
    });

    expect(result).toMatchObject({ status: 'request_failed', target: { profile: 'enterprise' } });
    expect(launcher).not.toHaveBeenCalled();
  });

  it('requests Windows activation through the registered profile URL scheme', async () => {
    const launched: Array<{ command: string; args: string[] }> = [];
    const launcher: ProcessLauncher = (command, args) => {
      launched.push({ command, args });
      const child = new EventEmitter() as ReturnType<ProcessLauncher>;
      child.unref = () => undefined;
      queueMicrotask(() => {
        child.emit('spawn');
        child.emit('exit', 0, null);
      });
      return child;
    };

    const result = await requestAppActivation({
      profile: 'dev',
      platform: 'win32',
      launcher,
    });

    expect(result.status).toBe('requested');
    expect(launched).toEqual([
      {
        command: 'cmd',
        args: ['/d', '/c', 'start', '""', 'neosql-dev://mcp/activate'],
      },
    ]);
  });

  it('reports request_failed when the OS activation command cannot be spawned', async () => {
    const launcher: ProcessLauncher = () => {
      const child = new EventEmitter() as ReturnType<ProcessLauncher>;
      child.unref = () => undefined;
      queueMicrotask(() => child.emit('error', new Error('spawn failed')));
      return child;
    };

    const result = await requestAppActivation({
      profile: 'prod',
      platform: 'linux',
      launcher,
    });

    expect(result).toMatchObject({
      status: 'request_failed',
      target: { productName: 'NeoSQL' },
      error: 'spawn failed',
    });
  });
});

describe('T05 activation command completion', () => {
  it('observes a nonzero command exit after spawn', async () => {
    const child = new EventEmitter() as ChildProcess;
    child.unref = vi.fn();
    const result = requestAppActivation({
      profile: 'prod',
      platform: 'win32',
      launcher: () => {
        queueMicrotask(() => {
          child.emit('spawn');
          child.emit('exit', 1, null);
        });
        return child;
      },
    });
    expect((await result).status).toBe('request_failed');
  });
});

describe('T18 activation observation cancellation', () => {
  it('does not launch after a cancelled filesystem lookup completes late', async () => {
    const controller = new AbortController();
    let complete!: (found: boolean) => void;
    let started!: () => void;
    const lookup = new Promise<void>((resolve) => {
      started = resolve;
    });
    const launcher = vi.fn();
    const work = requestAppActivation({
      profile: 'prod',
      platform: 'darwin',
      signal: controller.signal,
      launcher,
      pathExists: () => {
        started();
        return new Promise((resolve) => {
          complete = resolve;
        });
      },
    });
    const assertion = expect(work).rejects.toMatchObject({ name: 'AbortError' });
    await lookup;
    controller.abort();
    await assertion;
    complete(true);
    await Promise.resolve();
    expect(launcher).not.toHaveBeenCalled();
  });
  it('detaches observation listeners without killing an already launched app', async () => {
    const controller = new AbortController();
    const child = new EventEmitter() as ChildProcess;
    child.unref = vi.fn();
    child.kill = vi.fn();
    let launched!: () => void;
    const started = new Promise<void>((resolve) => {
      launched = resolve;
    });
    const work = requestAppActivation({
      profile: 'prod',
      platform: 'win32',
      signal: controller.signal,
      launcher: () => {
        queueMicrotask(launched);
        return child;
      },
    });
    const assertion = expect(work).rejects.toMatchObject({ name: 'AbortError' });
    await started;
    controller.abort();
    await assertion;
    expect(child.listenerCount('exit')).toBe(0);
    expect(child.kill).not.toHaveBeenCalled();
    child.emit('exit', 0, null);
    child.emit('error', new Error('late spawn error'));
  });
});
