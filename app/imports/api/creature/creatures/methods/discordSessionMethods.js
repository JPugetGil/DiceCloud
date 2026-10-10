import SimpleSchema from 'meteor/aldeed:simple-schema';
import { ValidatedMethod } from 'meteor/mdg:validated-method';
import { RateLimiterMixin } from 'ddp-rate-limiter-mixin';
import { Meteor } from 'meteor/meteor';
import Creatures from '/imports/api/creature/creatures/Creatures';
import { assertEditPermission } from '/imports/api/creature/creatures/creaturePermissions';
import { boardError } from '/imports/api/creature/creatureFolders/boardMonsters';
import { parseWebhookURL } from '/imports/api/creature/log/discord/webhookUrl';

/*
 * The sessions of a character's own Discord webhook (D3): "New session" in
 * its Discord settings opens a forum post, or a header message in a text
 * channel, and its log goes there until "End session". For those who may
 * edit the character, as the webhook.
 */

const rateLimit = { numRequests: 5, timeInterval: 10000 };

const creatureIdSchema = { creatureId: { type: String, max: 32 } };

async function getEditableCreature(creatureId, userId) {
  const creature = await Creatures.findOneAsync(creatureId, {
    fields: {
      name: 1, owner: 1, writers: 1, readers: 1, public: 1, type: 1, avatarPicture: 1, 'settings.discordWebhook': 1,
    },
  });
  await assertEditPermission(creature, userId);
  return creature;
}

/** Opens a session on the character's webhook; returns its kind and name */
export const startCharacterSession = new ValidatedMethod({
  name: 'creatures.discord.startSession',
  validate: new SimpleSchema({
    ...creatureIdSchema,
    timeZone: { type: String, optional: true, max: 64 },
  }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit,
  async run({ creatureId, timeZone }) {
    const creature = await getEditableCreature(creatureId, this.userId);
    // The server alone posts: a client may hold the settings without the webhook
    if (Meteor.isServer) {
      const webhook = parseWebhookURL(creature.settings?.discordWebhook);
      if (!webhook) throw boardError('discord.noWebhook', 'discord.errors.noWebhook');
      // Imported when called
      const { characterChannel, startSession } = await import('/imports/api/creature/log/server/discordWebhooks');
      const session = await startSession(await characterChannel(creature, webhook), timeZone);
      return { kind: session.kind, name: session.name };
    }
  },
});

/**
 * The party whose webhook is the character's own, if its rolls go there: the
 * party's session then applies to them, and the game master opens it (a
 * webhook posts each roll once). Returns `{ name }`, or null. It says nothing
 * of the party's webhook that its editor does not know: it is theirs
 */
export const characterPartyWebhook = new ValidatedMethod({
  name: 'creatures.discord.partyWebhook',
  validate: new SimpleSchema(creatureIdSchema).validator(),
  mixins: [RateLimiterMixin],
  rateLimit: { numRequests: 10, timeInterval: 10000 },
  async run({ creatureId }) {
    const creature = await getEditableCreature(creatureId, this.userId);
    if (Meteor.isServer) {
      const own = parseWebhookURL(creature.settings?.discordWebhook);
      if (!own) return null;
      const { logChannels } = await import('/imports/api/creature/log/server/discordWebhooks');
      const party = (await logChannels(creature))
        .find(channel => 'folderId' in channel.holder && channel.webhook.id === own.id);
      return party ? { name: party.label } : null;
    }
  },
});

/** Ends the character's session: its log goes to the channel again */
export const endCharacterSession = new ValidatedMethod({
  name: 'creatures.discord.endSession',
  validate: new SimpleSchema(creatureIdSchema).validator(),
  mixins: [RateLimiterMixin],
  rateLimit,
  async run({ creatureId }) {
    await getEditableCreature(creatureId, this.userId);
    await Creatures.updateAsync(creatureId, { $unset: { discordSession: 1 } });
  },
});
