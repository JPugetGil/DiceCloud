import { SyncedCron } from 'meteor/quave:synced-cron';

/*
 * SyncedCron logs every run of every job: "Scheduled", "Starting",
 * "Finished", about 1,150 lines a day in production. Those lines alone are
 * left out. Its warnings and errors stay, and so do a job's exception, which
 * it logs as info, and a fatal error's stack, which it logs before it ends
 * the process: `log: false` silenced them with the rest.
 *
 * The package reads its options once, in its own Meteor.startup.
 * imports/startup/server/index.js imports this module statically, so that it
 * runs first. Imported there with `await import()`, it came after the
 * package's startup, and `log: false` never applied.
 *
 * noProcessExit stays false. SyncedCron handles SIGTERM, SIGINT and fatal
 * errors itself, and nothing else does: Meteor 3.5.2 installs no handler, so
 * its own handler ends the process as Node would without one. With
 * noProcessExit, a SIGTERM no longer stops the server: `docker stop` waits
 * for its SIGKILL, `meteor run` for 3 s at each restart (run-app.js), and a
 * fatal error leaves the process running.
 */

// The lines of a job's run, as the package writes them
const ROUTINE = /^(Scheduled|Starting|Finished) "/;

/** SyncedCron's logger: every line but a job's routine ones */
export function syncedCronLogger({ level, message, tag }) {
  if (level === 'info' && ROUTINE.test(message)) return;
  const line = `${tag}: ${message}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

SyncedCron.config({ logger: syncedCronLogger });
