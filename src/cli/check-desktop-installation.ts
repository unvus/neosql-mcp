import { detectDesktopInstallation } from '../upstream/desktop-installation.js';
import { parseCliArgs } from './cli-args.js';

export const runDesktopInstallationCheck = async (
  argv: readonly string[] = process.argv.slice(2),
  write: (text: string) => void = (text) => process.stdout.write(text),
): Promise<void> => {
  const { profile } = parseCliArgs(argv);
  const result = await detectDesktopInstallation({ profile });
  write(`${JSON.stringify(result, null, 2)}\n`);
};

if (import.meta.url === `file://${process.argv[1]}`) {
  runDesktopInstallationCheck().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
