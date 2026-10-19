import { ValidatedMethod } from 'meteor/mdg:validated-method';
import { RateLimiterMixin } from 'ddp-rate-limiter-mixin';
import SimpleSchema from 'meteor/aldeed:simple-schema';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import { assertEditPermission } from '/imports/api/sharing/sharingPermissions';
import { restore } from '/imports/api/parenting/softRemove';
import getRootCreatureAncestor from '/imports/api/creature/creatureProperties/getRootCreatureAncestor';
import { Meteor } from 'meteor/meteor';

const restoreProperty = new ValidatedMethod({
  name: 'creatureProperties.restore',
  validate: new SimpleSchema({
    _id: SimpleSchema.RegEx.Id
  }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit: {
    numRequests: 5,
    timeInterval: 5000,
  },
  async run({ _id }) {
    // Permissions
    let property = await CreatureProperties.findOneAsync(_id);
    if (!property) throw new Meteor.Error('not-found', 'Property not found');
    let rootCreature = await getRootCreatureAncestor(property);
    await assertEditPermission(rootCreature, this.userId);

    // Do work
    await restore(CreatureProperties, property, { $set: { dirty: true } });
  }
});

export default restoreProperty;
