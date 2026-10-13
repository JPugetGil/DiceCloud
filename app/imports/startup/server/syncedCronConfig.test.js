import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';

let syncedCronLogger;
let SyncedCron;
if (Meteor.isServer) {
  /* eslint-disable @typescript-eslint/no-require-imports */
  ({ syncedCronLogger } = require('/imports/startup/server/syncedCronConfig'));
  ({ SyncedCron } = require('meteor/quave:synced-cron'));
  /* eslint-enable @typescript-eslint/no-require-imports */
}

/*
 * SyncedCron's job runs filled the production log, about 1,150 lines a day:
 * they stay out of it, and its warnings and errors stay in, a job's
 * exception and a fatal error's stack among them.
 */
describe('SyncedCron\'s log (syncedCronConfig)', function () {
  before(function () {
    if (!Meteor.isServer) this.skip();
  });

  /** What the logger writes for each of the lines, by console method */
  function written(lines) {
    const out = [];
    const saved = { log: console.log, warn: console.warn, error: console.error };
    for (const method of Object.keys(saved)) console[method] = text => out.push(`${method} ${text}`);
    try {
      lines.forEach(syncedCronLogger);
    } finally {
      Object.assign(console, saved);
    }
    return out;
  }

  it('leaves a job\'s routine lines out, and keeps the rest', function () {
    const tag = 'SyncedCron';
    assert.deepEqual(written([
      { level: 'info', tag, message: 'Scheduled "removeAbandonedActions" next run @Sun Oct 11 2026 22:30:00' },
      { level: 'info', tag, message: 'Starting "removeAbandonedActions".' },
      { level: 'info', tag, message: 'Finished "removeAbandonedActions".' },
      { level: 'info', tag, message: 'Exception "removeAbandonedActions" Error: boom' },
      { level: 'warn', tag, message: 'Not going to use a TTL that is shorter than:300' },
      { level: 'error', tag, message: 'Fatal error encountered (uncaughtException): Error: boom' },
    ]), [
      'log SyncedCron: Exception "removeAbandonedActions" Error: boom',
      'warn SyncedCron: Not going to use a TTL that is shorter than:300',
      'error SyncedCron: Fatal error encountered (uncaughtException): Error: boom',
    ]);
  });

  it('is SyncedCron\'s logger, which still ends the process on a fatal error', function () {
    assert.equal(SyncedCron.options.logger, syncedCronLogger);
    assert.notStrictEqual(SyncedCron.options.log, false, 'with log: false, the logger is never called');
    assert.isFalse(SyncedCron.options.noProcessExit, 'Meteor has no handler that would end it');
  });
});
