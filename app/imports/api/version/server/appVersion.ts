import { Meteor } from 'meteor/meteor';
import { execFileSync } from 'child_process';
import path from 'path';
import type { AppVersion } from '/imports/api/version/appVersion';

/*
 * The version of DiceCloud that runs, read from the commits by
 * deploy/version.sh. The production image holds no git history:
 * deploy/dicecloud.sh runs the script on the host and passes its result
 * (APP_VERSION, with CONTAINER_VERSION and APP_COMMIT_DATE). In development,
 * the server runs it in its clone.
 */

type Env = Record<string, string | undefined>;

function fromGit(cwd: string): AppVersion {
  const run = (file: string, args: string[]) =>
    execFileSync(file, args, { cwd, stdio: ['ignore', 'pipe', 'ignore'], timeout: 10000 }).toString().trim();
  const root = run('git', ['rev-parse', '--show-toplevel']);
  return {
    version: run('bash', [path.join(root, 'deploy', 'version.sh')]),
    commit: run('git', ['rev-parse', '--short=8', 'HEAD']),
    date: run('git', ['log', '-1', '--format=%cI']),
  };
}

/**
 * The version the environment gives, or else that of the clone `cwd` is in
 * (the development server runs in app/.meteor/local); null without either
 */
export function readAppVersion(env: Env = process.env, cwd = process.cwd()): AppVersion | null {
  if (env.APP_VERSION) {
    return { version: env.APP_VERSION, commit: env.CONTAINER_VERSION || '', date: env.APP_COMMIT_DATE || '' };
  }
  try {
    return fromGit(cwd);
  } catch {
    return null;
  }
}

// The browser reads it with the public settings (appVersion())
(Meteor.settings.public as Record<string, unknown>).appVersion = readAppVersion();
