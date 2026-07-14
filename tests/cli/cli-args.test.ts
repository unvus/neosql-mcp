import { describe, it, expect } from 'vitest';
import { parseCliArgs } from '../../src/cli/cli-args.js';

describe('parseCliArgs', () => {
  it('defaults to prod profile when no flags are given', () => {
    expect(parseCliArgs([])).toEqual({ profile: 'prod' });
  });

  it('parses equals-form profile flags', () => {
    expect(parseCliArgs(['--profile=dev'])).toEqual({ profile: 'dev' });
  });

  it('accepts local and stage profiles', () => {
    expect(parseCliArgs(['--profile=stage'])).toEqual({ profile: 'stage' });
    expect(parseCliArgs(['--profile=local'])).toEqual({ profile: 'local' });
  });

  it('uses the last profile value when multiple profile flags are given', () => {
    expect(parseCliArgs(['--profile=dev', '--profile=prod'])).toEqual({ profile: 'prod' });
  });

  it('ignores invalid profile values and keeps the previous profile', () => {
    expect(parseCliArgs(['--profile=dev', '--profile=staging'])).toEqual({ profile: 'dev' });
  });

  it('ignores space-separated profile flags and unsupported aliases', () => {
    expect(parseCliArgs(['--dev', '--prod', '--profile', 'dev'])).toEqual({ profile: 'prod' });
  });

  it('ignores unknown arguments and falls back to prod', () => {
    expect(parseCliArgs(['--foo'])).toEqual({ profile: 'prod' });
  });

  it('ignores space-separated legacy context flags', () => {
    expect(
      parseCliArgs([
        '--project',
        '6c9fede500f949079f7c553cfd96ec72',
        '--default-connection',
        '88',
        '--default-database',
        'sales',
        '--default-schema',
        'appdb',
      ]),
    ).toEqual({ profile: 'prod' });
  });

  it('accepts legacy equals-form context flags without using their values', () => {
    expect(
      parseCliArgs([
        '--project=project-1',
        '--default-connection=0',
        '--default-database=sales',
        '--default-schema=public',
      ]),
    ).toEqual({ profile: 'prod' });
  });

  it('ignores a blank legacy default database', () => {
    expect(parseCliArgs(['--default-database=   '])).toEqual({ profile: 'prod' });
  });

  it('ignores removed commit and DDL execution flags', () => {
    expect(
      parseCliArgs([
        '--project=project-1',
        '--ddl-execute=true',
        '--ddl-execute',
        'false',
        '--auto-commit=true',
        '--auto-commit',
        'false',
      ]),
    ).toEqual({ profile: 'prod' });
  });
});
