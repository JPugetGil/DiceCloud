import SimpleSchema from 'meteor/aldeed:simple-schema';
import { ValidatedMethod } from 'meteor/mdg:validated-method';
import { RateLimiterMixin } from 'ddp-rate-limiter-mixin';
import { Meteor } from 'meteor/meteor';
import Creatures from '/imports/api/creature/creatures/Creatures';
import { assertEditPermission } from '/imports/api/creature/creatures/creaturePermissions';
import { boardError, GM_CREATURE_TYPES } from '/imports/api/creature/creatureFolders/boardMonsters';
import { isDiscordWebhookURL } from '/imports/api/creature/log/discord/webhookUrl';
import STORAGE_LIMITS from '/imports/constants/STORAGE_LIMITS';
import {
  refuseRemovedModes, removedSessionModes, threadIdSchema,
} from '/imports/api/creature/creatureFolders/methods/discordMethods';

/*
 * A character's own Discord webhook, pasted, and its sessions (D3): "New
 * session" in its Discord settings opens a forum post, or in a text channel a
 * thread the bot creates, and its log goes there until "End session";
 * "Resume a session" goes back into one of the last ones (discordSessions.ts).
 * For those who may edit the character, as the webhook.
 */

const rateLimit = { numRequests: 5, timeInterval: 10000 };

const creatureIdSchema = { creatureId: { type: String, max: 32 } };

async function getEditableCreature(creatureId, userId) {
  const creature = await Creatures.findOneAsync(creatureId, {
    fields: {
      name: 1, owner: 1, writers: 1, readers: 1, public: 1, type: 1, avatarPicture: 1,
      'settings.discordWebhook': 1, discordWebhookId: 1, discordWebhookChannelId: 1, discordWebhookChannelKind: 1, discordChannel: 1,
    },
  });
  await assertEditPermission(creature, userId);
  // Found: assertEditPermission throws otherwise
  return /** @type {import('/imports/api/creature/creatures/Creatures').Creature} */ (creature);
}

/**
 * Sets the character's pasted webhook, or removes it (and its session) when
 * empty. The URL is stored sealed (pastedWebhooks.ts): its editors get the
 * webhook's id back, never the URL. It replaces a connected channel (D4)
 */
