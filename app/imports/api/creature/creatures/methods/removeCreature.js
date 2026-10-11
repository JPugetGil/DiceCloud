import SimpleSchema from 'meteor/aldeed:simple-schema';
import { ValidatedMethod } from 'meteor/mdg:validated-method';
import { RateLimiterMixin } from 'ddp-rate-limiter-mixin';
import { assertOwnership } from '/imports/api/creature/creatures/creaturePermissions';
import Creatures from '/imports/api/creature/creatures/Creatures';
import CreatureVariables from '/imports/api/creature/creatures/CreatureVariables';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import CreatureLogs from '/imports/api/creature/log/CreatureLogs';
import Experiences from '/imports/api/creature/experience/Experiences';
import { getFilter } from '/imports/api/parenting/parentingFunctions';
import { Meteor } from 'meteor/meteor';

async function removeRelatedDocuments(creatureId) {
  await CreatureVariables.removeAsync({ _creatureId: creatureId });
  await CreatureProperties.removeAsync(getFilter.descendantsOfRoot(creatureId));
  await CreatureLogs.removeAsync({ creatureId });
  await Experiences.removeAsync({ creatureId });
  // Server only, and imported when called: CreatureFolders loads its methods,
  // which reach this module, so importing it at the top is a load-order cycle
  if (Meteor.isServer) {
    const [{ removeFromAllFolders }, { default: EngineActions }] = await Promise.all([
      import('/imports/api/creature/creatureFolders/removeFromFolders'),
      import('/imports/api/engine/action/EngineActions'),
    ]);
    // Off every folder and initiative tracker, its owner's or another game master's
    await removeFromAllFolders([creatureId]);
    // The actions it started and never ran
    await EngineActions.removeAsync({ creatureId });
  }
}

const removeCreature = new ValidatedMethod({
  name: 'Creatures.methods.removeCreature', // DDP method name
  validate: new SimpleSchema({
    charId: {
      type: String,
      max: 32,
    },
  }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit: {
    numRequests: 5,
    timeInterval: 5000,
  },
  async run({ charId }) {
    await assertOwnership(charId, this.userId)
    this.unblock();
    await removeCreatureWork(charId)
  },
});

export async function removeCreatureWork(creatureId) {
  const connected = Meteor.isServer && (await Creatures.findOneAsync(creatureId, {
    fields: { 'discordChannel.webhookId': 1 },
  }))?.discordChannel?.webhookId;
  await Creatures.removeAsync(creatureId);
  await removeRelatedDocuments(creatureId);
  // Its Discord channel's webhook, once nothing else posts with it
  if (Meteor.isServer && connected) {
    const { releaseWebhook } = await import('/imports/api/creature/log/server/connectedWebhooks');
    const { discordApiBase } = await import('/imports/api/creature/log/server/webhookSender');
    await releaseWebhook(discordApiBase(), connected);
  }
}

export default removeCreature;
