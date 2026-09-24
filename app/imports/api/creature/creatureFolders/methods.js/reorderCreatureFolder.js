import CreatureFolders from '/imports/api/creature/creatureFolders/CreatureFolders';
import { ValidatedMethod } from 'meteor/mdg:validated-method';
import { RateLimiterMixin } from 'ddp-rate-limiter-mixin';

const reorderCreatureFolder = new ValidatedMethod({
  name: 'creatureFolders.methods.reorder',
  validate: null,
  mixins: [RateLimiterMixin],
  rateLimit: {
    numRequests: 5,
    timeInterval: 5000,
  },
  async run({ _id, order }) {
    // Ensure logged in
    let userId = this.userId;
    if (!userId) {
      throw new Meteor.Error('creatureFolders.methods.reorder.denied',
        'You need to be logged in to reorder a folder');
    }
    // Check that this folder is owned by the user
    let existingFolder = await CreatureFolders.findOneAsync(_id);
    if (existingFolder.owner !== userId) {
      throw new Meteor.Error('creatureFolders.methods.reorder.denied',
        'This folder does not belong to you');
    }
    // First give it the new order, it should end in 0.5 putting it between two other docs
    await CreatureFolders.updateAsync(_id, { $set: { order } });
    this.unblock();
    // Reorder all the folders with integer numbers in this new order
    // Fetched up front and walked with for...of: an async callback handed to
    // cursor.forEach is never awaited, so the updates would overlap.
    // NOTE: this updates `_id` - the folder passed to the method - rather than
    // `folder._id`, so it rewrites that one folder's order on every iteration
    // instead of renumbering the list. That predates the Meteor 3 migration and
    // is left as-is here.
    const folders = await CreatureFolders.find({
      owner: userId
    }, {
      fields: { order: 1, },
      sort: { order: 1 }
    }).fetchAsync();
    for (const [index, folder] of folders.entries()) {
      if (folder.order !== index) {
        await CreatureFolders.updateAsync(_id, { $set: { order: index } })
      }
    }
  },
});

export default reorderCreatureFolder;
