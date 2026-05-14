import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import {
  activationTargetForProfile,
  requestAppActivation,
  type ProcessLauncher,
} from '../../src/upstream/app-activation.js';

describe('app activation', () => {
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

  it('requests macOS activation with open -a and the profile product name and URL scheme', async () => {
    const launched: Array<{ command: string; args: string[]; detached: boolean | undefined }> = [];
    const launcher: ProcessLauncher = (command, args, options) => {
      launched.push({ command, args, detached: options.detached });
      const child = new EventEmitter() as ReturnType<ProcessLauncher>;
      child.unref = () => undefined;
      queueMicrotask(() => child.emit('spawn'));
      return child;
    };

    const result = await requestAppActivation({
      profile: 'local',
      platform: 'darwin',
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

  it('requests Windows activation through the registered profile URL scheme', async () => {
    const launched: Array<{ command: string; args: string[] }> = [];
    const launcher: ProcessLauncher = (command, args) => {
      launched.push({ command, args });
      const child = new EventEmitter() as ReturnType<ProcessLauncher>;
      child.unref = () => undefined;
      queueMicrotask(() => child.emit('spawn'));
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
