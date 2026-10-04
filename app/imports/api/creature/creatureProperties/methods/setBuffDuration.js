import SimpleSchema from 'meteor/aldeed:simple-schema';
import { ValidatedMethod } from 'meteor/mdg:validated-method';
import { RateLimiterMixin } from 'ddp-rate-limiter-mixin';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import { assertDocEditPermission } from '/imports/api/sharing/sharingPermissions';
import { Meteor } from 'meteor/meteor';

// A day of rounds: longer effects are not counted in combat
export const MAX_BUFF_ROUNDS = 14400;

/**
 * How many rounds an effect on a creature lasts from now, counted down by its
 * party's initiative tracker; none for an effect that lasts until removed
 */
const setBuffDuration = new ValidatedMethod({
  name: 'creatureProperties.setBuffDuration',
  validate: new SimpleSchema({
    _id: { type: String, max: 32 },
    rounds: { type: SimpleSchema.Integer, min: 1, max: MAX_BUFF_ROUNDS, optional: true },
  }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit: {
    numRequests: 10,
    timeInterval: 5000,
  },
  async run({ _id, rounds }) {
    const property = await CreatureProperties.findOneAsync(_id, { fields: { type: 1, root: 1 } });
    if (property?.type !== 'buff' || property.root?.collection !== 'creatures') {
      throw new Meteor.Error('not-found', 'This effect does not exist on a creature');
    }
    await assertDocEditPermission(property, this.userId);
    await CreatureProperties.updateAsync(_id, rounds ? {
      $set: { 'duration.calculation': String(rounds), dirty: true },
      $unset: { durationSpent: 1 },
    } : {
      $set: { dirty: true },
      $unset: { duration: 1, durationSpent: 1 },
    }, {
      selector: { type: 'buff' },
    });
  },
});

export default setBuffDuration;
