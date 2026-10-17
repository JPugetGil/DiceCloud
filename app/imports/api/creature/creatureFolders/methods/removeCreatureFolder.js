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
    // would stay behind unseen. Imported when called, as monsterMethods does.
    // Its fight ends first: no creature's turn starts as they leave it
    if (Meteor.isServer) {
      await CreatureFolders.updateAsync(existingFolder._id, { $unset: { initiative: 1, initiativeStats: 1 } });
      const { removeBoardMonsters } = await import('/imports/api/creature/creatureFolders/server/boardMonsters');
      await removeBoardMonsters(existingFolder);
    }
    // Remove
    const removed = await CreatureFolders.removeAsync(_id);
    // Its Discord channel's webhook, once nothing else posts with it
    if (Meteor.isServer && existingFolder.discord?.channel?.webhookId) {
      const { releaseWebhook } = await import('/imports/api/creature/log/server/connectedWebhooks');
      const { discordApiBase } = await import('/imports/api/creature/log/server/webhookSender');
      await releaseWebhook(discordApiBase(), existingFolder.discord.channel.webhookId);
    }
    return removed;
  },
});

export default removeCreatureFolder;