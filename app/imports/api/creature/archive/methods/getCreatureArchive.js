import SimpleSchema from 'meteor/aldeed:simple-schema';
import { ValidatedMethod } from 'meteor/mdg:validated-method';
import { RateLimiterMixin } from 'ddp-rate-limiter-mixin';
import { Meteor } from 'meteor/meteor';
import Creatures from '/imports/api/creature/creatures/Creatures';
import { getArchiveObj } from '/imports/api/creature/archive/methods/archiveCreatureToFile';
import { assertCopyPermission } from '/imports/api/sharing/sharingPermissions';

/**
 * A character as an archive, the file archiving makes, without archiving it:
 * the character stays as it is. The file can be uploaded on the Files page
 * and restored, here or on another instance. Needs the right to copy it.
 */
const getCreatureArchive = new ValidatedMethod({
  name: 'Creatures.methods.getArchive',
  validate: new SimpleSchema({
    creatureId: {
      type: String,
      max: 32,
    },
  }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit: {
    numRequests: 5,
    timeInterval: 5000,
  },
  async run({ creatureId }) {
    if (Meteor.isClient) return;
    const creature = await Creatures.findOneAsync(creatureId, {
      fields: { owner: 1, readers: 1, writers: 1, public: 1, readersCanCopy: 1 },
    });
    await assertCopyPermission(creature, this.userId);
    return getArchiveObj(creatureId);
  },
});

export default getCreatureArchive;
