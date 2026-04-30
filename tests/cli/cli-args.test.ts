import { describe, it, expect } from 'vitest';
import { parseCliArgs } from '../../src/cli/cli-args.js';

describe('parseCliArgs', () => {
  it('defaults to prod profile when no flags are given', () => {
    expect(parseCliArgs([])).toEqual({ profile: 'prod', initialContext: {} });
  });

  it('selects dev profile when --dev is given', () => {
    expect(parseCliArgs(['--dev'])).toEqual({ profile: 'dev', initialContext: {} });
  });

  it('selects prod profile when --prod is given', () => {
    expect(parseCliArgs(['--prod'])).toEqual({ profile: 'prod', initialContext: {} });
  });

  it('uses the last profile flag when --dev then --prod are given', () => {
    expect(parseCliArgs(['--dev', '--prod'])).toEqual({ profile: 'prod', initialContext: {} });
  });

  it('uses the last profile flag when --prod then --dev are given', () => {
    expect(parseCliArgs(['--prod', '--dev'])).toEqual({ profile: 'dev', initialContext: {} });
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
        '--ddl-execute',
        'false',
        '--auto-commit',
        'true',
      ]),
    ).toEqual({
      profile: 'prod',
      initialContext: {
        projectId: '6c9fede500f949079f7c553cfd96ec72',
        connectionId: '88',
        schema: 'appdb',
        ddlExecute: false,
        autoCommit: true,
      },
    });
  });

  it('parses equals-form initial context flags', () => {
    expect(
      parseCliArgs([
        '--project=project-1',
        '--connection=0',
        '--schema=public',
        '--ddl-execute=true',
        '--auto-commit=false',
      ]),
    ).toEqual({
      profile: 'prod',
      initialContext: {
        projectId: 'project-1',
        connectionId: '0',
        schema: 'public',
        ddlExecute: true,
        autoCommit: false,
      },
    });
  });
});
