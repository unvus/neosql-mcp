import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureDesktopReady } from '../../src/upstream/desktop-readiness.js';
import { activationTargetForProfile } from '../../src/upstream/app-activation.js';
import { HttpClientError } from '../../src/upstream/http-client.js';

const status = (state: string, projectId: string | null = 'A', reason?: string) => ({
  app: 'neosql',
  profile: 'prod',
  renderer: 'responsive',
  project: { state, projectId, ...(reason ? { reason } : {}) },
});
const absent = () => new HttpClientError({ kind: 'not-running', message: 'absent' });
const timeout = () => new HttpClientError({ kind: 'timeout', message: 'timeout' });
const installed = {
  status: 'installed' as const,
  platform: 'darwin' as const,
  target: activationTargetForProfile('prod'),
  executablePath: '/test/NeoSQL',
  checkedExecutablePaths: [],
};
const setup = (responses: unknown[]) => {
  const queryStatus = vi.fn(async () => {
    const value = responses.length > 1 ? responses.shift() : responses[0];
    if (value instanceof Error) throw value;
    return value;
  });
  const checkInstallation = vi.fn(async () => installed);
  const requestActivation = vi.fn(async () => ({
    status: 'requested' as const,
    target: installed.target,
  }));
  const onState = vi.fn(async (_state: string) => {});
  return {
    socketPath: '/unused.sock',
    profile: 'prod' as const,
    queryStatus,
    checkInstallation,
    requestActivation,
    onState,
  };
};
const finish = async <T>(promise: Promise<T>) => {
  await vi.runAllTimersAsync();
  return promise;
};

