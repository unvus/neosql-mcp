import { describe, it, expect } from 'vitest';
import { parseCliArgs } from '../../src/cli/cli-args.js';

describe('parseCliArgs', () => {
  it('defaults to prod profile when no flags are given', () => {
    expect(parseCliArgs([])).toEqual({ profile: 'prod', initialContext: {} });
  });

  it('selects dev profile when --profile dev is given', () => {
    expect(parseCliArgs(['--profile', 'dev'])).toEqual({ profile: 'dev', initialContext: {} });
  });

  it('selects prod profile when --profile prod is given', () => {
    expect(parseCliArgs(['--profile', 'prod'])).toEqual({ profile: 'prod', initialContext: {} });
  });

  it('parses equals-form profile flags', () => {
    expect(parseCliArgs(['--profile=dev'])).toEqual({ profile: 'dev', initialContext: {} });
  });

  it('uses the last profile value when multiple profile flags are given', () => {
    expect(parseCliArgs(['--profile', 'dev', '--profile', 'prod'])).toEqual({
      profile: 'prod',
      initialContext: {},
    });
  });

  it('ignores invalid profile values and keeps the previous profile', () => {
    expect(parseCliArgs(['--profile', 'dev', '--profile', 'staging'])).toEqual({
      profile: 'dev',
      initialContext: {},
    });
  });

  it('keeps --dev and --prod as legacy profile aliases', () => {
    expect(parseCliArgs(['--dev', '--prod', '--profile', 'dev'])).toEqual({
      profile: 'dev',
      initialContext: {},
    });
  });

  it('ignores unknown arguments and falls back to prod', () => {
    expect(parseCliArgs(['--foo'])).toEqual({ profile: 'prod', initialContext: {} });
  });

  it('parses initial context flags from npx arguments', () => {
    expect(
      parseCliArgs([
        '--project',
        '6c9fede500f949079f7c553cfd96ec72',
        '--connection',
        '88',
        '--schema',
        'appdb',
      ]),
    ).toEqual({
      profile: 'prod',
      initialContext: {
        projectId: '6c9fede500f949079f7c553cfd96ec72',
        connectionId: '88',
        schema: 'appdb',
      },
    });
  });

  it('parses equals-form initial context flags', () => {
    expect(
      parseCliArgs([
        '--project=project-1',
        '--connection=0',
        '--schema=public',
      ]),
    ).toEqual({
      profile: 'prod',
      initialContext: {
        projectId: 'project-1',
        connectionId: '0',
        schema: 'public',
      },
    });
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
    ).toEqual({
      profile: 'prod',
      initialContext: {
        projectId: 'project-1',
      },
    });
  });
});
