import { ValidatedMethod } from 'meteor/mdg:validated-method';
import { RateLimiterMixin } from 'ddp-rate-limiter-mixin';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import { assertEditPermission } from '/imports/api/sharing/sharingPermissions';
import getRootCreatureAncestor from '/imports/api/creature/creatureProperties/getRootCreatureAncestor';
import { Meteor } from 'meteor/meteor';

const pullFromProperty = new ValidatedMethod({
  name: 'creatureProperties.pull',
  validate: null,
  mixins: [RateLimiterMixin],
  rateLimit: {
    numRequests: 5,
    timeInterval: 5000,
  },
  async run({ _id, path, itemId }) {
    // Permissions
    let property = await CreatureProperties.findOneAsync(_id);
    if (!property) throw new Meteor.Error('not-found', 'Property not found');
    let rootCreature = await getRootCreatureAncestor(property);
    await assertEditPermission(rootCreature, this.userId);

    // Do work
    // A modifier on a path given as an argument: no type can follow it
    await CreatureProperties.updateAsync(_id, /** @type {any} */ ({
      $pull: { [path.join('.')]: { _id: itemId } },
      $set: { dirty: true }
    }), {
      selector: { type: property.type },
      getAutoValues: false,
    });
  }
});

export default pullFromProperty;
