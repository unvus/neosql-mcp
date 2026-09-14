import { beforeEach, describe, expect, it, vi } from 'vitest';
import { promisify } from 'node:util';
import { detectDesktopInstallation } from '../../src/upstream/desktop-installation.js';

const io = vi.hoisted(() => ({ exec: vi.fn(), access: vi.fn() }));
vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  execFile: Object.assign(vi.fn(), { [promisify.custom]: io.exec }),
}));
vi.mock('node:fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs/promises')>()),
  access: io.access,
}));
const missing = () => Object.assign(new Error('absent'), { code: 'ENOENT' });

describe('T02/T18 OS installation I/O boundaries', () => {
  beforeEach(() => {
    io.exec.mockReset();
    io.access.mockReset();
  });

  it('recognizes a Windows key absence only after the OS registry probe confirms it', async () => {
    io.exec
      .mockRejectedValueOnce(new Error('reg exit 1'))
      .mockResolvedValueOnce({ stdout: 'missing\r\n' });
    const result = await detectDesktopInstallation({ profile: 'prod', platform: 'win32' });
    expect(result).toMatchObject({ status: 'not_installed', reason: 'registry_missing' });
    expect(io.exec.mock.calls.map((call) => call[0])).toEqual(['reg', 'powershell.exe']);
    expect(io.access).not.toHaveBeenCalled();
  });
  it.each(['present', 'unexpected'])(
    'keeps reg failure when the OS probe reports %s',
    async (stdout) => {
      io.exec.mockRejectedValueOnce(new Error('reg denied')).mockResolvedValueOnce({ stdout });
      await expect(
        detectDesktopInstallation({ profile: 'prod', platform: 'win32' }),
      ).rejects.toThrow('reg denied');
      expect(io.access).not.toHaveBeenCalled();
    },
  );
  it('keeps a registry probe permission failure separate from absence', async () => {
    io.exec
      .mockRejectedValueOnce(new Error('reg exit 1'))
      .mockRejectedValueOnce(new Error('registry denied'));
    await expect(detectDesktopInstallation({ profile: 'prod', platform: 'win32' })).rejects.toThrow(
      'registry denied',
    );
  });
  it('does not run the fallback probe when reg succeeds', async () => {
    io.exec.mockResolvedValue({ stdout: '    DisplayIcon    REG_SZ    C:\\NeoSQL.exe\r\n' });
    io.access.mockResolvedValue(undefined);
    expect(await detectDesktopInstallation({ profile: 'prod', platform: 'win32' })).toMatchObject({
      status: 'installed',
      executablePath: 'C:\\NeoSQL.exe',
    });
    expect(io.exec).toHaveBeenCalledOnce();
  });
  it('stops observing cancelled registry I/O and does not probe after its late rejection', async () => {
    let reject!: (error: Error) => void;
    let started!: () => void;
    const received = new Promise<void>((resolve) => {
      started = resolve;
    });
    io.exec.mockImplementation(() => {
      started();
      return new Promise((_resolve, fail) => {
        reject = fail;
      });
    });
    const controller = new AbortController();
    const work = detectDesktopInstallation({
      profile: 'prod',
      platform: 'win32',
      signal: controller.signal,
    });
    const assertion = expect(work).rejects.toMatchObject({ name: 'AbortError' });
    await received;
    controller.abort();
    await assertion;
    reject(new Error('late reg failure'));
    await Promise.resolve();
    await Promise.resolve();
    expect(io.exec).toHaveBeenCalledOnce();
    expect(io.exec.mock.calls[0]?.[2].signal).toBe(controller.signal);
  });
  it('distinguishes access denied from missing files in the production filesystem adapter', async () => {
    io.access.mockRejectedValue(Object.assign(new Error('access denied'), { code: 'EACCES' }));
    const options = {
      profile: 'prod' as const,
      platform: 'darwin' as const,
      readMcpConfigFile: async () => {
        throw missing();
      },
    };
    await expect(detectDesktopInstallation(options)).rejects.toThrow('access denied');
    io.access.mockRejectedValue(missing());
    expect(await detectDesktopInstallation(options)).toMatchObject({ status: 'not_installed' });
  });
});
