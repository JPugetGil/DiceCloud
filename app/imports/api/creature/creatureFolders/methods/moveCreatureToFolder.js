import CreatureFolders from '/imports/api/creature/creatureFolders/CreatureFolders';
import Creatures from '/imports/api/creature/creatures/Creatures';
import { assertViewPermission } from '/imports/api/sharing/sharingPermissions';
import SimpleSchema from 'meteor/aldeed:simple-schema';
import { ValidatedMethod } from 'meteor/mdg:validated-method';
import { RateLimiterMixin } from 'ddp-rate-limiter-mixin';
import { Meteor } from 'meteor/meteor';

/**
 * Files a creature in one of the user's folders, out of the others; with no
 * folder, out of all of them. Ids only: unchecked, an object went into the
 * updates as an operator ({ $ne: null } emptied every folder of the user's).
 */
const moveCreatureToFolder = new ValidatedMethod({
  name: 'creatureFolders.methods.moveCreatureToFolder',
  validate: new SimpleSchema({
    creatureId: { type: String, max: 32 },
    // The character list sends null for "no folder"
    folderId: { type: String, max: 32, optional: true },
  }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit: {
    numRequests: 5,
    timeInterval: 5000,
  },
  async run({ creatureId, folderId }) {
    // Ensure logged in
    let userId = this.userId;
    if (!userId) {
      throw new Meteor.Error('creatureFolders.methods.updateName.denied',
        'You need to be logged in to remove a folder');
    }
    if (folderId) {
      // Check that this folder is owned by the user
      let existingFolder = await CreatureFolders.findOneAsync(folderId);
      if (existingFolder?.owner !== userId) {
        throw new Meteor.Error('creatureFolders.methods.updateName.denied',
          'This folder does not belong to you');
      }
      // A creature the user can see, as the character list shows them; taking
      // one out of the user's folders needs no right on it
      const creature = await Creatures.findOneAsync(creatureId, {
        fields: { owner: 1, readers: 1, writers: 1, public: 1 },
      });
      await assertViewPermission(creature, userId);
    }
    // Remove from other folders
    await CreatureFolders.updateAsync({
      owner: userId
    }, {
      $pull: { creatures: creatureId },
    }, {
      multi: true,
    });
    if (folderId) {
      // Add to this folder
      await CreatureFolders.updateAsync(folderId, {
        $addToSet: { creatures: creatureId },
      });
    }
  },
});

export default moveCreatureToFolder;
