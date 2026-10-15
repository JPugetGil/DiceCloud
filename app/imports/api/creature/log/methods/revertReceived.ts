import SimpleSchema from 'meteor/aldeed:simple-schema';
import { ValidatedMethod } from 'meteor/mdg:validated-method';
import { RateLimiterMixin } from 'ddp-rate-limiter-mixin';
import { Meteor } from 'meteor/meteor';

/**
 * Undoes what another creature's action did to a creature (phase 2.4 of the
 * monsters): the answer of its player to a monster's attack that applied by
 * itself (Shield, Lucky, a resistance forgotten), or to a heal that went to
 * the wrong character. `logId`: the creature's received entry ("Goblin 1 →
 * you").
 *
 * Whoever may edit the creature may: its owner, and the game master of its
 * party, who is one of its writers; and only while the encounter it happened
 * in lasts (encounters.ts). Once: a second undo, at the same time or after,
 * is refused. The entry then says who undid it, and an entry "Effect undone
 * by …" says what came back, in the creature's log and its Discord channels.
 * The server's alone: the browser has not what undoes the entry, which no
 * publication sends (server/revertReceived.ts)
 */
export const revertReceived = new ValidatedMethod({
  name: 'creatureLogs.revertReceived',
  validate: new SimpleSchema({
    logId: { type: String, max: 32 },
  }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit: {
    numRequests: 10,
    timeInterval: 5000,
  },
  async run({ logId }: { logId: string }) {
    if (this.isSimulation) return;
    if (Meteor.isServer) {
      // Imported when called: the engine, which the server alone runs here
      const { default: revert } = await import('/imports/api/creature/log/server/revertReceived');
      await revert(logId, this.userId);
    }
  },
});