export const setCharacterWebhook = new ValidatedMethod({
  name: 'creatures.discord.setWebhook',
  validate: new SimpleSchema({
    ...creatureIdSchema,
    webhook: { type: String, optional: true, max: STORAGE_LIMITS.url },
  }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit,
  async run({ creatureId, webhook }) {
    const creature = await getEditableCreature(creatureId, this.userId);
    const url = webhook?.trim();
    if (url && !isDiscordWebhookURL(url)) throw boardError('discord.invalid', 'discord.errors.invalidWebhook');
    // Its log is its game master's alone: none to set, one to remove still
    if (url && GM_CREATURE_TYPES.includes(creature.type)) throw boardError('discord.denied', 'discord.errors.gmCreature');
    // The server alone seals it
    if (Meteor.isServer) {
      if (creature.discordChannel) {
        const { disconnectTarget } = await import('/imports/api/creature/log/server/connectedWebhooks');
        const { discordApiBase } = await import('/imports/api/creature/log/server/webhookSender');
        await disconnectTarget(discordApiBase(), { creatureId });
      }
      if (!url) {
        await Creatures.updateAsync(creatureId, {
          $unset: {
            'settings.discordWebhook': 1, discordWebhookId: 1, discordWebhookChannelId: 1, discordWebhookChannelKind: 1,
            discordSession: 1, discordSessionHistory: 1,
          },
        });
        return;
      }
      const { pastedWebhookFields, learnPastedChannel } = await import('/imports/api/creature/log/server/pastedWebhooks');
      const { parseWebhookURL } = await import('/imports/api/creature/log/discord/webhookUrl');
      const { stored, webhookId } = /** @type {{ stored: string, webhookId: string }} */ (pastedWebhookFields(url));
      await Creatures.updateAsync(creatureId, {
        $set: { 'settings.discordWebhook': stored, discordWebhookId: webhookId },
        // Another webhook: the session and the channel were the old one's
        ...creature.discordWebhookId !== webhookId && {
          $unset: { discordSession: 1, discordWebhookChannelId: 1, discordWebhookChannelKind: 1 },
        },
      });
      // Where it posts, asked of Discord without waiting (D6)
      learnPastedChannel({ creatureId }, /** @type {any} */ (parseWebhookURL(url))).catch(e => console.warn(e));
    }
  },
});

/**
 * The character's channel for its sessions (server only): its webhook,
 * connected or pasted, unless it has none
 */
async function sessionsChannel(creature) {
  if (Meteor.isServer) {
    // Imported when called
    const { characterChannel, characterWebhook } = await import('/imports/api/creature/log/server/discordWebhooks');
    const webhook = await characterWebhook(creature);
    if (!webhook) throw boardError('discord.noWebhook', 'discord.errors.noWebhook');
    return characterChannel(creature, webhook);
  }
  // Only the server calls it
  throw new Meteor.Error('server-only', 'The server alone opens sessions');
}

const timeZoneSchema = { timeZone: { type: String, optional: true, max: 64 } };

/**
 * Opens a session on the character's webhook: a forum post, or in a text
 * channel a thread the bot creates. Returns its kind and name
 */
export const startCharacterSession = new ValidatedMethod({
  name: 'creatures.discord.startSession',
  validate: new SimpleSchema({ ...creatureIdSchema, ...timeZoneSchema, ...removedSessionModes }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit,
  async run({ creatureId, timeZone, threadLink }) {
    const creature = await getEditableCreature(creatureId, this.userId);
    refuseRemovedModes({ threadLink });
    // The server alone posts: a client may hold the settings without the webhook
    if (Meteor.isServer) {
      const channel = await sessionsChannel(creature);
      const { newSession } = await import('/imports/api/creature/log/server/discordSessions');
      const session = await newSession(channel, timeZone);
      return { kind: session.kind, name: session.name };
    }
  },
});

/** Resumes one of the character's last sessions, of the channel it posts in now */
export const resumeCharacterSession = new ValidatedMethod({
  name: 'creatures.discord.resumeSession',
  validate: new SimpleSchema({ ...creatureIdSchema, ...threadIdSchema, ...timeZoneSchema }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit,
  async run({ creatureId, threadId, timeZone }) {
    const creature = await getEditableCreature(creatureId, this.userId);
    if (Meteor.isServer) {
      const channel = await sessionsChannel(creature);
      const { resumeSession } = await import('/imports/api/creature/log/server/discordSessions');
      const session = await resumeSession(channel, threadId, timeZone);
      return { kind: session.kind, name: session.name, resumed: true };
    }
  },
});

/** Whether "New session" can work on the character's channel (`noBot`: a text channel without the bot) */
export const characterSessionAvailability = new ValidatedMethod({
  name: 'creatures.discord.sessionAvailability',
  validate: new SimpleSchema(creatureIdSchema).validator(),
  mixins: [RateLimiterMixin],
  rateLimit: { numRequests: 10, timeInterval: 10000 },
  async run({ creatureId }) {
    const creature = await getEditableCreature(creatureId, this.userId);
    if (Meteor.isServer) {
      const { characterChannel, characterWebhook } = await import('/imports/api/creature/log/server/discordWebhooks');
      const webhook = await characterWebhook(creature);
      if (!webhook) return { newSession: 'ready' };
      const { sessionAvailability } = await import('/imports/api/creature/log/server/discordSessions');
      return sessionAvailability(await characterChannel(creature, webhook));
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
      const { characterWebhook, destinationOf, logChannels, sameDestination } = await import('/imports/api/creature/log/server/discordWebhooks');
      const own = await characterWebhook(creature);
      if (!own) return null;
      // The same webhook, or the same channel
      const party = (await logChannels(creature))
        .find(channel => 'folderId' in channel.holder && sameDestination(destinationOf(channel), own));
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
    await Creatures.updateAsync(creatureId, { $unset: { discordSession: 1, discordSessionClosed: 1 } });
  },
});
