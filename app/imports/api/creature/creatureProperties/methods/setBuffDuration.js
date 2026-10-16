import SimpleSchema from 'meteor/aldeed:simple-schema';
import { ValidatedMethod } from 'meteor/mdg:validated-method';
import { RateLimiterMixin } from 'ddp-rate-limiter-mixin';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import CreatureFolders from '/imports/api/creature/creatureFolders/CreatureFolders';
import Creatures from '/imports/api/creature/creatures/Creatures';
import { assertDocEditPermission } from '/imports/api/sharing/sharingPermissions';
import { englishMessage } from '/imports/api/creature/log/logMessages';
import STORAGE_LIMITS from '/imports/constants/STORAGE_LIMITS';
import { Meteor } from 'meteor/meteor';

// A day of rounds: longer effects are not counted in combat
export const MAX_BUFF_ROUNDS = 14400;

/**
 * The creature `sourceId` as an effect on `holderId` keeps it (appliedBy),
 * if it may count that effect down: one of the party's creatures, its game
 * master's or a player's, on a board (a folder not archived) that holds the
 * holder too and where the user plays, as game master or player. Undefined
 * otherwise
 */
async function partySource(holderId, sourceId, userId) {
  const folder = await CreatureFolders.findOneAsync({
    creatures: { $all: [holderId, sourceId] },
    archived: { $ne: true },
    $or: [{ owner: userId }, { members: userId }],
  }, { fields: { owner: 1, members: 1 } });
  if (!folder) return undefined;
  const source = await Creatures.findOneAsync({
    _id: sourceId, owner: { $in: [folder.owner, ...folder.members || []] },
  }, { fields: { name: 1 } });
  if (!source) return undefined;
  return { id: sourceId, name: (source.name || '?').slice(0, STORAGE_LIMITS.name), collection: 'creatures' };
}

/**
 * How many rounds an effect on a creature lasts from now, counted down by its
 * party's initiative tracker; none for an effect that lasts until removed.
 * By default at the start of the creature's turns; at their end with
 * `event: 'turnEnd'`; on the turns of another creature of its party with
 * `sourceId`, which the effect then names as the one that applied it
 * (phase 3.5): "until the end of Goblin 1's next turn" is 1 round, at the
 * end, on Goblin 1's turns
 */
const setBuffDuration = new ValidatedMethod({
  name: 'creatureProperties.setBuffDuration',
  validate: new SimpleSchema({
    _id: { type: String, max: 32 },
    rounds: { type: SimpleSchema.Integer, min: 1, max: MAX_BUFF_ROUNDS, optional: true },
    event: { type: String, allowedValues: ['turnStart', 'turnEnd'], optional: true },
    sourceId: { type: String, max: 32, optional: true },
  }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit: {
    numRequests: 10,
    timeInterval: 5000,
  },
  async run({ _id, rounds, event, sourceId }) {
    const property = await CreatureProperties.findOneAsync(_id, { fields: { type: 1, root: 1 } });
    if (property?.type !== 'buff' || property.root?.collection !== 'creatures') {
      throw new Meteor.Error('not-found', 'This effect does not exist on a creature');
    }
    await assertDocEditPermission(property, this.userId);
    if (!rounds) {
      await CreatureProperties.updateAsync(_id, {
        $set: { dirty: true },
        $unset: { duration: 1, durationSpent: 1, durationAnchor: 1, durationEvent: 1 },
      }, { selector: { type: 'buff' } });
      return;
    }
    // Its own turns: the effect's default
    const anchored = !!sourceId && sourceId !== property.root.id;
    const appliedBy = anchored ? await partySource(property.root.id, sourceId, this.userId) : undefined;
    if (anchored && !appliedBy) {
      // The browser may not have the board: the server decides
      if (Meteor.isClient) return;
      const key = 'combat.sourceNotInParty';
      // any: Meteor's types say details are a string; DDP sends any EJSON
      // value, which the board translates (boardErrorText)
      const details = /** @type {any} */ ({ i18n: { key } });
      throw new Meteor.Error('buff-duration.source', englishMessage(key), details);
    }
    const turnEnd = event === 'turnEnd';
    await CreatureProperties.updateAsync(_id, {
      $set: {
        'duration.calculation': String(rounds),
        dirty: true,
        ...turnEnd && { durationEvent: 'turnEnd' },
        ...appliedBy && { durationAnchor: 'source', appliedBy },
      },
      // Counted from now: an effect counted at the end of the turns starts at
      // its creature's next turn
      $unset: {
        durationSpent: 1,
        ...!turnEnd && { durationEvent: 1 },
        ...!appliedBy && { durationAnchor: 1 },
      },
    }, {
      selector: { type: 'buff' },
    });
  },
});

export default setBuffDuration;
