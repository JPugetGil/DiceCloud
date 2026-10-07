import CreatureFolders from '/imports/api/creature/creatureFolders/CreatureFolders';
import { ValidatedMethod } from 'meteor/mdg:validated-method';
import { RateLimiterMixin } from 'ddp-rate-limiter-mixin';
import { Meteor } from 'meteor/meteor';

const removeCreatureFolder = new ValidatedMethod({
  name: 'creatureFolders.methods.remove',
  validate: null,
  mixins: [RateLimiterMixin],
  rateLimit: {
    numRequests: 5,
    timeInterval: 5000,
  },
  async run({ _id }) {
    // Ensure logged in
    let userId = this.userId;
    if (!userId) {
      throw new Meteor.Error('creatureFolders.methods.updateName.denied',
        'You need to be logged in to remove a folder');
    }
    // Check that this folder is owned by the user
    let existingFolder = await CreatureFolders.findOneAsync(_id);
    if (existingFolder?.owner !== userId) {
      throw new Meteor.Error('creatureFolders.methods.updateName.denied',
        'This folder does not belong to you');
    }
    // Its board's monsters go with it: the character list shows none, so they
    // would stay behind unseen. Imported when called, as monsterMethods does
    if (Meteor.isServer) {
      const { removeBoardMonsters } = await import('/imports/api/creature/creatureFolders/server/boardMonsters');
      await removeBoardMonsters(existingFolder);
    }
    // Remove
    return await CreatureFolders.removeAsync(_id);
  },
});

export default removeCreatureFolder;