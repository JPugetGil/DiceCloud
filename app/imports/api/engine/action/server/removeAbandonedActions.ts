import { SyncedCron } from 'meteor/quave:synced-cron';
import { Meteor } from 'meteor/meteor';
import removeActions from '/imports/api/engine/action/functions/removeActions';

/*
 * An action stays in progress from insertAction until runAction applies it.
 * One that no other action replaced (insertAction removes the creature's
 * previous one) and that never ran is removed here, and logged as abandoned if
 * its dice were drawn: otherwise a client could draw an action's dice, see
 * that they did not suit, and leave the action there without a trace.
 *
 * An hour: a player can leave an action's dialog open for a while (a choice
 * to discuss at the table, a rules question), and removing an action still
 * open would make its runAction fail; no action takes an hour to play. The
 * job runs every 10 minutes, as the removal of soft-removed documents does: an
 * abandoned action is logged between 60 and 70 minutes after it was inserted.
 */
export const ABANDONED_AFTER_MS = 60 * 60 * 1000;

/** Removes the actions inserted before `ABANDONED_AFTER_MS` ago */
export async function removeAbandonedActions(now = new Date()) {
  const insertedBefore = new Date(now.getTime() - ABANDONED_AFTER_MS);
  await removeActions({
    $or: [
      { insertedAt: { $lt: insertedBefore } },
      // Inserted before actions were dated
      { insertedAt: { $exists: false } },
    ],
  }, true);
}

Meteor.startup(() => {
  SyncedCron.add({
    name: 'removeAbandonedActions',
    schedule: function (parser) {
      return parser.text('every 10 minutes');
    },
    job: () => removeAbandonedActions(),
  });
});