describe('Desktop preparation contract', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] }));
  afterEach(() => {
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });

  it('T01 returns ready without activation', async () => {
    const opts = setup([status('ready')]);
    expect(await ensureDesktopReady(opts)).toMatchObject({ status: 'ready' });
    expect(opts.requestActivation).not.toHaveBeenCalled();
    expect(opts.queryStatus).toHaveBeenCalledOnce();
  });
  it('T03 skips activation if the pre-launch recheck connects', async () => {
    const opts = setup([absent(), status('ready')]);
    expect(await finish(ensureDesktopReady(opts))).toMatchObject({ status: 'ready' });
    expect(opts.requestActivation).not.toHaveBeenCalled();
  });
  it('T04 activates once and follows renderer/project progress', async () => {
    const opts = setup([
      absent(),
      absent(),
      absent(),
      { app: 'neosql', profile: 'prod', renderer: 'not_ready', project: null },
      status('loading'),
      status('loading'),
      status('ready'),
    ]);
    expect(await finish(ensureDesktopReady(opts))).toMatchObject({ status: 'ready' });
    expect(opts.requestActivation).toHaveBeenCalledOnce();
    expect(opts.checkInstallation).toHaveBeenCalledOnce();
    expect(opts.onState.mock.calls.flat()).toEqual([
      'activation_requesting',
      'activation_requested',
      'renderer_loading',
      'project_loading',
      'ready',
    ]);
  });
  it('T06 stops an ungrounded timeout without polling', async () => {
    const opts = setup([timeout(), status('ready')]);
    expect(await ensureDesktopReady(opts)).toMatchObject({ status: 'status_check_failed' });
    expect(opts.queryStatus).toHaveBeenCalledOnce();
    expect(opts.checkInstallation).not.toHaveBeenCalled();
  });
  it('T07 retries HTTP and IPC timeouts only after loading evidence', async () => {
    const opts = setup([
      status('loading'),
      timeout(),
      new HttpClientError({ kind: 'rpc-error', rpcKind: 'timeout', message: 'IPC' }),
      status('ready'),
    ]);
    expect(await finish(ensureDesktopReady(opts))).toMatchObject({ status: 'ready' });
    opts.queryStatus.mockRejectedValue(timeout());
    expect(await ensureDesktopReady(opts)).toMatchObject({ status: 'status_check_failed' });
    expect(opts.requestActivation).not.toHaveBeenCalled();
  });
  it.each([
    null,
    {},
    { ...status('ready'), profile: 'dev' },
    { ...status('ready'), app: 'other' },
    status('ready', null),
    status('failed'),
    status('user_action_required', 'A', 'unknown'),
    { app: 'neosql', profile: 'prod', renderer: 'not_ready', project: {} },
    new HttpClientError({ kind: 'bad-response', message: 'ENOTSOCK' }),
  ])('T08 rejects malformed status or clear errors even while loading: %j', async (invalid) => {
    const opts = setup([status('loading'), invalid]);
    expect(await finish(ensureDesktopReady(opts))).toMatchObject({ status: 'status_check_failed' });
    expect(opts.queryStatus).toHaveBeenCalledTimes(2);
  });
  it('T09/T17 retains the original deadline while projects change', async () => {
    const opts = setup([status('loading', 'A'), status('loading', 'B')]);
    expect(await finish(ensureDesktopReady(opts))).toMatchObject({ status: 'readiness_timeout' });
    expect(performance.now()).toBe(40_000);
    expect(opts.requestActivation).not.toHaveBeenCalled();
  });
  it.each([undefined, 'B'])('30초 로딩도 40초 안이면 준비된다 (target=%s)', async projectId => {
    const opts = setup([status('not_selected', null)]);
    let moved = projectId === undefined;
    const queryStatus = vi.fn(async () => !moved
      ? status('not_selected', null)
      : status(performance.now() < 30_000 ? 'loading' : 'ready', 'B'));
    const openProject = vi.fn(async () => { moved = true; return { status: 'navigated', projectId: 'B' }; });
    expect(await finish(ensureDesktopReady({ ...opts, ...(projectId === undefined ? {} : { projectId }), queryStatus, openProject }))).toMatchObject({ status: 'ready' });
    expect(performance.now()).toBe(30_000);
    expect(openProject).toHaveBeenCalledTimes(projectId === undefined ? 0 : 1);
  });
  it('T17 follows the current project to ready', async () => {
    const opts = setup([status('loading', 'A'), status('loading', 'B'), status('ready', 'B')]);
    expect(await finish(ensureDesktopReady(opts))).toMatchObject({ status: 'ready' });
  });
  it.each([
    [status('not_selected', null), 'project_not_selected'],
    [status('authentication_required'), 'authentication_required'],
    ...[
      'storage_unavailable',
      'initial_sync_failed',
      'initialization_failed',
      'missing_project_config',
    ].map((reason) => [status('failed', 'A', reason), 'project_load_failed']),
    ...[
      'unlock_project',
      'cleanup_connections',
      'cleanup_members',
      'resolve_missing_driver',
      'project_access_blocked',
      'acknowledge_notice',
    ].map((reason) => [status('user_action_required', 'A', reason), 'user_action_required']),
  ])('T13/T16/T20 maps terminal state %j', async (response, expected) => {
    const opts = setup([response]);
    expect(await ensureDesktopReady(opts)).toMatchObject({ status: expected });
    expect(opts.queryStatus).toHaveBeenCalledOnce();
  });
  it('T02 distinguishes missing installation from lookup errors', async () => {
    const opts = setup([absent()]);
    opts.checkInstallation.mockRejectedValueOnce(new Error('denied'));
    expect(await ensureDesktopReady(opts)).toMatchObject({ status: 'installation_check_failed' });
    const missing = {
      ...installed,
      status: 'not_installed' as const,
      installGuideUrl: 'https://neosql.unvus.com/ko/docs/install' as const,
    };
    expect(
      await ensureDesktopReady({ ...opts, checkInstallation: async () => missing }),
    ).toMatchObject({ status: 'installation_not_found' });
    expect(opts.requestActivation).not.toHaveBeenCalled();
  });
  it('T05 maps confirmed activation failure', async () => {
    const opts = setup([absent()]);
    const result = await finish(
      ensureDesktopReady({
        ...opts,
        requestActivation: async () => ({
          status: 'request_failed',
          target: installed.target,
        }),
      }),
    );
    expect(result).toMatchObject({ status: 'activation_failed' });
  });
  it.each(['queryStatus', 'checkInstallation', 'requestActivation', 'onState'] as const)(
    'T18 cancels pending %s and ignores its late result',
    async (boundary) => {
      const opts = setup(boundary === 'onState' ? [status('loading')] : [absent()]);
      let complete!: (value: never) => void;
      const pending = vi.fn(
        () =>
          new Promise<never>((resolve) => {
            complete = resolve;
          }),
      );
      const controller = new AbortController();
      const work = ensureDesktopReady({ ...opts, [boundary]: pending, signal: controller.signal });
      const assertion = expect(work).rejects.toMatchObject({ name: 'AbortError' });
      await vi.advanceTimersByTimeAsync(boundary === 'requestActivation' ? 500 : 0);
      expect(pending).toHaveBeenCalledOnce();
      controller.abort();
      await assertion;
      const calls = opts.queryStatus.mock.calls.length;
      complete(status('ready') as never);
      await vi.runAllTimersAsync();
      expect(opts.queryStatus).toHaveBeenCalledTimes(calls);
    },
  );
  it.each(['checkInstallation', 'requestActivation', 'onState'] as const)(
    'T09 bounds an unresponsive %s by the overall deadline',
    async (boundary) => {
      const opts = setup(boundary === 'onState' ? [status('loading')] : [absent()]);
      const result = await finish(
        ensureDesktopReady({ ...opts, [boundary]: () => new Promise<never>(() => {}) }),
      );
      expect(result).toMatchObject({ status: 'readiness_timeout' });
      expect(performance.now()).toBe(40_000);
    },
  );
  it('T19 ignores failed notifications and suppresses repeated states', async () => {
    const opts = setup([status('loading'), status('loading'), status('ready')]);
    opts.onState.mockRejectedValue(new Error('notification unavailable'));
    expect(await finish(ensureDesktopReady(opts))).toMatchObject({ status: 'ready' });
    expect(opts.onState).toHaveBeenCalledTimes(2);
  });
});


