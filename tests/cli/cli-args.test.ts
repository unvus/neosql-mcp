import { describe, it, expect } from 'vitest';
import { parseCliArgs } from '../../src/cli/cli-args.js';

describe('parseCliArgs', () => {
  it('defaults to prod profile when no flags are given', () => {
    expect(parseCliArgs([])).toEqual({ profile: 'prod' });
  });

  it('selects dev profile when --dev is given', () => {
    expect(parseCliArgs(['--dev'])).toEqual({ profile: 'dev' });
  });

  it('selects prod profile when --prod is given', () => {
    expect(parseCliArgs(['--prod'])).toEqual({ profile: 'prod' });
  });

  it('uses the last profile flag when --dev then --prod are given', () => {
    expect(parseCliArgs(['--dev', '--prod'])).toEqual({ profile: 'prod' });
  });

  it('uses the last profile flag when --prod then --dev are given', () => {
    expect(parseCliArgs(['--prod', '--dev'])).toEqual({ profile: 'dev' });
  });

  it('ignores unknown arguments and falls back to prod', () => {
    expect(parseCliArgs(['--foo'])).toEqual({ profile: 'prod' });
  });
});