describe('지정 프로젝트 준비', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] }));
  afterEach(() => { expect(vi.getTimerCount()).toBe(0); vi.useRealTimers(); });
  it.each(['not_selected', 'loading', 'failed', 'ready'])('현재 %s이어도 B로 이동하고 준비까지 기다린다', async state => {
    const opts = setup([status(state, state === 'not_selected' ? null : 'A', state === 'failed' ? 'initialization_failed' : undefined), status('loading', 'B'), status('ready', 'B')]);
    const navigate = vi.fn(async (_args: unknown) => ({ status: 'navigated', projectId: 'B' }));
    expect(await finish(ensureDesktopReady({ ...opts, projectId: 'B', openProject: navigate }))).toMatchObject({ status: 'ready' });
    expect(navigate).toHaveBeenCalledOnce();
    expect(navigate.mock.calls[0]?.[0]).toMatchObject({ method: 'open-project', params: { input: { projectId: 'B' } } });
    expect(opts.onState.mock.calls.map(c => c[0])).toEqual(['project_navigation', 'target_loading', 'ready']);
  });
  it('이미 대상이면 이동하지 않는다', async () => {
    const navigate = vi.fn();
    expect(await ensureDesktopReady({ ...setup([status('ready', 'B')]), projectId: 'B', openProject: navigate })).toMatchObject({ status: 'ready' });
    expect(navigate).not.toHaveBeenCalled();
  });
  it('대상 로딩 중 다른 프로젝트로 이동하면 재이동하지 않는다', async () => {
    const navigate = vi.fn();
    expect(await finish(ensureDesktopReady({ ...setup([status('loading', 'B'), status('ready', 'A')]), projectId: 'B', openProject: navigate }))).toMatchObject({ status: 'project_mismatch' });
    expect(navigate).not.toHaveBeenCalled();
  });
  it('미저장 변경과 이동 실패는 원래 작업 전 종료한다', async () => {
    for (const response of [{ status: 'user_action_required', projectId: 'B', reason: 'unsaved_changes' }, { status: 'lookup_failed', projectId: 'B' }]) {
      const result = await ensureDesktopReady({ ...setup([status('ready')]), projectId: 'B', openProject: vi.fn(async () => response) });
      expect(result).toMatchObject(response.status === 'lookup_failed' ? { status: 'project_lookup_failed' } : { status: 'user_action_required', reason: 'unsaved_changes' });
    }
  });
  it('이동 응답 유실과 잘못된 ID는 재시도하지 않는다', async () => {
    for (const reply of [new Error('lost'), { status: 'navigated', projectId: 'C' }]) {
      const navigate = vi.fn(async () => { if (reply instanceof Error) throw reply; return reply; });
      expect(await ensureDesktopReady({ ...setup([status('ready')]), projectId: 'B', openProject: navigate })).toMatchObject({ status: 'project_navigation_failed' });
      expect(navigate).toHaveBeenCalledOnce();
    }
  });
  it('이동 중에도 전체 40초를 넘기지 않고 HTTP signal을 취소한다', async () => {
    let signal: AbortSignal | undefined;
    const navigate = vi.fn(async (args: any) => { signal = args.signal; return new Promise(() => {}); });
    expect(await finish(ensureDesktopReady({ ...setup([status('ready')]), projectId: 'B', openProject: navigate }))).toMatchObject({ status: 'readiness_timeout' });
    expect(signal?.aborted).toBe(true);
  });
});
